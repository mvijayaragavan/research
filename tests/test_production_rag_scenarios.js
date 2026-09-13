const fs = require('fs');
const path = require('path');
const { createCanvas } = require('../backend/node_modules/@napi-rs/canvas');

const BACKEND_URL = process.env.BACKEND_URL || 'https://privacyguard-backend-ipou.onrender.com';

function createScannedPdfBufferWithText(linesText) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 800, 600);

  ctx.fillStyle = '#000000';
  ctx.font = '20px Arial';

  linesText.forEach((line, idx) => {
    ctx.fillText(line, 40, 60 + (idx * 35));
  });

  const jpegBuffer = canvas.toBuffer('image/jpeg');
  const jpegLength = jpegBuffer.length;

  const pdfStringHeader = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /XObject /Subtype /Image /Width 800 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegLength} >>
stream\n`;

  const pdfStringFooter = `\nendstream
endobj
5 0 obj << /Length 43 >> stream
q 800 0 0 600 0 0 cm /Img1 Do Q
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

async function testProductionRagScenarios() {
  console.log('===========================================================');
  console.log(' Starting Real Production RAG Scenario Verification');
  console.log('===========================================================');

  // Step 1: Register/Login test user
  const email = `prod_rag_test_${Date.now()}@privacyguard.ai`;
  const password = 'TestPassword123!';

  console.log('Registering test user:', email);
  let authRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Production RAG Tester', email, password })
  });

  let authData = await authRes.json();
  if (!authData.token && (!authData.data || !authData.data.token)) {
    authRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    authData = await authRes.json();
  }

  const token = authData.token || (authData.data ? authData.data.token : null);
  if (!token) throw new Error('Failed to obtain auth token: ' + JSON.stringify(authData));
  console.log('Obtained Auth Token: YES');

  // Step 2: Generate PDF Buffer for life_balance_score_neo4j_report.pdf
  const pdfLines = [
    'Life Balance Score - Student Activity Tracking System using Neo4j Graph Database.',
    'Introduction: This project tracks student study hours, exercise, and social activities.',
    'Technology Stack: Frontend built with HTML, CSS, JavaScript. Backend powered by Node.js, Express, and Neo4j graph database.'
  ];

  const pdfBuffer = createScannedPdfBufferWithText(pdfLines);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('title', 'Life Balance Score Neo4j Report');
  formData.append('document', blob, 'life_balance_score_neo4j_report.pdf');
  formData.append('classification', 'CONFIDENTIAL');

  console.log('\n--- UPLOADING REPORT PDF TO PRODUCTION BACKEND ---');
  const uploadRes = await fetch(`${BACKEND_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  const uploadData = await uploadRes.json();
  if (!uploadData.success) {
    throw new Error('PDF upload failed: ' + JSON.stringify(uploadData));
  }

  const docId = uploadData.document.id || uploadData.document._id;
  console.log('Production Uploaded Document ID:', docId);

  // Helper for asking AI
  async function ask(query) {
    const res = await fetch(`${BACKEND_URL}/api/ai/ask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId: docId,
        query,
        enforceMinimization: true
      })
    });
    return await res.json();
  }

  // SCENARIO 1: Database used?
  console.log('\n--- SCENARIO 1: Database used? ---');
  const res1 = await ask('What database is used in the project?');
  console.log('Answer:', res1.answer);
  console.log('Status:', res1.verification?.status, '| Trust Score:', res1.verification?.trustScore + '%');
  console.log('Sources Count:', res1.sources?.length);

  // SCENARIO 2: Technology Stack?
  console.log('\n--- SCENARIO 2: Technology stack? ---');
  const res2 = await ask('What is the technology stack?');
  console.log('Answer:', res2.answer);
  console.log('Status:', res2.verification?.status, '| Trust Score:', res2.verification?.trustScore + '%');
  console.log('Sources Count:', res2.sources?.length);

  // SCENARIO 3: Give the commands?
  console.log('\n--- SCENARIO 3: Give the commands? ---');
  const res3 = await ask('give the commands?');
  console.log('Answer:', res3.answer);
  console.log('Status:', res3.verification?.status, '| Trust Score:', res3.verification?.trustScore + '%');
  console.log('Sources Count:', res3.sources?.length);

  // SCENARIO 4: Capital of Japan?
  console.log('\n--- SCENARIO 4: Capital of Japan? ---');
  const res4 = await ask('What is the capital of Japan?');
  console.log('Answer:', res4.answer);
  console.log('Status:', res4.verification?.status, '| Trust Score:', res4.verification?.trustScore + '%');
  console.log('Sources Count:', res4.sources?.length);

  // SCENARIO 5: Exact Neo4j password?
  console.log('\n--- SCENARIO 5: Neo4j password? ---');
  const res5 = await ask('What is the exact Neo4j password used by this project?');
  console.log('Answer:', res5.answer);
  console.log('Status:', res5.verification?.status, '| Trust Score:', res5.verification?.trustScore + '%');
  console.log('Sources Count:', res5.sources?.length);

  console.log('\n===========================================================');
  console.log(' PRODUCTION RAG SCENARIOS TEST COMPLETED SUCCESSFULLY! 🎉');
  console.log('===========================================================');
}

testProductionRagScenarios().catch(err => {
  console.error('❌ Production RAG Scenario Error:', err.message);
  process.exit(1);
});
