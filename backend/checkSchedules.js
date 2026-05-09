require('dotenv').config();
const mongoose = require('mongoose');
const ExamSchedule = require('./src/models/ExamSchedule');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    const docs = await ExamSchedule.find().limit(20).lean();
    console.log('count', docs.length);
    docs.forEach((doc, i) => {
      console.log(i, {
        title: doc.title,
        term: doc.term,
        academicYear: doc.academicYear,
        class: doc.class ? doc.class.toString() : doc.class,
        published: doc.isPublished,
        sessionsCount: doc.sessions?.length || 0,
      });
      if (doc.sessions && doc.sessions.length > 0) {
        doc.sessions.forEach((s, j) => {
          console.log(`  session ${j}:`, {
            subject: s.subject ? s.subject.toString() : s.subject,
            invigilator: s.invigilator
              ? s.invigilator.toString()
              : s.invigilator,
          });
        });
      }
    });
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
})();
