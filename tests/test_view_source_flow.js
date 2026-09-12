/**
 * Test Suite: View Source Citation & PDF Reader Grounding Flow
 * Tests all 5 test cases specified in the View Source bug fix requirements:
 * 1. Single PDF Q&A View Source validation
 * 2. Multi-chunk Q&A View Source citations
 * 3. Document switching & strict cross-document isolation
 * 4. Global Retrieval across multi-document vault
 * 5. Refusal / Unmentioned question handling (no fake citations)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';

async function makeRequest(urlPath, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function uploadSampleDoc(token, title, fileName, textContent) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let payload = '';

  payload += `--${boundary}\r\n`;
  payload += `Content-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`;

  payload += `--${boundary}\r\n`;
  payload += `Content-Disposition: form-data; name="classification"\r\n\r\nCONFIDENTIAL\r\n`;

  payload += `--${boundary}\r\n`;
  payload += `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n`;
  payload += `Content-Type: text/plain\r\n\r\n${textContent}\r\n`;

  payload += `--${boundary}--\r\n`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/documents/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('===========================================================');
  console.log('🧪 Starting View Source Citation & PDF Reader Test Suite');
  console.log('===========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Setup User & Documents
    console.log('\n[Setup] Registering user & creating test documents...');
    const userRes = await makeRequest('/api/auth/register', 'POST', {
      name: 'View Source Tester',
      email: `vs_tester_${Date.now()}@privacyguard.ai`,
      password: 'Password123!'
    });
    const userData = JSON.parse(userRes.body);
    assert(userData.success && userData.token, 'Test user registered');
    const token = userData.token;

    const docAContent = `--- PAGE 1 ---
EMPLOYMENT AGREEMENT 2026 FOR SAM WILSON
This Employment Agreement is entered into between PrivacyGuard Corporation and Sam Wilson.
Base Salary: The Executive's base salary shall be $195,000 USD per annum, payable in monthly installments in accordance with standard payroll practices.
Duties and Responsibilities: The Executive shall perform duties customarily associated with senior software engineering management and report to the Chief Technology Officer.

--- PAGE 2 ---
LEAVE POLICY & ANNUAL BENEFITS SCHEDULE
Annual Leave Entitlement: The Executive is entitled to 25 working days of paid annual leave per calendar year.
Sick Leave: 10 paid sick days per year are provided for illness or emergency family care.
Health Benefits: Comprehensive health, dental, and vision insurance coverage provided under BlueShield Master Plan.`;

    const docBContent = `--- PAGE 1 ---
PURCHASE ORDER #9942
Supplier: CyberSecurity Solutions Ltd.
Total Amount: $45,000 USD.
Payment Terms: Net 30 days.`;

    const uploadA = await uploadSampleDoc(token, 'Employment Agreement (Sam Wilson)', 'Resume_Z.pdf', docAContent);
    assert(uploadA.status === 201 && uploadA.body.document, 'Uploaded Document A (Resume_Z.pdf)');
    const docA = uploadA.body.document;

    const uploadB = await uploadSampleDoc(token, 'CheatShield Review Report', 'CheatShield_Report.pdf', docBContent);
    assert(uploadB.status === 201 && uploadB.body.document, 'Uploaded Document B (CheatShield_Report.pdf)');
    const docB = uploadB.body.document;

    const docAId = (docA._id || docA.id).toString();
    const docBId = (docB._id || docB.id).toString();

    // TEST 1: Select one PDF -> ask question -> View Source citation metadata
    console.log('\n[TEST 1] Select one PDF (Resume_Z.pdf) -> Ask question -> View Source citation validation');
    const ask1Res = await makeRequest('/api/ai/ask', 'POST', {
      documentId: docAId,
      query: 'What is the base salary?'
    }, token);
    const ask1Data = JSON.parse(ask1Res.body);
    assert(ask1Data.success === true, 'Q&A execution succeeded');
    assert(ask1Data.sources && ask1Data.sources.length > 0, 'Sources array returned');

    const src1 = ask1Data.sources[0];
    assert(src1.documentId === docAId, `Citation documentId matches selected document (${docAId})`);
    assert(src1.pageNumber === 1, `Citation pageNumber is accurate (Page 1)`);
    assert(src1.chunkId && src1.chunkId.length > 0, `Citation chunkId is preserved (${src1.chunkId})`);
    assert(src1.rawChunkText && src1.rawChunkText.includes('195,000'), `Citation text snippet preserves original text`);

    // TEST 2: Ask a question requiring multiple chunks
    console.log('\n[TEST 2] Question requiring multiple chunks across pages');
    const ask2Res = await makeRequest('/api/ai/ask', 'POST', {
      documentId: docAId,
      query: 'What is the base salary and annual leave entitlement?'
    }, token);
    const ask2Data = JSON.parse(ask2Res.body);
    assert(ask2Data.sources && ask2Data.sources.length >= 2, `Multiple citations returned (${ask2Data.sources.length} sources)`);
    const pageNumbers = ask2Data.sources.map(s => s.pageNumber);
    assert(pageNumbers.includes(1) && pageNumbers.includes(2), `Citations span multiple pages: [${pageNumbers.join(', ')}]`);

    // TEST 3: Switch to Document B -> verify strict document isolation (no cross-document citations)
    console.log('\n[TEST 3] Switch to Document B (CheatShield_Report.pdf) -> Strict Isolation Test');
    const ask3Res = await makeRequest('/api/ai/ask', 'POST', {
      documentId: docBId,
      query: 'What is the total purchase order amount?'
    }, token);
    const ask3Data = JSON.parse(ask3Res.body);
    assert(ask3Data.sources && ask3Data.sources.length > 0, 'Citations returned for Document B');
    const docBLeak = ask3Data.sources.some(s => s.documentId === docAId);
    assert(!docBLeak, 'NO cross-document leakage: Document A chunks were NOT included in Document B query');

    // TEST 4: Global Retrieval mode across multiple PDFs
    console.log('\n[TEST 4] Global Retrieval Mode (No document selected)');
    const ask4Res = await makeRequest('/api/ai/ask', 'POST', {
      documentId: '',
      query: 'What is the purchase order amount and annual leave entitlement?'
    }, token);
    const ask4Data = JSON.parse(ask4Res.body);
    assert(ask4Data.sources && ask4Data.sources.length >= 2, `Global Retrieval returned ${ask4Data.sources.length} sources across vault`);
    const retrievedDocIds = [...new Set(ask4Data.sources.map(s => s.documentId))];
    assert(retrievedDocIds.includes(docAId) && retrievedDocIds.includes(docBId),
      `Global citations preserve unique document IDs across different files: [${retrievedDocIds.join(', ')}]`);

    // TEST 5: Question whose answer is not present (Refusal / No fake citations)
    console.log('\n[TEST 5] Question not present in document (Grounding Refusal Test)');
    const ask5Res = await makeRequest('/api/ai/ask', 'POST', {
      documentId: docAId,
      query: 'What is the flight refund policy?'
    }, token);
    const ask5Data = JSON.parse(ask5Res.body);
    assert(ask5Data.answer.includes('could not find this information'), 'System cleanly refuses unmentioned question');
    assert(!ask5Data.sources || ask5Data.sources.length === 0, 'No fake citations or View Source buttons returned for refused query');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`📊 View Source Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
