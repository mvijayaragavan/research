const http = require('http');

/**
 * Helper to execute HTTP requests with JSON / multipart simulation
 */
function makeHttpRequest({ hostname = 'localhost', port = 5000, path, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path, method, headers }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runDocumentTests() {
  console.log('===========================================================');
  console.log(' Running Milestone 3 Document Ingestion & Access Control Tests');
  console.log('===========================================================');

  try {
    // 1. Register User A
    const userA = {
      name: 'User A (Insurance Policyholder)',
      email: `userA_${Date.now()}@privacyguard.ai`,
      password: 'UserAPassword123!'
    };
    const regA = await makeHttpRequest({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA)
    });
    const tokenA = regA.body.token;

    // 2. Register User B
    const userB = {
      name: 'User B (Unauthorized Third Party)',
      email: `userB_${Date.now()}@privacyguard.ai`,
      password: 'UserBPassword123!'
    };
    const regB = await makeHttpRequest({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB)
    });
    const tokenB = regB.body.token;

    console.log('✓ Registered User A and User B successfully.');

    // 3. Upload Document as User A (Multipart Form Data payload simulation)
    console.log('\n[Test 1] Uploading Insurance.txt as User A...');
    const fileContent = "Vijay's insurance policy ABC123 expires on 15 March 2027. Vijay's phone number is 9876543210.";
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    
    let multipartBody = '';
    multipartBody += `--${boundary}\r\n`;
    multipartBody += `Content-Disposition: form-data; name="title"\r\n\r\nInsurance_Policy.txt\r\n`;
    multipartBody += `--${boundary}\r\n`;
    multipartBody += `Content-Disposition: form-data; name="file"; filename="Insurance.txt"\r\n`;
    multipartBody += `Content-Type: text/plain\r\n\r\n`;
    multipartBody += `${fileContent}\r\n`;
    multipartBody += `--${boundary}--\r\n`;

    const uploadRes = await makeHttpRequest({
      path: '/api/documents/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(multipartBody),
        'Authorization': `Bearer ${tokenA}`
      },
      body: multipartBody
    });

    console.log(`Upload Response Status: ${uploadRes.status}`);
    console.log(`Uploaded Doc Title: ${uploadRes.body.document ? uploadRes.body.document.title : 'N/A'}`);
    console.log(`Extracted Character Count: ${uploadRes.body.document ? uploadRes.body.document.characterCount : 'N/A'}`);

    if (uploadRes.status !== 201 || !uploadRes.body.document) {
      throw new Error('Document upload failed!');
    }
    const docId = uploadRes.body.document.id;
    console.log('✓ PASS: Document uploaded & text extracted successfully.');

    // 4. User A Fetches Document Details
    console.log(`\n[Test 2] User A fetching owned document ID ${docId}...`);
    const docResA = await makeHttpRequest({
      path: `/api/documents/${docId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    if (docResA.status !== 200 || !docResA.body.document) {
      throw new Error('Owner failed to read their own document!');
    }
    console.log('✓ PASS: Document owner retrieved document successfully.');

    // 5. User B Attempts Unauthorized Cross-Tenant Access
    console.log(`\n[Test 3] User B (unauthorized) attempting to fetch User A's document ID ${docId}...`);
    const docResB = await makeHttpRequest({
      path: `/api/documents/${docId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    console.log(`Response Status: ${docResB.status}`);
    console.log(`Error Message: ${docResB.body.error}`);

    if (docResB.status !== 403) {
      throw new Error('SECURITY VIOLATION: Unauthorized cross-tenant document access was NOT blocked!');
    }
    console.log('✓ PASS: Gateway deterministically rejected cross-tenant access attempt (403 Forbidden).');

    console.log('\n===========================================================');
    console.log(' ALL MILESTONE 3 DOCUMENT INGESTION TESTS PASSED!');
    console.log('===========================================================');

  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
  }
}

runDocumentTests();
