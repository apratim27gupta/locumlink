/**
 * check-errors-and-alert.js
 *
 * Runs every 5 minutes via cron. Checks the error_logs table for rows
 * where alerted = false. If any are found, builds a PDF report and
 * emails it to the admin addresses via ZeptoMail, then marks those
 * specific rows as alerted = true (by id, so nothing in between is missed).
 *
 * Run manually with: node check-errors-and-alert.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');

const prisma = new PrismaClient();

const ENV_PATH = path.join(__dirname, '.env');
const ROOT_ENV_PATH = path.join(__dirname, '..', '.env');

function readEnvVar(filePath, key) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const line = content.split('\n').find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

const TWILIO_API_KEY_SID = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SID');
const TWILIO_API_KEY_SECRET = readEnvVar(ENV_PATH, 'TWILIO_API_KEY_SECRET');
const MAIL_FROM_ADDRESS = readEnvVar(ENV_PATH, 'MAIL_FROM_ADDRESS');
const ADMIN_ALERT_EMAIL = readEnvVar(ROOT_ENV_PATH, 'ADMIN_ALERT_EMAIL');

function buildPdf(errors, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(18).text('Locum Link - Error Alert Report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Generated: ${new Date().toISOString()}`);
    doc.fillColor('#555').text(`Total new errors: ${errors.length}`);
    doc.moveDown(1);
    doc.fillColor('#000');

    errors.forEach((err, idx) => {
      doc.fontSize(12).fillColor('#c0392b').text(`Error #${idx + 1}  -  ID: ${err.id}`, { underline: true });
      doc.fontSize(10).fillColor('#000');
      doc.text(`Time: ${err.createdAt.toISOString()}`);
      doc.text(`Route: ${err.route || 'N/A'}    Method: ${err.method || 'N/A'}    Status: ${err.statusCode ?? 'N/A'}`);
      if (err.userId) doc.text(`User ID: ${err.userId}`);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text('Message:');
      doc.font('Helvetica').text(err.message || 'N/A');
      if (err.stack) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').text('Stack:');
        doc.font('Courier').fontSize(8).text(err.stack);
        doc.font('Helvetica').fontSize(10);
      }
      if (err.metadata) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').text('Metadata:');
        doc.font('Courier').fontSize(8).text(JSON.stringify(err.metadata, null, 2));
        doc.font('Helvetica').fontSize(10);
      }
      doc.moveDown(1);
      if (idx < errors.length - 1) {
        doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);
      }
    });

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

async function sendAlertEmail(pdfPath, errorCount) {
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const toEmails = (ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((address) => ({ address }));

  if (toEmails.length === 0) {
    throw new Error('No admin alert emails configured (ADMIN_ALERT_EMAIL is empty)');
  }
  if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !MAIL_FROM_ADDRESS) {
    throw new Error('Missing TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET or MAIL_FROM_ADDRESS in backend/.env');
  }

  const payload = {
    from: { address: MAIL_FROM_ADDRESS, name: 'Locum Link Monitor' },
    to: toEmails,
    content: {
      subject: `Locum Link - ${errorCount} New Error(s) Detected`,
      html: `<p>A new error report has been generated with ${errorCount} error(s). See the attached PDF for full details.</p>`,
      text: `A new error report has been generated with ${errorCount} error(s). See the attached PDF for full details.`,
    },
    attachments: [
      {
        content: pdfBase64,
        contentType: 'application/pdf',
        filename: `error-report-${Date.now()}.pdf`,
      },
    ],
  };

  const credentials = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio Email responded ${response.status}: ${text}`);
  }
  return { status: response.status, body: text };
}

async function main() {
  const timestamp = new Date().toISOString();
  try {
    const errors = await prisma.errorLog.findMany({
      where: { alerted: false },
      orderBy: { createdAt: 'asc' },
      take: 200, // safety cap so one run can't choke on a huge backlog
    });

    if (errors.length === 0) {
      console.log(`[${timestamp}] No new errors. Nothing to do.`);
      return;
    }

    console.log(`[${timestamp}] Found ${errors.length} unalerted error(s). Building PDF...`);

    const pdfPath = path.join(os.tmpdir(), `error-report-${Date.now()}.pdf`);
    await buildPdf(errors, pdfPath);

    await sendAlertEmail(pdfPath, errors.length);
    console.log(`[${timestamp}] Alert email sent successfully for ${errors.length} error(s).`);

    const ids = errors.map((e) => e.id);
    await prisma.errorLog.updateMany({
      where: { id: { in: ids } },
      data: { alerted: true },
    });
    console.log(`[${timestamp}] Marked ${ids.length} error(s) as alerted.`);

    fs.unlinkSync(pdfPath);
  } catch (err) {
    console.error(`[${timestamp}] FAILED:`, err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
