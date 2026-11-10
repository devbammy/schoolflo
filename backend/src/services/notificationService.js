const nodemailer = require('nodemailer');
const { hasMailbox } = require('../utils/mailbox');

let transporter;

// How long to wait on the mail provider before giving up. Nodemailer's own
// default is two minutes, so on a host that silently drops SMTP traffic every
// send held a worker for two minutes and the startup check logged nothing for
// as long, which reads as "email was never tried".
const MAIL_TIMEOUT_MS = 10 * 1000;

/**
 * Resend's HTTP API, used whenever RESEND_API_KEY is set.
 *
 * Over HTTPS rather than SMTP because some hosts block outbound SMTP ports
 * (25, 465, 587) outright, Render's free plan among them, and from inside the
 * app that looks exactly like a slow mail server: nothing arrives, nothing
 * reaches the provider's dashboard, and no error comes back for minutes.
 */
const usingResendApi = () => Boolean(process.env.RESEND_API_KEY);

const sendViaResend = async ({ to, subject, html, text }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Resend explains itself ("The domain is not verified", "API key is
    // invalid"), and that is the line whoever reads the log needs.
    throw new Error(
      `Resend ${response.status}: ${body.message || response.statusText}`,
    );
  }
  return { messageId: body.id };
};

const getTransporter = () => {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via
      // STARTTLS, which nodemailer does automatically.
      secure: port === 465,
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: MAIL_TIMEOUT_MS,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Certificate validation stays on. It was previously disabled, which
      // left SMTP credentials and every email body open to interception.
      // Self signed certs on a local mail server are the only legitimate
      // reason to relax it, so that needs an explicit opt in.
      tls: {
        rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED !== 'true',
      },
      pool: true,
      maxConnections: 3,
    });
  }
  return transporter;
};

/**
 * Verify the SMTP connection once at startup rather than before every send.
 * Called from server.js; failures are logged, never fatal.
 */
const verifyTransport = async () => {
  if (usingResendApi()) {
    // No call is made here: a sending-only key cannot read anything back, so
    // a check would report a working key as broken. The first send says
    // whether it works, in the log, with Resend's own reason if not.
    console.log(`📧 Email via the Resend API, from ${process.env.FROM_EMAIL}`);
    return true;
  }

  if (!process.env.SMTP_HOST) {
    console.warn('⚠️  SMTP_HOST is not set — outbound email is disabled');
    return false;
  }

  try {
    await getTransporter().verify();
    console.log('📧 SMTP connection verified');
    return true;
  } catch (error) {
    console.error(`⚠️  SMTP verification failed: ${error.message}`);
    return false;
  }
};

/**
 * Send a single email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  // A student who signs in with an admission number has an address that can
  // never receive mail. Not an error: there is simply nobody to send it to.
  if (!hasMailbox(to)) {
    return { success: false, skipped: true, error: 'No mailbox' };
  }

  if (usingResendApi()) {
    try {
      const { messageId } = await sendViaResend({ to, subject, html, text });
      return { success: true, messageId };
    } catch (error) {
      console.error(`Email send error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  if (!process.env.SMTP_HOST) {
    return { success: false, error: 'Email is not configured' };
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
      text,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Email send error: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send bulk emails
 */
const sendBulkEmails = async (recipients, subject, htmlTemplate) => {
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, html: htmlTemplate(r) }),
    ),
  );
  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success,
  ).length;
  const failed = recipients.length - sent;
  return { sent, failed, total: recipients.length };
};

/**
 * Send SMS via Twilio
 */
const sendSMS = async (to, body) => {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID) {
      console.warn('Twilio not configured — SMS skipped');
      return { success: false, error: 'SMS gateway not configured' };
    }
    const twilio = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
    const msg = await twilio.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return { success: true, sid: msg.sid };
  } catch (error) {
    console.error(`SMS send error: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────

const rawTemplates = {
  welcome: ({ firstName, email, password, role, loginUrl }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 28, 63, 0.1);">
        <div style="background: #1a4fab; padding: 40px 20px; text-align: center;">
          <div style="background: rgba(255,255,255,0.1); width: 60px; height: 60px; border-radius: 12px; margin: 0 auto 16px; line-height: 60px; color: #fff; font-size: 24px; font-weight: bold;">S</div>
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.5px;">Welcome to the Portal</h1>
        </div>
        <div style="padding: 40px; color: #3d4f73; line-height: 1.6;">
          <h2 style="color: #0f1c3f; margin-top: 0;">Hello, ${firstName}!</h2>
          <p style="font-size: 16px;">Your <strong>${role}</strong> account has been successfully provisioned. You can now access your dashboard using the credentials below:</p>
          
          <div style="background: #f0f4fb; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #dde3f0;">
            <p style="margin: 0 0 12px 0;"><strong>Email:</strong> <span style="color: #1a4fab;">${email}</span></p>
            <p style="margin: 0;"><strong>Temp Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #dde3f0; color: #ef4444; font-family: monospace;">${password}</code></p>
          </div>

          <a href="${loginUrl}" style="display: block; background: #1a4fab; color: #ffffff; padding: 16px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(26, 79, 171, 0.2);">Log In to Dashboard</a>
          
          <p style="color: #7889a8; font-size: 13px; margin-top: 32px; text-align: center;">For security reasons, please change your temporary password immediately after your first login.</p>
        </div>
      </div>
    </div>
  `,

  passwordReset: ({ firstName, resetUrl, expiryMinutes }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 28, 63, 0.1);">
        <div style="background: #1a4fab; padding: 40px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.5px;">Reset Your Password</h1>
        </div>
        <div style="padding: 40px; color: #3d4f73; line-height: 1.6;">
          <h2 style="color: #0f1c3f; margin-top: 0;">Hello, ${firstName}!</h2>
          <p style="font-size: 16px;">We received a request to reset the password on your account. Click the button below to choose a new one.</p>

          <a href="${resetUrl}" style="display: block; background: #1a4fab; color: #ffffff; padding: 16px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; font-size: 16px; margin: 28px 0; box-shadow: 0 4px 12px rgba(26, 79, 171, 0.2);">Choose a New Password</a>

          <div style="background: #fff7ed; border-radius: 12px; padding: 16px; border: 1px solid #fed7aa; color: #9a3412; font-size: 14px;">
            This link expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
          </div>

          <p style="color: #7889a8; font-size: 13px; margin-top: 32px;">If you didn't request this, you can safely ignore this email — your password will stay as it is.</p>
        </div>
      </div>
    </div>
  `,

  paymentReceipt: ({
    studentName,
    receiptNumber,
    amount,
    term,
    academicYear,
    date,
    method,
    feeTitle,
    outstanding = 0,
  }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 28, 63, 0.1);">
        <div style="padding: 30px; text-align: center; border-bottom: 2px dashed #dde3f0;">
          <div style="color: #10b981; font-size: 48px; margin-bottom: 10px;">✔</div>
          <h1 style="color: #0f1c3f; margin: 0; font-size: 22px;">Payment Confirmed</h1>
          <p style="color: #7889a8; margin: 5px 0 0 0;">Receipt #${receiptNumber}</p>
        </div>
        <div style="padding: 40px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #7889a8; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; margin-bottom: 8px;">${outstanding > 0 ? 'Part-Payment Received' : 'Amount Paid'}</p>
            <h2 style="color: #1a4fab; font-size: 36px; margin: 0;">₦${amount.toLocaleString()}</h2>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; color: #3d4f73; font-size: 15px;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb;"><strong>Student</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb; text-align: right;">${studentName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb;"><strong>Session</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb; text-align: right;">${term}, ${academicYear}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb;"><strong>Date</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb; text-align: right;">${new Date(date).toLocaleDateString('en-NG', { dateStyle: 'long' })}</td>
            </tr>
            ${
              feeTitle
                ? `<tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb;"><strong>Fee</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb; text-align: right;">${feeTitle}</td>
            </tr>`
                : ''
            }
            ${
              method
                ? `<tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb;"><strong>Method</strong></td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f0f4fb; text-align: right;">${method}</td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding: 12px 0;"><strong>Balance remaining</strong></td>
              <td style="padding: 12px 0; text-align: right; font-weight: 600; color: ${outstanding > 0 ? '#b45309' : '#065f46'};">${outstanding > 0 ? `₦${outstanding.toLocaleString()}` : 'Nil'}</td>
            </tr>
          </table>

          ${
            outstanding > 0
              ? `<div style="margin-top: 30px; padding: 15px; background: #fffbeb; border-radius: 8px; color: #92400e; text-align: center; font-size: 14px; font-weight: 500;">
            ₦${outstanding.toLocaleString()} is still outstanding on this fee. The balance can be paid online, or in cash at the school office.
          </div>`
              : ''
          }

          <div style="margin-top: 16px; padding: 15px; background: #ecfdf5; border-radius: 8px; color: #065f46; text-align: center; font-size: 14px; font-weight: 500;">
            This is an official electronic receipt for your records.
          </div>
        </div>
      </div>
    </div>
  `,

  assignmentGiven: ({ subject, title, dueDate, teacherName, portalUrl }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border-left: 6px solid #7c3aed;">
        <div style="padding: 30px;">
          <div style="color: #7c3aed; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px;">New Assignment</div>
          <h2 style="color: #0f1c3f; margin: 0 0 10px 0;">${title}</h2>
          <p style="color: #3d4f73; margin: 0;"><strong>Subject:</strong> ${subject}</p>
          <p style="color: #3d4f73; margin: 5px 0 20px 0;"><strong>Teacher:</strong> ${teacherName}</p>
          
          <div style="background: #f5f3ff; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
            <p style="margin: 0; color: #5b21b6; font-size: 14px;">📅 Deadline: <strong>${new Date(dueDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</strong></p>
          </div>
          
          <a href="${portalUrl}" style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open Assignment</a>
        </div>
      </div>
    </div>
  `,

  assignmentSubmitted: ({ studentName, title, submissionTime }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; text-align: center; padding: 40px;">
        <div style="width: 60px; height: 60px; background: #d1fae5; color: #059669; border-radius: 50%; line-height: 60px; font-size: 24px; margin: 0 auto 20px;">✓</div>
        <h2 style="color: #0f1c3f; margin: 0;">Submission Received</h2>
        <p style="color: #3d4f73; margin: 15px 0;">Hi ${studentName}, your work for <strong>"${title}"</strong> was successfully uploaded.</p>
        <p style="color: #7889a8; font-size: 13px;">Time: ${submissionTime}</p>
      </div>
    </div>
  `,

  announcement: ({ title, body, senderName, schoolName }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border-top: 6px solid #1a4fab;">
        <div style="padding: 40px;">
          <p style="color: #1a4fab; font-weight: 700; text-transform: uppercase; font-size: 12px; margin-bottom: 12px; letter-spacing: 1px;">Official Announcement</p>
          <h1 style="color: #0f1c3f; margin: 0 0 20px 0; font-size: 26px; line-height: 1.3;">${title}</h1>
          
          <div style="color: #3d4f73; line-height: 1.8; font-size: 16px;">
            ${body}
          </div>

          <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #dde3f0; display: flex; align-items: center;">
            <div style="width: 40px; height: 40px; background: #1a4fab; border-radius: 50%; text-align: center; line-height: 40px; color: #fff; font-weight: bold; margin-right: 12px;">${senderName[0]}</div>
            <div>
              <p style="margin: 0; color: #0f1c3f; font-weight: 600;">${senderName}</p>
              <p style="margin: 0; color: #7889a8; font-size: 13px;">${schoolName || 'Administration'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  examSchedule: ({ studentName, examTitle, sessions, viewUrl }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
        <div style="background: #0f1c3f; padding: 30px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">${examTitle} Timetable</h2>
        </div>
        <div style="padding: 30px;">
          <p style="color: #3d4f73;">Hi ${studentName}, here are your upcoming exam sessions:</p>
          <div style="margin: 20px 0;">
            ${sessions
              .map(
                (s) => `
              <div style="padding: 15px; border-bottom: 1px solid #f0f4fb; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                  <div style="font-weight: 700; color: #0f1c3f;">${s.subject}</div>
                  <div style="font-size: 13px; color: #7889a8;">${s.date} • ${s.time}</div>
                </div>
                <div style="background: #f0f4fb; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #1a4fab; font-weight: 600;">${s.venue}</div>
              </div>
            `,
              )
              .join('')}
          </div>
          <a href="${viewUrl}" style="display: block; background: #1a4fab; color: #ffffff; padding: 14px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; margin-top: 20px;">Download Full Timetable</a>
        </div>
      </div>
    </div>
  `,

  libraryDue: ({ studentName, bookTitle, dueDate, renewalUrl }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border-top: 6px solid #ef4444;">
        <div style="padding: 30px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 10px;">📚</div>
          <h2 style="color: #0f1c3f; margin: 0;">Library Book Due Soon</h2>
          <p style="color: #3d4f73; margin-top: 10px;">Hi ${studentName}, the following book is due for return.</p>
          
          <div style="margin: 25px 0; padding: 20px; background: #fff5f5; border-radius: 12px; border: 1px solid #fee2e2;">
            <p style="margin: 0; color: #991b1b; font-weight: 700; font-size: 18px;">${bookTitle}</p>
            <p style="margin: 5px 0 0 0; color: #b91c1c; font-size: 14px;">Return by: <strong>${new Date(dueDate).toLocaleDateString()}</strong></p>
          </div>
          
          <a href="${renewalUrl}" style="color: #1a4fab; font-weight: 600; text-decoration: none; font-size: 15px;">Request a Renewal &rarr;</a>
        </div>
      </div>
    </div>
  `,

  resultPublished: ({
    studentName,
    term,
    academicYear,
    average,
    position,
    loginUrl,
  }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 28, 63, 0.1);">
        <div style="background: linear-gradient(135deg, #1a4fab 0%, #0f3275 100%); padding: 40px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Academic Performance Update</h1>
        </div>
        <div style="padding: 40px;">
          <p style="color: #3d4f73; font-size: 16px;">Dear Parent/Guardian,</p>
          <p style="color: #3d4f73; font-size: 16px;">The performance report for <strong>${studentName}</strong> for the <strong>${term} (${academicYear})</strong> is now ready for review.</p>
          
          <div style="display: flex; justify-content: space-between; gap: 15px; margin: 30px 0;">
            <div style="flex: 1; background: #f0f4fb; padding: 20px; border-radius: 12px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #7889a8; text-transform: uppercase;">Average</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #1a4fab;">${average}%</p>
            </div>
            <div style="flex: 1; background: #f0f4fb; padding: 20px; border-radius: 12px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #7889a8; text-transform: uppercase;">Class Position</p>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: #7c3aed;">${position}</p>
            </div>
          </div>

          <a href="${loginUrl}" style="display: block; background: #1a4fab; color: #ffffff; padding: 16px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; font-size: 16px;">View Full Report Card</a>
        </div>
      </div>
    </div>
  `,

  // The results email for a family whose fees are not cleared. It says the
  // result exists and what is owed, and carries no score: the average and
  // position in resultPublished are exactly what the portal is withholding.
  resultWithheld: ({
    studentName,
    term,
    academicYear,
    outstanding,
    loginUrl,
  }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 28, 63, 0.1);">
        <div style="background: linear-gradient(135deg, #1a4fab 0%, #0f3275 100%); padding: 40px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Results Are Ready</h1>
        </div>
        <div style="padding: 40px;">
          <p style="color: #3d4f73; font-size: 16px;">Dear Parent/Guardian,</p>
          <p style="color: #3d4f73; font-size: 16px;">The <strong>${term} (${academicYear})</strong> results for <strong>${studentName}</strong> have been published.</p>
          <div style="background: #fff7ed; border: 1px solid #fed7aa; padding: 20px; border-radius: 12px; margin: 30px 0;">
            <p style="margin: 0; color: #9a3412; font-size: 15px;">Results can be viewed and printed once school fees are paid in full. The outstanding balance is <strong>${outstanding}</strong>.</p>
          </div>
          <a href="${loginUrl}" style="display: block; background: #1a4fab; color: #ffffff; padding: 16px; border-radius: 10px; text-decoration: none; text-align: center; font-weight: 600; font-size: 16px;">Sign In to See Fees</a>
        </div>
      </div>
    </div>
  `,

  certificateIssued: ({
    recipientName,
    studentName,
    certificateType,
    certificateNumber,
    issueDate,
    downloadUrl,
    issuerName,
  }) => `
    <div style="background-color: #f7fafc; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 28, 63, 0.08);">
        <div style="background: #1a4fab; padding: 30px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px;">${certificateType} Issued</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.85;">Hello ${recipientName}, your document is ready.</p>
        </div>
        <div style="padding: 35px; color: #3d4f73; line-height: 1.7;">
          <p style="margin: 0 0 20px 0;">${studentName}'s <strong>${certificateType}</strong> has been issued successfully.</p>
          <p style="margin: 0 0 10px 0;"><strong>Certificate Number:</strong> ${certificateNumber}</p>
          <p style="margin: 0 0 10px 0;"><strong>Issued On:</strong> ${issueDate}</p>
          <p style="margin: 0 0 24px 0;">You can download or view the certificate using the button below.</p>
          <a href="${downloadUrl}" style="display: inline-block; background: #1a4fab; color: #ffffff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">View Certificate</a>
          <div style="margin-top: 28px; padding: 20px; background: #eff6ff; border-radius: 14px;">
            <p style="margin: 0; font-size: 14px; color: #475569;">If you have questions, contact ${issuerName} or visit the school portal.</p>
          </div>
        </div>
      </div>
    </div>
  `,

  certificateRevoked: ({
    recipientName,
    studentName,
    certificateType,
    certificateNumber,
    revokeReason,
    revokedAt,
    helpUrl,
  }) => `
    <div style="background-color: #f8fafc; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 28, 63, 0.08);">
        <div style="background: #dc2626; padding: 30px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px;">Certificate Revoked</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.85;">Hello ${recipientName}, please review the update below.</p>
        </div>
        <div style="padding: 35px; color: #334155; line-height: 1.7;">
          <p style="margin: 0 0 20px 0;">The <strong>${certificateType}</strong> for <strong>${studentName}</strong> has been revoked.</p>
          <p style="margin: 0 0 10px 0;"><strong>Certificate Number:</strong> ${certificateNumber}</p>
          <p style="margin: 0 0 10px 0;"><strong>Revoked On:</strong> ${revokedAt}</p>
          <p style="margin: 0 0 24px 0;"><strong>Reason:</strong> ${revokeReason}</p>
          <a href="${helpUrl}" style="display: inline-block; background: #1a4fab; color: #ffffff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;">Visit Portal for Details</a>
        </div>
      </div>
    </div>
  `,

  leavingCertificate: ({
    studentName,
    academicYear,
    completionDate,
    schoolName,
  }) => `
    <div style="background-color: #f0f4fb; padding: 50px 20px; font-family: 'Georgia', serif;">
      <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border: 15px double #1a4fab; padding: 50px; text-align: center; position: relative;">
        <h1 style="color: #0f1c3f; font-size: 32px; margin-bottom: 10px;">Certificate of Completion</h1>
        <p style="font-size: 18px; font-style: italic; color: #7889a8;">This is to certify that</p>
        <h2 style="font-size: 36px; color: #1a4fab; margin: 20px 0; border-bottom: 2px solid #f0f4fb; display: inline-block; padding: 0 30px;">${studentName}</h2>
        <p style="font-size: 18px; color: #3d4f73; line-height: 1.6;">has satisfactorily completed the course of study prescribed by<br><strong>${schoolName}</strong></p>
        <p style="font-size: 18px; color: #3d4f73;">during the academic year <strong>${academicYear}</strong></p>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between; border-top: 1px solid #dde3f0; padding-top: 20px;">
          <div style="text-align: left;">
            <p style="font-size: 14px; margin: 0;">Date: ${completionDate}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 14px; margin: 0; font-weight: bold;">School Principal</p>
          </div>
        </div>
      </div>
    </div>
  `,

  taskAssigned: ({
    teacherName,
    title,
    description,
    priority,
    dueDate,
    assignedByName,
    portalUrl,
  }) => `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border-left: 6px solid #0891b2;">
        <div style="padding: 30px;">
          <div style="color: #0891b2; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px;">New Task Assigned</div>
          <h2 style="color: #0f1c3f; margin: 0 0 10px 0;">${title}</h2>
          <p style="color: #3d4f73; margin: 0 0 15px 0;">Hi ${teacherName}, ${assignedByName} has assigned you a task.</p>
          ${description ? `<p style="color: #3d4f73; margin: 0 0 20px 0;">${description}</p>` : ''}

          <div style="background: #ecfeff; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
            <p style="margin: 0; color: #0e7490; font-size: 14px;">📅 Due: <strong>${new Date(dueDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}</strong></p>
            <p style="margin: 6px 0 0 0; color: #0e7490; font-size: 14px;">⚑ Priority: <strong>${priority}</strong></p>
          </div>

          <a href="${portalUrl}" style="display: inline-block; background: #0891b2; color: #ffffff; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open Task</a>
        </div>
      </div>
    </div>
  `,

  taskReviewed: ({ teacherName, title, decision, comment, portalUrl }) => {
    const approved = decision === 'approved';
    const accent = approved ? '#059669' : '#dc2626';
    const tint = approved ? '#d1fae5' : '#fee2e2';

    return `
    <div style="background-color: #f0f4fb; padding: 40px 20px; font-family: 'Segoe UI', Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border-left: 6px solid ${accent};">
        <div style="padding: 30px;">
          <div style="color: ${accent}; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 5px;">Task ${approved ? 'Approved' : 'Sent Back'}</div>
          <h2 style="color: #0f1c3f; margin: 0 0 10px 0;">${title}</h2>
          <p style="color: #3d4f73; margin: 0 0 20px 0;">Hi ${teacherName}, your submission was ${approved ? 'approved' : 'returned for changes'}.</p>
          ${
            comment
              ? `<div style="background: ${tint}; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                   <p style="margin: 0; color: #0f1c3f; font-size: 14px;">${comment}</p>
                 </div>`
              : ''
          }
          <a href="${portalUrl}" style="display: inline-block; background: ${accent}; color: #ffffff; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Task</a>
        </div>
      </div>
    </div>
  `;
  },
};

/**
 * Every template interpolates its arguments straight into HTML, and several of
 * those arguments are typed by users: an announcement's title and body, a
 * task's description, a certificate's revoke reason, a name from a CSV. A
 * Teacher could therefore put markup — a phishing link, a tracking pixel —
 * into a message the school's own address then sends to every parent.
 *
 * Escaping happens here, once, for every template, rather than at each
 * `${...}`, so a template added later is safe without anyone remembering to.
 */
const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeDeep = (value) => {
  if (typeof value === 'string') return escapeHtml(value);
  if (Array.isArray(value)) return value.map(escapeDeep);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, escapeDeep(inner)]),
    );
  }
  return value; // numbers, dates, booleans, null
};

const emailTemplates = Object.fromEntries(
  Object.entries(rawTemplates).map(([name, render]) => [
    name,
    (args = {}) => render(escapeDeep(args)),
  ]),
);

// An announcement body is plain text typed into a box, so its line breaks mean
// something. Escape first, then turn them into <br> — never the other way.
emailTemplates.announcement = (args = {}) =>
  rawTemplates.announcement({
    ...escapeDeep(args),
    body: escapeHtml(args.body ?? '').replace(/\r?\n/g, '<br>'),
  });

module.exports = {
  sendEmail,
  sendBulkEmails,
  sendSMS,
  verifyTransport,
  emailTemplates,
};
