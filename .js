await Promise.all(
  recipients.map(async (recipient) => {
    try {
      await sendEmail({
        to: recipient.email,
        subject: `${payload.certificateType} Revoked — ${payload.certificateNumber}`,
        html: emailTemplates.certificateRevoked({
          recipientName: recipient.name,
          ...payload,
        }),
      });
    } catch (error) {
      console.error(
        `Failed to send email to ${recipient.email}:`,
        error.message,
      );
    }
  }),
);

console.log('email error:', error);
