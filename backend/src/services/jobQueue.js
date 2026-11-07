const mongoose = require('mongoose');
const { sendEmail } = require('./notificationService');

const SEND_EMAIL = 'send email';

let agenda = null;
let started = false;

/**
 * Background job queue, backed by the MongoDB connection the app already
 * holds — no extra infrastructure to provision or pay for.
 *
 * Its job is to get slow work off the request path. Sending a term's results
 * to 200 parents inline meant the publish request stayed open for the whole
 * fan-out, and a slow SMTP server made recording a payment feel broken.
 *
 * Two things about how agenda is loaded are load-bearing, and both were
 * wrong:
 *
 *   - agenda 6 is an ES module with a NAMED export, so `require('agenda')`
 *     handed back the namespace object. `new Agenda(...)` on that threw
 *     "Agenda is not a constructor" on every boot, in every environment.
 *   - agenda 6 also moved storage into separate packages. It no longer takes
 *     `mongo`/`db` options; it takes a `backend`, from
 *     `@agendajs/mongo-backend`.
 *
 * Between them the queue had never actually started. It failed safe — every
 * caller falls back to sending inline — so nothing was lost, but nothing was
 * ever queued or retried either, which is exactly the fan-out this exists to
 * prevent.
 *
 * Both packages are loaded with `await import()` inside startJobQueue rather
 * than required at the top. Requiring ESM at module scope made this file
 * unloadable under Jest ("Cannot use import statement outside a module"), and
 * that spread: any module importing this one became untestable too, which is
 * why `buildFeeLedger` had to be split into its own dependency-free service.
 * Loading on start confines the ESM boundary to the one function that needs
 * it.
 */
const startJobQueue = async () => {
  if (started) return agenda;

  try {
    // Started after the app's own connection, so a database that is down
    // stops here with a clear message instead of inside Agenda.
    if (!mongoose.connection?.db || !process.env.MONGO_URI) {
      throw new Error('MongoDB connection is not ready');
    }

    const [{ Agenda, exponential }, { MongoBackend }] = await Promise.all([
      import('agenda'),
      import('@agendajs/mongo-backend'),
    ]);

    agenda = new Agenda({
      // Its own connection, from the connection string. It used to borrow
      // Mongoose's, but the two come with different MongoDB drivers (Mongoose
      // bundles driver 6, this backend resolved driver 7), and every poll
      // failed with "Unsupported BSON version". Agenda reported that only
      // through an 'error' event nobody listened to, so every email sat in the
      // jobs collection for good, without a single line in the log.
      backend: new MongoBackend({
        address: process.env.MONGO_URI,
        collection: 'jobs',
      }),
      processEvery: '20 seconds',
      maxConcurrency: 5,
      defaultConcurrency: 3,
    });

    // Handler second, options third: Agenda 6's order. This was written the
    // other way round, so Agenda took the options object for the handler and
    // never ran the real one. Every email was queued and none was ever sent,
    // and nothing failed, so nothing was logged and nothing reached the mail
    // provider.
    agenda.define(
      SEND_EMAIL,
      async (job) => {
        const { to, subject, html, text } = job.attrs.data || {};
        if (!to) return;

        const { success, error } = await sendEmail({ to, subject, html, text });

        // Throwing marks the job failed, which is what triggers Agenda's
        // retry backoff. Returning quietly would silently drop the email.
        if (!success) {
          throw new Error(error || 'Email send failed');
        }
      },
      {
        concurrency: 3,

        // Throwing below only marks a job failed. Agenda retries nothing
        // unless a backoff is configured, and none was — so one SMTP hiccup
        // dropped the email for good while enqueueEmail had already reported
        // it as queued. 30s, 2m, 8m, 32m, then give up.
        backoff: exponential({
          delay: 30 * 1000,
          factor: 4,
          maxRetries: 4,
          jitter: 0.2,
        }),

        // The job record holds the whole message, and the welcome email's body
        // is a temporary password in plain text. Agenda keeps finished jobs
        // forever by default, which left every credential ever issued sitting
        // in the `jobs` collection. Delete a job as soon as it has been sent.
        removeOnComplete: true,
      },
    );

    // Anything Agenda itself cannot do, such as reaching its collection. This
    // is the listener whose absence hid the BSON failure above.
    agenda.on('error', (err) => {
      console.error(`⚠️  Job queue error: ${err.message}`);
    });

    agenda.on('fail:' + SEND_EMAIL, (err, job) => {
      console.error(
        `Email job failed (attempt ${job.attrs.failCount}) for ${job.attrs.data?.to}: ${err.message}`,
      );
    });

    // A job that has used up its retries is dead, and still carries the
    // message. Log it for whoever is watching, then drop it with its content.
    agenda.on('retry exhausted:' + SEND_EMAIL, async (err, job) => {
      console.error(
        `Email to ${job.attrs.data?.to} abandoned after ${job.attrs.failCount} attempts: ${err.message}`,
      );
      try {
        await job.remove();
      } catch (removeError) {
        console.error(
          `Could not remove failed email job: ${removeError.message}`,
        );
      }
    });

    await agenda.start();
    started = true;
    console.log('📮 Job queue started');

    return agenda;
  } catch (error) {
    console.error(`⚠️  Job queue failed to start: ${error.message}`);
    agenda = null;
    started = false;
    return null;
  }
};

/**
 * Queue an email.
 *
 * If the queue is unavailable the email is sent inline instead — degraded, but
 * the message still goes out. Silently dropping a payment receipt because a
 * background worker is down would be worse than a slow response.
 */
const enqueueEmail = async ({ to, subject, html, text }) => {
  if (!to) return { success: false, queued: false, error: 'No recipient' };

  // Every return carries a `success` flag with the same meaning as
  // sendEmail's, so a caller can check one field regardless of whether the
  // message was queued or sent inline. Accepted-for-delivery counts as
  // success: the queue retries, so a transient SMTP fault is not the
  // caller's problem.
  if (!agenda || !started) {
    const result = await sendEmail({ to, subject, html, text });
    return { queued: false, sentInline: true, ...result };
  }

  try {
    // now(), not create() + save(). Agenda 6's create() sets no run time, so a
    // saved job had no nextRunAt and the processor, which looks for jobs that
    // are due, never picked it up.
    await agenda.now(SEND_EMAIL, { to, subject, html, text });

    return { success: true, queued: true };
  } catch (error) {
    console.error(`Could not queue email to ${to}: ${error.message}`);
    const result = await sendEmail({ to, subject, html, text });
    return { queued: false, sentInline: true, ...result };
  }
};

/**
 * Queue the same message to many recipients.
 */
const enqueueBulkEmail = async (recipients = [], buildMessage) => {
  const results = await Promise.allSettled(
    recipients
      .filter((r) => r?.email)
      .map((recipient) => enqueueEmail(buildMessage(recipient))),
  );

  const queued = results.filter((r) => r.status === 'fulfilled').length;

  return { queued, total: recipients.length };
};

const stopJobQueue = async () => {
  if (agenda && started) {
    await agenda.stop();
    started = false;
    console.log('📮 Job queue stopped');
  }
};

module.exports = {
  startJobQueue,
  stopJobQueue,
  enqueueEmail,
  enqueueBulkEmail,
  SEND_EMAIL,
};
