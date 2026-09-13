const fs = require('fs');
const path = require('path');
const { createCanvas } = require('./backend/node_modules/@napi-rs/canvas');

function createScannedPdfBufferWithText(linesText) {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 400);

  ctx.fillStyle = '#000000';
  ctx.font = '24px Arial';

  linesText.forEach((line, idx) => {
    ctx.fillText(line, 40, 60 + (idx * 40));
  });

  const jpegBuffer = canvas.toBuffer('image/jpeg');
  const jpegLength = jpegBuffer.length;

  const pdfStringHeader = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /XObject /Subtype /Image /Width 600 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegLength} >>
stream\n`;

  const pdfStringFooter = `\nendstream
endobj
5 0 obj << /Length 43 >> stream
q 600 0 0 400 0 0 cm /Img1 Do Q
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000240 00000 n 
0000000400 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
493
%%EOF`;

  return Buffer.concat([
    Buffer.from(pdfStringHeader, 'binary'),
    jpegBuffer,
    Buffer.from(pdfStringFooter, 'binary')
  ]);
}

const lines = [
  'PrivacyGuard Vault Confidential Invoice',
  'Invoice Number: INV-998822',
  'Customer Email: john.doe@privacyguard.ai',
  'Customer Phone: +1 555 123 4567',
  'Total Due Amount: $4,500.00 USD'
];

const scannedPdf = createScannedPdfBufferWithText(lines);
fs.writeFileSync(path.join(__dirname, 'scanned_invoice_test.pdf'), scannedPdf);
console.log('Created scanned_invoice_test.pdf:', scannedPdf.length, 'bytes');

// Blank PDF
const emptyCanvas = createCanvas(300, 300);
const emptyCtx = emptyCanvas.getContext('2d');
emptyCtx.fillStyle = '#FFFFFF';
emptyCtx.fillRect(0, 0, 300, 300);
const emptyJpeg = emptyCanvas.toBuffer('image/jpeg');

const blankPdf = Buffer.concat([
  Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /XObject /Subtype /Image /Width 300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${emptyJpeg.length} >>\nstream\n`, 'binary'),
  emptyJpeg,
  Buffer.from(`\nendstream\nendobj\n5 0 obj << /Length 43 >> stream\nq 300 0 0 300 0 0 cm /Img1 Do Q\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n400\n%%EOF`, 'binary')
]);

fs.writeFileSync(path.join(__dirname, 'blank_scanned_test.pdf'), blankPdf);
console.log('Created blank_scanned_test.pdf:', blankPdf.length, 'bytes');
