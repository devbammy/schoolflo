const mongoose = require('mongoose');
const Agenda = require('agenda');
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
 */
const startJobQueue = async () => {
  if (started) return agenda;

  try {
    agenda = new Agenda({
      mongo: mongoose.connection.db,
      db: { collection: 'jobs' },
      processEvery: '20 seconds',
      maxConcurrency: 5,
      defaultConcurrency: 3,
    });

    agenda.define(
      SEND_EMAIL,
      { priority: 'normal', concurrency: 3 },
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
    );

    agenda.on('fail:' + SEND_EMAIL, (err, job) => {
      console.error(
        `Email job failed (attempt ${job.attrs.failCount}) for ${job.attrs.data?.to}: ${err.message}`,
      );
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
    const job = agenda.create(SEND_EMAIL, { to, subject, html, text });
    job.attrs.failCount = 0;
    await job.save();

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
