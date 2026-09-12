const fs = require('fs');
const http = require('http');
const path = require('path');

async function testPdfUpload() {
  console.log('Testing PDF Document Upload...');

  // First register/login to get token
  const loginData = JSON.stringify({
    email: 'pdf_test_user@privacyguard.ai',
    password: 'Password123!',
    name: 'PDF Tester'
  });

  const regReq = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: loginData
  });
  
  let authJson = await regReq.json();
  if (!authJson.token) {
    const loginReq = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pdf_test_user@privacyguard.ai',
        password: 'Password123!'
      })
    });
    authJson = await loginReq.json();
  }

  const token = authJson.token;
  console.log('Obtained Auth Token:', token ? 'YES' : 'NO');

  // Create simple test PDF buffer header content
  const samplePdfText = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 44 >> stream
BT /F1 12 Tf 100 700 Td (PDF Policy INS-2026-9999) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000223 00000 n 
0000000299 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
393
%%EOF`;

  const blob = new Blob([samplePdfText], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('title', 'Sample Enterprise Policy PDF');
  formData.append('document', blob, 'sample_policy.pdf');
  formData.append('classification', 'CONFIDENTIAL');

  const uploadRes = await fetch('http://localhost:5000/api/documents/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  const result = await uploadRes.json();
  console.log('Upload Result Status:', uploadRes.status);
  console.log('Upload Response Body:', JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('✓ SUCCESS: PDF document uploaded, extracted, and indexed without errors!');
  } else {
    console.error('❌ FAILED:', result);
    process.exit(1);
  }
}

testPdfUpload().catch(err => {
  console.error('Script Error:', err);
  process.exit(1);
});
