const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { Result } = require('../models/Exam');
const User = require('../models/User');
const Class = require('../models/Class');

class PDFService {
  // Generate Report Card PDF
  async generateReportCard(studentId, term, academicYear) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('Generating report card with params:', {
          studentId,
          term,
          academicYear,
        });

        // Fetch student data
        const student = await this._resolveStudent(studentId, true);

        if (!student || student.role !== 'Student') {
          throw new Error('Student not found');
        }

        console.log(
          'Student found:',
          student._id,
          student.firstName,
          student.lastName,
        );

        // Fetch all results for the term
        const query = {
          student: student._id,
          term,
          academicYear,
          isPublished: true,
        };

        console.log('Querying results with:', query);

        const results = await Result.find(query)
          .populate('subject', 'name code')
          .sort({ 'subject.name': 1 });

        console.log(
          `Found ${results.length} results for student ${student._id}`,
        );
        console.log(
          'Results:',
          results.map((r) => ({
            subject: r.subject?.name,
            term: r.term,
            academicYear: r.academicYear,
            isPublished: r.isPublished,
            totalScore: r.totalScore,
          })),
        );

        if (results.length === 0) {
          // Try to find any results for this student to debug
          const allStudentResults = await Result.find({ student: student._id });
          console.log(
            `Student has ${allStudentResults.length} total results:`,
            allStudentResults.map((r) => ({
              term: r.term,
              academicYear: r.academicYear,
              isPublished: r.isPublished,
            })),
          );

          // Check if there are unpublished results for this term
          const unpublishedResults = await Result.find({
            student: student._id,
            term,
            academicYear,
            isPublished: false,
          });
          console.log(
            `Found ${unpublishedResults.length} unpublished results for this term`,
          );

          if (unpublishedResults.length > 0) {
            throw new Error(
              `No published results found for this term. Found ${unpublishedResults.length} unpublished results. Please publish the results first.`,
            );
          } else {
            throw new Error(
              `No results found for term "${term}" and academic year "${academicYear}". Please check if results exist for this student.`,
            );
          }
        }

        // Calculate overall statistics
        const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
        const totalGradePoints = results.reduce(
          (sum, r) => sum + r.gradePoint,
          0,
        );
        const average = totalScore / results.length;
        const gpa = totalGradePoints / results.length;

        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        // Collect PDF in buffer
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);

          // Upload to Cloudinary
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'smp/certificates',
              resource_type: 'raw',
              format: 'pdf',
              public_id: `report_card_${student._id}_${term}_${academicYear}_${Date.now()}`,
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve({
                  url: result.secure_url,
                  publicId: result.public_id,
                });
              }
            },
          );

          streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
        });

        // --- PDF Content Design ---

        // Header with school name and logo
        doc
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('SCHOOL NAME HERE', { align: 'center' })
          .fontSize(10)
          .font('Helvetica')
          .text('School Address | Phone | Email', { align: 'center' })
          .moveDown(0.5);

        // Horizontal line
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown();

        // Report Card Title
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .text('STUDENT REPORT CARD', { align: 'center' })
          .moveDown();

        // Student Information Box
        const infoBoxY = doc.y;
        doc.rect(50, infoBoxY, 495, 100).stroke();

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Student Information:', 60, infoBoxY + 10);

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `Name: ${student.firstName} ${student.lastName}`,
            60,
            infoBoxY + 30,
          )
          .text(
            `Admission No: ${student.studentProfile.admissionNumber}`,
            60,
            infoBoxY + 45,
          )
          .text(
            `Class: ${student.studentProfile.class.name}`,
            60,
            infoBoxY + 60,
          )
          .text(`Term: ${term}`, 320, infoBoxY + 30)
          .text(`Academic Year: ${academicYear}`, 320, infoBoxY + 45)
          .text(
            `Date: ${new Date().toLocaleDateString('en-NG')}`,
            320,
            infoBoxY + 60,
          );

        doc.y = infoBoxY + 110;
        doc.moveDown();

        // Results Table
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('ACADEMIC PERFORMANCE', { align: 'center' })
          .moveDown(0.5);

        // Table headers
        const tableTop = doc.y;
        const col1X = 50;
        const col2X = 220;
        const col3X = 280;
        const col4X = 330;
        const col5X = 380;
        const col6X = 430;
        const col7X = 480;

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Subject', col1X, tableTop)
          .text('CA1', col2X, tableTop, { width: 30, align: 'center' })
          .text('CA2', col3X, tableTop, { width: 30, align: 'center' })
          .text('Mid', col4X, tableTop, { width: 30, align: 'center' })
          .text('Exam', col5X, tableTop, { width: 30, align: 'center' })
          .text('Total', col6X, tableTop, { width: 30, align: 'center' })
          .text('Grade', col7X, tableTop, { width: 30, align: 'center' });

        doc
          .moveTo(50, tableTop + 15)
          .lineTo(545, tableTop + 15)
          .stroke();

        let rowY = tableTop + 20;
        doc.font('Helvetica').fontSize(9);

        results.forEach((result, index) => {
          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
          }

          doc
            .text(result.subject.name, col1X, rowY, { width: 160 })
            .text(result.scores.ca1 || '-', col2X, rowY, {
              width: 30,
              align: 'center',
            })
            .text(result.scores.ca2 || '-', col3X, rowY, {
              width: 30,
              align: 'center',
            })
            .text(result.scores.midTerm || '-', col4X, rowY, {
              width: 30,
              align: 'center',
            })
            .text(result.scores.exam || '-', col5X, rowY, {
              width: 30,
              align: 'center',
            })
            .text(result.totalScore, col6X, rowY, {
              width: 30,
              align: 'center',
            })
            .text(result.grade, col7X, rowY, { width: 30, align: 'center' });

          rowY += 20;
        });

        doc.moveTo(50, rowY).lineTo(545, rowY).stroke();
        rowY += 10;

        // Summary Statistics
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('SUMMARY', 50, rowY)
          .font('Helvetica')
          .text(`Total Subjects: ${results.length}`, 50, rowY + 20)
          .text(`Overall Average: ${average.toFixed(2)}%`, 50, rowY + 35)
          .text(`GPA: ${gpa.toFixed(2)}/5.0`, 50, rowY + 50);

        // Principal's Comment
        const principalComment = this._getPrincipalComment(average);
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text("Principal's Comment:", 50, rowY + 80)
          .font('Helvetica')
          .fontSize(9)
          .text(principalComment, 50, rowY + 95, { width: 495 });

        // Grading Scale
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('GRADING SCALE', 50, rowY + 130)
          .font('Helvetica')
          .fontSize(8)
          .text(
            'A: 70-100 (Distinction) | B: 60-69 (Credit) | C: 50-59 (Merit) | D: 45-49 (Pass) | E: 40-44 (Weak Pass) | F: 0-39 (Fail)',
            50,
            rowY + 145,
            { width: 495 },
          );

        // Signature Section
        const sigY = rowY + 180;
        doc
          .fontSize(9)
          .font('Helvetica')
          .text('_____________________', 80, sigY)
          .text('Class Teacher', 80, sigY + 20, { align: 'center', width: 120 })
          .text('_____________________', 280, sigY)
          .text("Principal's Signature", 280, sigY + 20, {
            align: 'center',
            width: 120,
          });

        // Footer
        doc
          .fontSize(7)
          .font('Helvetica')
          .text('Generated on ' + new Date().toLocaleString('en-NG'), 50, 750, {
            align: 'center',
            width: 495,
          });

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate School Leaving Certificate
  async generateLeavingCertificate(studentId, data) {
    return new Promise(async (resolve, reject) => {
      try {
        const student = await this._resolveStudent(studentId, true);

        if (!student || student.role !== 'Student') {
          throw new Error('Student not found');
        }

        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 70, right: 70 },
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);

          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'smp/certificates',
              resource_type: 'raw',
              format: 'pdf',
              public_id: `leaving_cert_${student._id}_${Date.now()}`,
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve({
                  url: result.secure_url,
                  publicId: result.public_id,
                });
              }
            },
          );

          streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
        });

        // --- PDF Content ---

        // Border
        doc.rect(30, 30, 535, 782).stroke();
        doc.rect(35, 35, 525, 772).stroke();

        doc.moveDown(2);

        // School Header
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('SCHOOL NAME', { align: 'center' })
          .fontSize(12)
          .font('Helvetica')
          .text('School Address, City, State', { align: 'center' })
          .text('Tel: +234-XXX-XXX-XXXX | Email: info@school.ng', {
            align: 'center',
          })
          .moveDown(2);

        // Certificate Title
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('SCHOOL LEAVING CERTIFICATE', { align: 'center' })
          .moveDown(0.5);

        // Certificate Number
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Certificate No: ${data.certificateNumber}`, {
            align: 'center',
          })
          .moveDown(2);

        // Main Content
        doc
          .fontSize(12)
          .font('Helvetica')
          .text('This is to certify that', { align: 'center' })
          .moveDown(0.5);

        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .text(
            `${student.firstName.toUpperCase()} ${student.lastName.toUpperCase()}`,
            { align: 'center' },
          )
          .moveDown(0.5);

        doc
          .fontSize(12)
          .font('Helvetica')
          .text(`Admission Number: ${student.studentProfile.admissionNumber}`, {
            align: 'center',
          })
          .moveDown()
          .text(
            `was a bonafide student of this institution from ${data.admissionDate} to ${data.leavingDate}.`,
            { align: 'center' },
          )
          .moveDown()
          .text(
            `The student studied in ${student.studentProfile.class.name} and has satisfactorily completed`,
            { align: 'center' },
          )
          .text(`the required course of study.`, { align: 'center' })
          .moveDown(2);

        // Character & Conduct
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Character:', 70, doc.y)
          .font('Helvetica')
          .text(data.character || 'Excellent', 160, doc.y - 11)
          .moveDown();

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Conduct:', 70, doc.y)
          .font('Helvetica')
          .text(data.conduct || 'Very Good', 160, doc.y - 11)
          .moveDown();

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Reason for Leaving:', 70, doc.y)
          .font('Helvetica')
          .text(
            data.reasonForLeaving || 'Completion of Studies',
            160,
            doc.y - 11,
            { width: 350 },
          )
          .moveDown(3);

        // Issue Date
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`Date of Issue: ${new Date().toLocaleDateString('en-NG')}`, {
            align: 'center',
          })
          .moveDown(4);

        // Signatures
        const sigY = doc.y;
        doc
          .fontSize(10)
          .text('_____________________', 100, sigY)
          .text('Class Teacher', 100, sigY + 20, {
            align: 'center',
            width: 120,
          })
          .text('_____________________', 350, sigY)
          .text('Principal', 350, sigY + 20, { align: 'center', width: 120 });

        // School Stamp placeholder
        doc
          .fontSize(8)
          .font('Helvetica-Oblique')
          .text('(School Stamp)', 450, sigY + 10);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate Admission Letter
  async generateAdmissionLetter(studentId, data) {
    return new Promise(async (resolve, reject) => {
      try {
        const student = await this._resolveStudent(studentId);

        if (!student) {
          throw new Error('Student not found');
        }

        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 70, right: 70 },
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);

          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'smp/certificates',
              resource_type: 'raw',
              format: 'pdf',
              public_id: `admission_letter_${student._id}_${Date.now()}`,
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve({
                  url: result.secure_url,
                  publicId: result.public_id,
                });
              }
            },
          );

          streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
        });

        // --- PDF Content ---

        // Letterhead
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('SCHOOL NAME', { align: 'center' })
          .fontSize(10)
          .font('Helvetica')
          .text('School Address, City, State', { align: 'center' })
          .text('Tel: +234-XXX-XXX-XXXX | Email: admissions@school.ng', {
            align: 'center',
          })
          .moveDown(2);

        // Reference Number and Date
        doc
          .fontSize(10)
          .text(`Ref: ${data.certificateNumber}`, 70, doc.y, { align: 'left' })
          .text(`Date: ${new Date().toLocaleDateString('en-NG')}`, {
            align: 'right',
          })
          .moveDown(2);

        // Recipient Address
        doc
          .text(`${student.firstName} ${student.lastName}`, 70, doc.y)
          .text(data.address || 'Address Line 1')
          .text(data.city || 'City, State')
          .moveDown(2);

        // Subject
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('RE: OFFER OF ADMISSION', { align: 'center', underline: true })
          .moveDown(2);

        // Body
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`Dear ${student.firstName},`)
          .moveDown();

        doc
          .text(
            'We are pleased to inform you that you have been offered admission to our institution for the academic year ' +
              data.academicYear +
              '.',
            { align: 'justify' },
          )
          .moveDown();

        // Admission Details
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('ADMISSION DETAILS:')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Admission Number: ${data.admissionNumber}`)
          .text(`Class: ${data.className}`)
          .text(`Academic Year: ${data.academicYear}`)
          .text(`Resumption Date: ${data.resumptionDate}`)
          .moveDown();

        // Requirements
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('REQUIREMENTS FOR RESUMPTION:')
          .moveDown(0.5);

        doc
          .fontSize(10)
          .font('Helvetica')
          .list(
            [
              'Completed registration form',
              'Payment of school fees (₦' + (data.fees || '0') + ')',
              'Two passport photographs',
              'Birth certificate (original and photocopy)',
              'Previous school result (if applicable)',
              'Medical certificate',
            ],
            { bulletRadius: 2 },
          )
          .moveDown();

        // Validity
        doc
          .fontSize(10)
          .font('Helvetica-Oblique')
          .text(`This offer is valid until ${data.validUntil}.`, {
            align: 'center',
          })
          .moveDown(2);

        // Closing
        doc
          .fontSize(10)
          .font('Helvetica')
          .text('We look forward to welcoming you to our school.')
          .moveDown()
          .text('Yours faithfully,')
          .moveDown(3);

        // Signature
        doc
          .text('_____________________')
          .text('Principal')
          .text('For: School Name');

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async _resolveStudent(identifier, populateClass = false) {
    const query = mongoose.Types.ObjectId.isValid(identifier)
      ? { _id: identifier }
      : { 'studentProfile.admissionNumber': identifier };

    let student = User.findOne(query);
    if (populateClass) {
      student = student.populate('studentProfile.class', {
        name: 1,
      });
    }

    return await student;
  }

  // Helper: Get principal's comment based on average
  _getPrincipalComment(average) {
    if (average >= 70) {
      return 'Excellent performance. Keep up the outstanding work!';
    } else if (average >= 60) {
      return 'Very good performance. You are doing well.';
    } else if (average >= 50) {
      return 'Good performance. Work harder for better results.';
    } else if (average >= 40) {
      return 'Fair performance. Significant improvement is needed.';
    } else {
      return 'Poor performance. Urgent attention required.';
    }
  }
}

module.exports = new PDFService();
