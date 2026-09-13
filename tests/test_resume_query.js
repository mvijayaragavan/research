const fs = require('fs');
const path = require('path');
const { createCanvas } = require('../backend/node_modules/@napi-rs/canvas');

const BACKEND_URL = 'https://privacyguard-backend-ipou.onrender.com';

function createResumePdf() {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#000000';
  ctx.font = '20px Arial';
  [
    'VIJAYA RAGAVAN M +91 8248075049 vijay@example.com',
    'EXPERIENCE: Software Engineer working on engineering projects',
    'EDUCATION: B.Tech Computer Science'
  ].forEach((l, i) => ctx.fillText(l, 40, 60 + i * 40));

  const jpeg = canvas.toBuffer('image/jpeg');
  const header = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /XObject /Subtype /Image /Width 800 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
  const footer = `\nendstream\nendobj\n5 0 obj << /Length 43 >> stream\nq 800 0 0 600 0 0 cm /Img1 Do Q\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n493\n%%EOF`;
  return Buffer.concat([Buffer.from(header, 'binary'), jpeg, Buffer.from(footer, 'binary')]);
}

async function testResumeQuery() {
  console.log('===========================================================');
  console.log(' Testing Resume (No Database Info) Database Query');
  console.log('===========================================================');

  const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Resume Tester',
      email: `res_test_${Date.now()}@privacyguard.ai`,
      password: 'Password123!'
    })
  });
  const regData = await regRes.json();
  const token = regData.token;

  const pdfBuf = createResumePdf();
  const form = new FormData();
  form.append('document', new Blob([pdfBuf], { type: 'application/pdf' }), 'vj (vijay (1) (1).pdf)');
  form.append('classification', 'CONFIDENTIAL');

  const upRes = await fetch(`${BACKEND_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const upData = await upRes.json();
  const docId = upData.document.id;

  console.log('Uploaded Resume Document ID:', docId);

  const askRes = await fetch(`${BACKEND_URL}/api/ai/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      documentId: docId,
      query: 'What database is used in the project?',
      enforceMinimization: true
    })
  });
  const askData = await askRes.json();

  console.log('\nResume Database Query Result:');
  console.log('Answer:', askData.answer);
  console.log('Verification Status:', askData.verification?.status, '| Trust Score:', askData.verification?.trustScore + '%');
  console.log('Sources Count:', askData.sources?.length);
  console.log('Sources:', askData.sources);
}

testResumeQuery().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
