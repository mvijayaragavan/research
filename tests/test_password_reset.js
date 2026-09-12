const http = require('http');

/**
 * Automated Test Suite for EmailJS Automatic Password Reset Flow
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

async function runPasswordResetTests() {
  console.log('===========================================================');
  console.log(' Testing EmailJS Automatic Password Reset Flow');
  console.log('===========================================================');

  const timestamp = Date.now();
  const testUser = {
    name: 'Reset Flow Test User',
    email: `reset_test_${timestamp}@privacyguard.ai`,
    password: 'InitialPassword123!'
  };
  const updatedPassword = 'NewSecretPassword456!';

  try {
    // Step 1: Register Test User
    console.log('\n[Step 1] Registering test user (POST /api/auth/register)...');
    const regRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, testUser);

    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error(`Registration failed with status ${regRes.status}: ${JSON.stringify(regRes.body)}`);
    }
    console.log(`✓ PASS: User registered (${testUser.email}).`);

    // Step 2: Request Password Reset
    console.log('\n[Step 2] Requesting password reset (POST /api/auth/forgot-password)...');
    const forgotRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/forgot-password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: testUser.email });

    console.log(`Response status: ${forgotRes.status}`);
    console.log(`Response body: ${JSON.stringify(forgotRes.body)}`);

    if (forgotRes.status !== 200 || !forgotRes.body.success || !forgotRes.body.resetLink) {
      throw new Error(`Forgot password request failed: ${JSON.stringify(forgotRes.body)}`);
    }
    console.log(`✓ PASS: Password reset request successful. EmailJS dispatched.`);
    
    // Extract raw token from reset link
    const resetLink = forgotRes.body.resetLink;
    const urlParams = new URLSearchParams(resetLink.split('?')[1]);
    const rawToken = urlParams.get('token');

    if (!rawToken) {
      throw new Error(`Failed to extract reset token from link: ${resetLink}`);
    }
    console.log(`✓ Extracted raw reset token: ${rawToken.substring(0, 8)}...`);

    // Step 3: Verify Reset Token
    console.log('\n[Step 3] Verifying reset token validity (POST /api/auth/verify-reset-token)...');
    const verifyRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/verify-reset-token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { token: rawToken });

    console.log(`Response status: ${verifyRes.status}`);
    if (verifyRes.status !== 200 || !verifyRes.body.valid || verifyRes.body.userEmail !== testUser.email.toLowerCase()) {
      throw new Error(`Token verification failed: ${JSON.stringify(verifyRes.body)}`);
    }
    console.log(`✓ PASS: Token verified valid for user ${verifyRes.body.userEmail}.`);

    // Step 4: Reset Password
    console.log('\n[Step 4] Resetting password with new credentials (POST /api/auth/reset-password)...');
    const resetRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/reset-password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      token: rawToken,
      newPassword: updatedPassword
    });

    console.log(`Response status: ${resetRes.status}`);
    if (resetRes.status !== 200 || !resetRes.body.success) {
      throw new Error(`Password reset failed: ${JSON.stringify(resetRes.body)}`);
    }
    console.log(`✓ PASS: Password reset completed successfully.`);

    // Step 5: Test Login with New Password
    console.log('\n[Step 5] Logging in with updated password (POST /api/auth/login)...');
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: testUser.email,
      password: updatedPassword
    });

    console.log(`Response status: ${loginRes.status}`);
    if (loginRes.status !== 200 || !loginRes.body.token) {
      throw new Error(`Login with new password failed: ${JSON.stringify(loginRes.body)}`);
    }
    console.log(`✓ PASS: Logged in successfully with new password! Received fresh JWT token.`);

    // Step 6: Verify Single-Use Invalidation (Token should no longer be valid)
    console.log('\n[Step 6] Verifying token invalidation (Re-using token after reset)...');
    const reuseRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/verify-reset-token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { token: rawToken });

    console.log(`Response status: ${reuseRes.status}`);
    if (reuseRes.status !== 400 || reuseRes.body.valid === true) {
      throw new Error(`Token single-use enforcement failed! Re-used token was accepted.`);
    }
    console.log(`✓ PASS: Token single-use enforcement validated. Re-used token was rejected (400 Bad Request).`);

    console.log('\n===========================================================');
    console.log(' ALL AUTOMATIC PASSWORD RESET TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
    process.exit(1);
  }
}

runPasswordResetTests();
