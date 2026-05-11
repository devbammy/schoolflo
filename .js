// register
try {
  await sendEmail({
    to: email,
    subject: 'Welcome to School Management Portal',
    html: emailTemplates.welcome({
      firstName,
      email,
      password,
      role,
      loginUrl: `${process.env.CLIENT_URL}/login`,
    }),
  });
} catch (emailError) {
  console.error('EMAIL ERROR:', emailError);
}

// forgot password
try {
  await sendEmail({
    to: user.email,
    subject: 'Password Reset Request',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 10 minutes.</p>`,
  });
} catch (error) {
  console.log('Email Error:', error);
}

// issue certificate
await Promise.all(
  recipients.map(async (recipient) => {
    try {
      await sendEmail({
        to: recipient.email,
        subject: `${payload.certificateType} Issued — ${payload.certificateNumber}`,
        html: emailTemplates.certificateIssued({
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

// revoke cert
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

// payment
try {
  await sendEmail({
    to: payment.student.email,
    subject: `Payment Receipt — ${payment.receiptNumber}`,
    html: emailTemplates.paymentReceipt({
      studentName: `${payment.student.firstName} ${payment.student.lastName}`,
      receiptNumber: payment.receiptNumber,
      amount: payment.amountPaid,
      term: payment.term,
      academicYear: payment.academicYear,
      date: payment.paymentDate,
    }),
  });
} catch (error) {
  console.log('Email error:', error);
}

// result
try {
  await sendEmail({
    to: parent.email,
    subject: `${term} ${academicYear} Results Available — ${student.firstName} ${student.lastName}`,
    html: emailTemplates.resultPublished({
      studentName: `${student.firstName} ${student.lastName}`,
      term,
      academicYear,
      average: reportCard.summary.average,
      position: `${reportCard.summary.overallPosition} of ${reportCard.summary.totalStudentsInClass}`,
      loginUrl: `${process.env.CLIENT_URL}/login`,
    }),
  });
} catch (error) {
  console.log('Email error:', error);
}

//create parent controller
try {
  await sendEmail({
    to: email,
    subject: 'Welcome to School Management Portal',
    html: emailTemplates.welcome({
      firstName,
      email,
      password,
      role: 'Parent',
      loginUrl: `${process.env.CLIENT_URL}/login`,
    }),
  });
} catch (error) {
  console.log('email error:', error);
}

// exam schedule
const emailPromises = [
  ...students.map(async (student) => {
    try {
      await notificationService.sendEmail({
        to: student.email,
        subject: `${schedule.examType} Schedule Published - ${schedule.title}`,
        template: 'examSchedulePublished',
        data: {
          studentName: `${student.firstName} ${student.lastName}`,
          examTitle: schedule.title,
          examType: schedule.examType,
          className: schedule.class.name,
          startDate: schedule.startDate.toLocaleDateString('en-NG'),
          endDate: schedule.endDate.toLocaleDateString('en-NG'),
          loginUrl: process.env.CLIENT_URL,
        },
      });
    } catch (error) {
      console.error(
        `Failed to send exam schedule email to ${student.email}:`,
        error.message,
      );
    }
  }),

  ...invigilators.map(async (teacher) => {
    try {
      await notificationService.sendEmail({
        to: teacher.email,
        subject: `Invigilation Assignment - ${schedule.title}`,
        template: 'invigilationAssignment',
        data: {
          teacherName: `${teacher.firstName} ${teacher.lastName}`,
          examTitle: schedule.title,
          className: schedule.class.name,
          sessionsCount: schedule.sessions.filter(
            (s) =>
              s.invigilator &&
              s.invigilator._id.toString() === teacher._id.toString(),
          ).length,
          loginUrl: process.env.CLIENT_URL,
        },
      });
    } catch (error) {
      console.error(
        `Failed to send invigilation email to ${teacher.email}:`,
        error.message,
      );
    }
  }),
];

await Promise.all(emailPromises);
await Promise.allSettled(emailPromises);
