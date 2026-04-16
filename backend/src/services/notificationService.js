const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
};

/**
 * Send a single email
 */
const sendEmail = async ({ to, subject, html, text }) => {
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
      sendEmail({ to: r.email, subject, html: htmlTemplate(r) })
    )
  );
  const sent = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
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
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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

const emailTemplates = {
  welcome: ({ firstName, email, password, role, loginUrl }) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e3a5f;padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;">School Management Portal</h1>
      </div>
      <div style="padding:30px;background:#f9f9f9;">
        <h2>Welcome, ${firstName}!</h2>
        <p>Your <strong>${role}</strong> account has been created.</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> <code style="background:#eee;padding:4px 8px;">${password}</code></p>
        <p>Please log in and change your password immediately.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;margin:16px 0;">Log In Now</a>
        <p style="color:#999;font-size:12px;margin-top:24px;">If you did not expect this email, please contact the school admin.</p>
      </div>
    </div>
  `,

  paymentReceipt: ({ studentName, receiptNumber, amount, term, academicYear, date }) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e3a5f;padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;">Payment Receipt</h1>
      </div>
      <div style="padding:30px;">
        <p><strong>Receipt No:</strong> ${receiptNumber}</p>
        <p><strong>Student:</strong> ${studentName}</p>
        <p><strong>Amount Paid:</strong> ₦${amount.toLocaleString()}</p>
        <p><strong>Term:</strong> ${term} — ${academicYear}</p>
        <p><strong>Date:</strong> ${new Date(date).toLocaleDateString('en-NG', { dateStyle: 'full' })}</p>
        <p style="color:#27ae60;font-weight:bold;">✅ Payment Confirmed</p>
      </div>
    </div>
  `,

  announcement: ({ title, body, senderName, schoolName }) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e3a5f;padding:24px 30px;">
        <h1 style="color:#fff;margin:0;font-size:18px;">${schoolName || 'School Management Portal'}</h1>
      </div>
      <div style="padding:30px;background:#f9f9f9;">
        <h2 style="color:#1e3a5f;">${title}</h2>
        <div style="background:#fff;padding:20px;border-left:4px solid #1e3a5f;border-radius:4px;">
          ${body}
        </div>
        <p style="margin-top:20px;color:#666;">— ${senderName}</p>
      </div>
    </div>
  `,

  resultPublished: ({ studentName, term, academicYear, average, position, loginUrl }) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e3a5f;padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;">Results Published</h1>
      </div>
      <div style="padding:30px;">
        <p>Dear parent/guardian of <strong>${studentName}</strong>,</p>
        <p>The <strong>${term} (${academicYear})</strong> results are now available.</p>
        <ul>
          <li><strong>Average Score:</strong> ${average}%</li>
          <li><strong>Position:</strong> ${position}</li>
        </ul>
        <a href="${loginUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">View Full Report Card</a>
      </div>
    </div>
  `,
};

module.exports = { sendEmail, sendBulkEmails, sendSMS, emailTemplates };
