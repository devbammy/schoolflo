/* eslint-disable no-async-promise-executor --
 * Each executor below wraps its whole body in try/catch and calls reject(),
 * so the usual hazard (an async throw leaving the promise forever pending)
 * cannot occur here. Removing the disable means restructuring all three
 * generators to fetch their data before constructing the Promise, leaving
 * the Promise to wrap only the Cloudinary upload stream. Worth doing, but
 * not worth doing blind — these paths are not covered by tests yet.
 */
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const { Result } = require('../models/Exam');
const User = require('../models/User');
const { generateReportCard: buildReportCard } = require('./gradingService');
const SchoolSettings = require('../models/SchoolSettings');
const AppError = require('../utils/AppError');

/**
 * Who the document is from.
 *
 * The letterheads used to be hard-coded placeholders ("SCHOOL NAME HERE",
 * "Tel: +234-XXX-XXX-XXXX"), so every report card, leaving certificate and
 * admission letter went out looking like a template. Read at call time so a
 * missing setting is reported when someone asks for a document, with a message
 * that says what to set, and never printed on one.
 */
const schoolIdentity = () => {
  const name = (process.env.SCHOOL_NAME || '').trim();

  if (!name) {
    throw AppError.badRequest(
      'School details are not configured. Set SCHOOL_NAME (and ' +
        'SCHOOL_ADDRESS, SCHOOL_PHONE, SCHOOL_EMAIL) before generating documents.',
    );
  }

  const address = (process.env.SCHOOL_ADDRESS || '').trim();
  const phone = (process.env.SCHOOL_PHONE || '').trim();
  const email = (process.env.SCHOOL_EMAIL || '').trim();

  return {
    name,
    address,
    contact: [phone && `Tel: ${phone}`, email && `Email: ${email}`]
      .filter(Boolean)
      .join(' | '),
  };
};

class PDFService {
  /**
   * The report card PDF, on the school's own design: the same sheet the portal
   * prints (client/src/components/results/PrintableReportCard.jsx), drawn here
   * for the "Report Card" certificate so the issued document and the printed
   * page are one design. Every figure comes from gradingService's
   * generateReportCard, so neither can disagree with the portal's results.
   */
  async generateReportCard(studentId, term, academicYear) {
    const school = schoolIdentity();
    const student = await this._resolveStudent(studentId, true);
    if (!student || student.role !== 'Student') {
      throw AppError.notFound('Student not found');
    }

    const card = await buildReportCard(student._id, term, academicYear);
    if (!card) {
      const unpublished = await Result.countDocuments({
        student: student._id,
        term,
        academicYear,
        isPublished: false,
      });
      throw AppError.badRequest(
        unpublished
          ? `No published results for this term. ${unpublished} result(s) are not yet published: publish them first.`
          : `No results found for ${term} ${academicYear}.`,
      );
    }

    const settings =
      (await SchoolSettings.findOne({ key: 'school' })
        .select('+logo.data +signature.data address email phones')
        .lean()) || {};
    const imageOf = (img) =>
      img?.data ? Buffer.from(img.data.buffer || img.data) : null;
    const logo = imageOf(settings.logo);
    const signature = imageOf(settings.signature);
    const address =
      settings.address || (process.env.SCHOOL_ADDRESS || '').trim();
    const email = settings.email || (process.env.SCHOOL_EMAIL || '').trim();
    const phones = settings.phones || (process.env.SCHOOL_PHONE || '').trim();

    const summary = card.summary;
    const results = card.results;
    const withCumulative = Boolean(card.cumulative) && term !== 'First Term';
    const cumBySubject = new Map(
      (card.cumulative?.subjects || []).map((c) => [
        String(c.subject?._id || c.subject),
        c,
      ]),
    );

    const PARTS = ['ca1', 'ca2', 'classWork', 'project', 'exam'];
    const hasFraction = results.some((r) =>
      PARTS.some((k) => !Number.isInteger(Number(r.scores?.[k] || 0))),
    );
    const show = (n) =>
      n === undefined || n === null
        ? ''
        : hasFraction
          ? Number(n).toFixed(2)
          : String(Math.round(Number(n) * 100) / 100);
    const fixed2 = (n) =>
      n === null || n === undefined ? '' : Number(n).toFixed(2);
    const ordinal = (n) => {
      if (!n) return '';
      const tens = n % 100;
      if (tens >= 11 && tens <= 13) return `${n}th`;
      return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
    };
    const session = (y) => String(y || '').replace('/', '-');
    const MONTHS = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const nextLine = (() => {
      const next = card.nextTerm;
      if (!next) return '';
      const when = `${next.term.replace('Term', 'term')} (${session(next.academicYear)})`;
      if (!next.startDate) return when;
      const d = new Date(next.startDate);
      return `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()} - ${when}`;
    })();

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 28 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        // Returned, never uploaded: the caller stores the bytes and serves
        // them only to people allowed to see them.
        doc.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));

        const left = 28;
        const width = doc.page.width - 56;
        const ink = '#111111';
        const grey = '#555555';
        const navy = '#3b4a6b';

        // ── School header ──────────────────────────────────────────────
        const logoSize = 62;
        if (logo) {
          try {
            doc.image(logo, left, 28, { fit: [logoSize, logoSize] });
            doc.image(logo, left + width - logoSize, 28, {
              fit: [logoSize, logoSize],
            });
          } catch {
            // An image pdfkit cannot read (a WebP, say) is left out rather
            // than failing the document.
          }
        }
        const textLeft = left + logoSize + 8;
        const textWidth = width - 2 * (logoSize + 8);
        doc
          .fillColor(navy)
          .font('Times-Roman')
          .fontSize(19)
          .text(school.name, textLeft, 32, {
            width: textWidth,
            align: 'center',
          });
        doc.fillColor(ink).font('Helvetica').fontSize(8.5);
        [address, email && `E-Mail: ${email}`, phones]
          .filter(Boolean)
          .forEach((line) =>
            doc.text(line, textLeft, doc.y + 1, {
              width: textWidth,
              align: 'center',
            }),
          );

        // Boxed title
        const title = `${term} RESULT`.toUpperCase();
        doc.font('Times-Roman').fontSize(10);
        const titleW = doc.widthOfString(title) + 16;
        const titleX = left + (width - titleW) / 2;
        const titleY = Math.max(doc.y + 8, 98);
        doc
          .rect(titleX + 2, titleY + 2, titleW, 16)
          .fill('#999999')
          .rect(titleX, titleY, titleW, 16)
          .fillAndStroke('#ffffff', '#555555');
        doc
          .fillColor(grey)
          .text(title, titleX, titleY + 4, { width: titleW, align: 'center' });

        // ── Student details ────────────────────────────────────────────
        let y = titleY + 28;
        const field = (label, value, x, w) => {
          doc.font('Helvetica').fontSize(7).fillColor(grey);
          const lw = doc.widthOfString(label) + 4;
          doc.text(label, x, y + 2, { lineBreak: false });
          doc
            .moveTo(x + lw, y + 10)
            .lineTo(x + w - 6, y + 10)
            .lineWidth(0.6)
            .stroke('#333333');
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor(ink)
            .text(String(value ?? ''), x + lw, y, {
              width: w - lw - 6,
              align: 'center',
              lineBreak: false,
              ellipsis: true,
            });
        };
        const col = width / 4;
        const className = [
          student.studentProfile?.class?.name,
          summary.section || student.studentProfile?.section,
        ]
          .filter(Boolean)
          .join(' ');
        const rows = [
          [
            [
              'NAME',
              `${student.lastName} ${student.firstName}`.toUpperCase(),
              2,
            ],
            ['SESSION', session(academicYear), 1],
            ['TERM', term, 1],
          ],
          [
            ['CLASS', className, 2],
            ['GENDER', student.studentProfile?.gender || '', 1],
            ['LEARNERS IN CLASS', summary.totalStudentsInClass, 1],
          ],
          [
            ['OBTAINABLE SCORE', summary.obtainableScore, 1],
            ['OBTAINED SCORE', fixed2(summary.obtainedScore), 1],
            ['GRADE', summary.gradeLabel, 2],
          ],
          [
            ['HIGHEST AVERAGE', fixed2(summary.highestAverage), 1],
            ['LOWEST AVERAGE', fixed2(summary.lowestAverage), 1],
            ['CLASS AVERAGE', fixed2(summary.classAverage), 1],
            ["STUDENT'S AVERAGE", fixed2(summary.average), 1],
          ],
          [
            ['DAYS PRESENT', card.attendance?.daysPresent ?? '', 1],
            ['DAYS ABSENT', card.attendance?.daysAbsent ?? '', 1],
            [
              'POSITION',
              summary.overallPosition
                ? `${ordinal(summary.overallPosition)} of ${summary.totalStudentsInClass}`
                : '',
              1,
            ],
            ['RESULT TYPE', 'Exam', 1],
          ],
        ];
        rows.forEach((row) => {
          let x = left;
          row.forEach(([label, value, span]) => {
            field(label, value, x, col * span);
            x += col * span;
          });
          y += 16;
        });

        // ── Scores ─────────────────────────────────────────────────────
        y += 4;
        const heads = [
          ['1st CA', '10 %', 28],
          ['2nd CA', '10 %', 28],
          ['Classwork', '10 %', 38],
          ['Project', '10 %', 32],
          ['Exam', '60 %', 30],
          ['TOTAL', '100 %', 32],
          ['GRADE', '', 28],
          ['COMMENT', '', 48],
          ['POS.', '', 22],
        ];
        if (withCumulative) {
          heads.push(
            // 'OBTAINABLE' in 6.5pt bold is 42.6pt; at 44 it broke as 'OBTAINABL E'.
            ['OBTAINABLE', 'SCORE', 48],
            ['OBTAINED', 'SCORE', 42],
            ['CUMM.', 'SCORE', 32],
            ['CUMM.', 'GRADE', 30],
          );
        }
        const fixedW = heads.reduce((s, h) => s + h[2], 0);
        const subjectW = width - fixedW;
        const cols = [['SUBJECTS/SCHEME', '', subjectW], ...heads];
        const cell = (text, x, cy, w, h, opts = {}) => {
          doc.rect(x, cy, w, h).lineWidth(0.6).stroke('#444444');
          doc
            .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(opts.size || 7.5)
            .fillColor(opts.color || ink);
          const th = doc.heightOfString(String(text), { width: w - 4 });
          doc.text(String(text), x + 2, cy + (h - th) / 2, {
            width: w - 4,
            align: opts.align || 'center',
          });
        };

        const headH = 22;
        let x = left;
        cols.forEach(([a, b, w]) => {
          cell(b ? `${a}\n${b}` : a, x, y, w, headH, {
            size: 6.5,
            color: '#444444',
            bold: true,
          });
          x += w;
        });
        y += headH;

        results.forEach((r) => {
          const name = String(r.subject?.name || '').toUpperCase();
          doc.font('Helvetica').fontSize(7.5);
          const rowH = Math.max(
            14,
            doc.heightOfString(name, { width: subjectW - 4 }) + 5,
          );
          const cum = cumBySubject.get(String(r.subject?._id));
          const values = [
            name,
            ...PARTS.map((k) => show(r.scores?.[k] ?? 0)),
            show(r.totalScore),
            r.grade,
            r.remark,
            ordinal(r.position),
          ];
          if (withCumulative) {
            values.push(
              fixed2(cum?.obtainableScore),
              fixed2(cum?.obtainedScore),
              fixed2(cum?.cumulativeScore),
              cum?.grade || '',
            );
          }
          x = left;
          values.forEach((v, i) => {
            cell(v ?? '', x, y, cols[i][2], rowH, {
              align: i === 0 ? 'left' : 'center',
            });
            x += cols[i][2];
          });
          y += rowH;
        });

        // ── Key to ratings and behaviour ───────────────────────────────
        y += 10;
        const keyW = width * 0.38;
        const lowerTop = y;
        cell('KEY TO RATINGS', left, y, keyW, 14, { color: grey });
        let ky = y + 14;
        const keyH = 11;
        doc
          .rect(left, ky, keyW, card.gradeScale.length * keyH + 6)
          .stroke('#444444');
        ky += 3;
        card.gradeScale.forEach((band) => {
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor('#444444')
            .text(`${band.grade} - ${band.remark}`, left + 8, ky, {
              width: keyW / 2,
              lineBreak: false,
            })
            .text(
              `${fixed2(band.min)} - ${fixed2(band.max)}`,
              left + keyW / 2,
              ky,
              {
                width: keyW / 2 - 8,
                lineBreak: false,
              },
            );
          ky += keyH;
        });

        const bx = left + keyW + 12;
        const bw = width - keyW - 12;
        const ratings = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
        const traits = [
          ['punctuality', 'Punctuality'],
          ['attentiveness', 'Attentiveness'],
          ['timeManagement', 'Time Management'],
          ['creativity', 'Creativity'],
          ['teamWork', 'Team Work'],
          ['neatness', 'Neatness'],
          ['sport', 'Sport'],
        ];
        const traitW = bw * 0.34;
        const rateW = (bw - traitW) / ratings.length;
        let by = lowerTop;
        cell('Behaviour', bx, by, traitW, 14, { color: grey });
        ratings.forEach((r, i) =>
          cell(r, bx + traitW + i * rateW, by, rateW, 14, {
            color: grey,
            size: 7,
          }),
        );
        by += 14;
        traits.forEach(([key, label]) => {
          cell(label, bx, by, traitW, 14, { align: 'left' });
          ratings.forEach((r, i) => {
            const cx = bx + traitW + i * rateW;
            doc.rect(cx, by, rateW, 14).stroke('#444444');
            if (card.behaviour?.[key] === r) {
              // A drawn tick: the standard PDF fonts have no ✓ glyph.
              doc
                .moveTo(cx + rateW / 2 - 4, by + 7)
                .lineTo(cx + rateW / 2 - 1, by + 10)
                .lineTo(cx + rateW / 2 + 5, by + 3)
                .lineWidth(1)
                .stroke(ink);
            }
          });
          by += 14;
        });

        // ── Comments ───────────────────────────────────────────────────
        y = Math.max(ky, by) + 14;
        const line = (label, value, extra) => {
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(grey)
            .text(label, left, y + 4, { width: 150, lineBreak: false });
          doc
            .moveTo(left + 150, y + 13)
            .lineTo(left + width, y + 13)
            .lineWidth(0.6)
            .stroke('#333333');
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(ink)
            .text(String(value || ''), left + 150, y + 3, {
              width: width - 150 - (extra ? 70 : 0),
              align: 'center',
              lineBreak: false,
              ellipsis: true,
            });
          if (extra) extra(left + width - 66, y - 12);
          y += 20;
        };
        const commentsTop = y;
        line("TEACHER'S COMMENT:", card.teacherComment);
        line(
          `${summary.headCommentLabel}:`,
          summary.principalComment,
          signature
            ? (sx, sy) => {
                try {
                  doc.image(signature, sx, sy, { fit: [64, 26] });
                } catch {
                  // An unreadable image is left out, not fatal.
                }
              }
            : null,
        );
        line('NEXT TERM BEGINS ON:', nextLine);

        if (card.promotion) {
          doc.save();
          doc.rotate(-14, { origin: [left + width - 90, commentsTop - 6] });
          doc
            .lineWidth(2)
            .roundedRect(left + width - 150, commentsTop - 18, 120, 26, 5)
            .stroke('#7a86a3');
          doc
            .font('Helvetica-Bold')
            .fontSize(16)
            .fillColor('#7a86a3')
            .text(
              card.promotion.toUpperCase(),
              left + width - 150,
              commentsTop - 12,
              {
                width: 120,
                align: 'center',
                characterSpacing: 3,
              },
            );
          doc.restore();
        }

        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#777777')
          .text(`© ${school.name}`, left, y + 6, { width, align: 'center' });

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
        const school = schoolIdentity();
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
        // The bytes are returned, not uploaded: the caller stores them and serves
        // them only to people allowed to see the document. They used to go to
        // a public Cloudinary URL that anyone holding the link could open.
        doc.on('end', () => {
          resolve({ buffer: Buffer.concat(chunks) });
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
          .text(school.name.toUpperCase(), { align: 'center' })
          .fontSize(12)
          .font('Helvetica')
          .text(school.address, { align: 'center' })
          .text(school.contact, { align: 'center' })
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
        const school = schoolIdentity();
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
        // The bytes are returned, not uploaded: the caller stores them and serves
        // them only to people allowed to see the document. They used to go to
        // a public Cloudinary URL that anyone holding the link could open.
        doc.on('end', () => {
          resolve({ buffer: Buffer.concat(chunks) });
        });

        // --- PDF Content ---

        // Letterhead
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(school.name.toUpperCase(), { align: 'center' })
          .fontSize(10)
          .font('Helvetica')
          .text(school.address, { align: 'center' })
          .text(school.contact, { align: 'center' })
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
          .text(`For: ${school.name}`);

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
}

module.exports = new PDFService();
