/**
 * Test Suite: Q&A Redirect Bug Fix Verification
 * Tests Express SPA routing, HTML/JS Q&A structure, auth session logic, and RAG execution
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
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===========================================================');
  console.log('🧪 Starting Q&A Redirect Bug Fix Test Suite');
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
    // Test 1: Express SPA fallback route for /ask-question
    console.log('\n[Test 1] Express SPA Route /ask-question Direct URL Access');
    const askRouteRes = await makeRequest('/ask-question');
    assert(askRouteRes.statusCode === 200, `GET /ask-question returned HTTP 200 (Got ${askRouteRes.statusCode})`);
    assert(askRouteRes.body.includes('Grounded AI Q&A Engine'), 'Response body contains Grounded AI Q&A Engine HTML element');
    assert(askRouteRes.body.includes('tab-ask-ai'), 'Response body contains section tab-ask-ai');

    // Test 2: Express SPA fallback route for /ask
    console.log('\n[Test 2] Express SPA Route /ask Alias Direct Access');
    const askAliasRes = await makeRequest('/ask');
    assert(askAliasRes.statusCode === 200, `GET /ask returned HTTP 200 (Got ${askAliasRes.statusCode})`);
    assert(askAliasRes.body.includes('tab-ask-ai'), 'Response body contains section tab-ask-ai');

    // Test 3: Express SPA fallback route for /dashboard
    console.log('\n[Test 3] Express SPA Route /dashboard Direct Access');
    const dashRouteRes = await makeRequest('/dashboard');
    assert(dashRouteRes.statusCode === 200, `GET /dashboard returned HTTP 200 (Got ${dashRouteRes.statusCode})`);

    // Test 4: Frontend HTML Form & JS Handler Wire-Up Audit
    console.log('\n[Test 4] Frontend HTML & JS Q&A Component Audit');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../frontend/js/app.js'), 'utf8');

    assert(indexHtml.includes('id="ask-ai-form"') && indexHtml.includes('onsubmit="handleAskAiSubmit(event)"'), 
      'ask-ai-form has explicit onsubmit="handleAskAiSubmit(event)" handler');
    assert(indexHtml.includes('option value="">Global Retrieval (Search All Index)</option>'), 
      'ai-doc-select defaults to Global Retrieval without forcing document selection');
    assert(appJs.includes("'tab-ask-ai': '/ask-question'"), 
      'app.js ROUTE_MAP maps tab-ask-ai directly to /ask-question');
    assert(appJs.includes("path === '/ask-question' || path === '/ask'"), 
      'app.js handleInitialRouting handles direct URL access to /ask-question and /ask');
    assert(appJs.includes('window.history.pushState'), 
      'app.js updates browser history state during tab navigation');
    assert(!appJs.includes("switchNavTab('tab-dashboard')") || appJs.split("switchNavTab('tab-dashboard')").length <= 2, 
      'No unintended redirects to tab-dashboard after loading or submitting Q&A');

    // Test 5: Authentication & Q&A RAG Endpoint Functionality
    console.log('\n[Test 5] Authenticated User Q&A Flow (/api/ai/ask)');
    const testUser = {
      name: 'Q&A Tester',
      email: `qa_test_${Date.now()}@privacyguard.ai`,
      password: 'Password123!'
    };

    const regRes = await makeRequest('/api/auth/register', 'POST', testUser);
    const regData = JSON.parse(regRes.body);
    assert(regData.success && regData.token, 'Registered test user successfully');

    const token = regData.token;

    // Test Global Retrieval via API
    console.log('  Testing Q&A Global Retrieval (No Document Selected)...');
    const globalAskRes = await makeRequest('/api/ai/ask', 'POST', {
      documentId: '',
      query: 'What is the leave entitlement or balance score?'
    }, token);

    const globalAskData = JSON.parse(globalAskRes.body);
    assert(globalAskData.success === true, 'Global Q&A returned success = true without document selection requirement');
    assert(typeof globalAskData.answer === 'string' && globalAskData.answer.length > 0, 'Global Q&A returned non-empty answer');
    assert(globalAskData.verification && typeof globalAskData.verification.trustScore === 'number', 'Global Q&A returned trust score verification');

    // Test Specific Document Retrieval via API
    const docsRes = await makeRequest('/api/documents', 'GET', null, token);
    const docsData = JSON.parse(docsRes.body);
    if (docsData.success && docsData.documents && docsData.documents.length > 0) {
      const targetDoc = docsData.documents[0];
      console.log(`  Testing Q&A with pre-selected document ID: ${targetDoc._id} (${targetDoc.title})...`);

      const docAskRes = await makeRequest('/api/ai/ask', 'POST', {
        documentId: targetDoc._id,
        query: 'What are the details of this document?'
      }, token);

      const docAskData = JSON.parse(docAskRes.body);
      assert(docAskData.success === true, `Q&A for document ${targetDoc._id} returned success = true`);
      assert(docAskData.sources && Array.isArray(docAskData.sources), 'Q&A response includes verified source citations array');
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
