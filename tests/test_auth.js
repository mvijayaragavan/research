const http = require('http');

/**
 * Lightweight Auth Integration Test Script
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runAuthTests() {
  console.log('===========================================================');
  console.log(' Running Milestone 2 Authentication & JWT Integration Tests');
  console.log('===========================================================');

  const testUser = {
    name: 'Vijay Test User',
    email: `test_${Date.now()}@privacyguard.ai`,
    password: 'SecurePassword123!'
  };

  try {
    // Test 1: User Registration
    console.log('\n[Test 1] Testing User Registration (POST /api/auth/register)...');
    const regRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, testUser);

    console.log(`Response Status: ${regRes.status}`);
    console.log(`Returned User Email: ${regRes.body.user ? regRes.body.user.email : 'N/A'}`);
    console.log(`JWT Token Issued: ${regRes.body.token ? 'YES (Valid JWT format)' : 'NO'}`);

    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error('Registration test failed!');
    }
    console.log('✓ PASS: Registration successful.');

    // Test 2: User Login
    console.log('\n[Test 2] Testing User Login (POST /api/auth/login)...');
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: testUser.email,
      password: testUser.password
    });

    console.log(`Response Status: ${loginRes.status}`);
    const token = loginRes.body.token;
    if (loginRes.status !== 200 || !token) {
      throw new Error('Login test failed!');
    }
    console.log('✓ PASS: Login successful and JWT token received.');

    // Test 3: Access Protected Route with Valid Token
    console.log('\n[Test 3] Accessing Protected Profile (GET /api/auth/me) WITH Token...');
    const meRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`Response Status: ${meRes.status}`);
    console.log(`Authenticated Role: ${meRes.body.user ? meRes.body.user.role : 'N/A'}`);
    if (meRes.status !== 200 || meRes.body.user.email !== testUser.email) {
      throw new Error('Protected route verification failed!');
    }
    console.log('✓ PASS: JWT middleware authenticated user profile successfully.');

    // Test 4: Rejection without Token
    console.log('\n[Test 4] Accessing Protected Profile WITHOUT Token...');
    const noTokenRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    console.log(`Response Status: ${noTokenRes.status}`);
    console.log(`Error Message: ${noTokenRes.body.error}`);
    if (noTokenRes.status !== 401) {
      throw new Error('Unauthenticated request was not blocked!');
    }
    console.log('✓ PASS: Gateway deterministically blocked unauthorized request (401 Unauthorized).');

    console.log('\n===========================================================');
    console.log(' ALL MILESTONE 2 AUTHENTICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
  }
}

runAuthTests();
