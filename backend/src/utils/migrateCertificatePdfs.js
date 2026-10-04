/**
 * Move legacy certificate PDFs off public URLs.
 *
 * Certificates issued before documents were stored in the portal point at a
 * public Cloudinary link — anyone holding the URL can read a child's report
 * card, and revoking the certificate never took the file down. This pulls each
 * such file into the database (where it is served only through the
 * authenticated download route), then deletes the public copy.
 *
 * Read-only by default. Nothing is written or deleted without --apply, and a
 * public copy is deleted only after its bytes are safely stored.
 *
 *   node src/utils/migrateCertificatePdfs.js            # report only
 *   node src/utils/migrateCertificatePdfs.js --apply    # migrate
 */
require('dotenv').config();
const Certificate = require('../models/Certificate');
const connectDB = require('../config/db');
const { deleteFromCloudinary } = require('../services/fileService');

const APPLY = process.argv.includes('--apply');
const FETCH_TIMEOUT_MS = 30 * 1000;

const run = async () => {
  await connectDB();

  const legacy = await Certificate.find({
    pdfUrl: { $exists: true, $ne: null },
    $or: [{ pdfSize: { $exists: false } }, { pdfSize: 0 }],
  }).select('certificateNumber certificateType pdfUrl publicId');

  console.log(
    `${legacy.length} certificate(s) on public links.${APPLY ? '' : ' (dry run — pass --apply to migrate)'}`,
  );

  let migrated = 0;
  let failed = 0;

  for (const cert of legacy) {
    const label = `${cert.certificateNumber} (${cert.certificateType})`;

    if (!APPLY) {
      console.log(`  would migrate ${label}`);
      continue;
    }

    try {
      const response = await fetch(cert.pdfUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || !bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        throw new Error('response was not a PDF');
      }

      // Stored first. Only once the bytes are safe is the public copy removed.
      await Certificate.updateOne(
        { _id: cert._id },
        {
          $set: { pdfData: bytes, pdfSize: bytes.length },
          $unset: { pdfUrl: '', publicId: '' },
        },
      );

      if (cert.publicId) await deleteFromCloudinary(cert.publicId, 'raw');

      migrated += 1;
      console.log(`  migrated ${label}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAILED ${label}: ${error.message}`);
    }
  }

  if (APPLY) console.log(`Done: ${migrated} migrated, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
