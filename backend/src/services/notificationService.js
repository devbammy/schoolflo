const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
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
  getTransporter().verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log('SMTP Ready');
    }
  });

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

const emailTemplates = {
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

  paymentReceipt: ({
    studentName,
    receiptNumber,
    amount,
    term,
    academicYear,
    date,
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
            <p style="color: #7889a8; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; margin-bottom: 8px;">Amount Paid</p>
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
          </table>

          <div style="margin-top: 30px; padding: 15px; background: #ecfdf5; border-radius: 8px; color: #065f46; text-align: center; font-size: 14px; font-weight: 500;">
            This is an official electronic receipt for your records.
          </div>
        </div>
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
};

module.exports = { sendEmail, sendBulkEmails, sendSMS, emailTemplates };
