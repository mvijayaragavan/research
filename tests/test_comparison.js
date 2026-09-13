async function testComparisonSuite() {
  console.log('===========================================================');
  console.log(' READDOCX — ACCURACY & COMPARISON TEST SUITE (10 SCENARIOS)');
  console.log('===========================================================');

  const pythonUrl = 'http://localhost:8000';

  const http = require('http');

  function runDirectCompare(docAName, textA, docBName, textB, pageA = 1, pageB = 1) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        documentAName: docAName,
        documentAChunks: [{ chunkIndex: 1, pageNumber: pageA, rawChunkText: textA, minimizedChunkText: textA }],
        documentBName: docBName,
        documentBChunks: [{ chunkIndex: 1, pageNumber: pageB, rawChunkText: textB, minimizedChunkText: textB }]
      });

      const req = http.request({
        hostname: 'localhost',
        port: 8000,
        path: '/compare',
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  let passedTests = 0;

  // Test 1 — Case Difference (HTML vs html)
  console.log('\n[Test 1] Case Difference ("HTML" vs "html")...');
  const res1 = await runDirectCompare('DocA.pdf', 'HTML', 'DocB.pdf', 'html');
  const hasUnchanged1 = res1.summary.unchanged >= 1 || res1.differences.some(d => d.status === 'UNCHANGED');
  if (hasUnchanged1 && res1.summary.added === 0 && res1.summary.removed === 0) {
    console.log('  ✓ PASS: HTML vs html correctly identified as UNCHANGED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Case difference failed.', res1.summary);
  }

  // Test 2 — Mixed Case (JavaScript vs JAVASCRIPT)
  console.log('\n[Test 2] Mixed Case ("JavaScript" vs "JAVASCRIPT")...');
  const res2 = await runDirectCompare('DocA.pdf', 'JavaScript', 'DocB.pdf', 'JAVASCRIPT');
  const hasUnchanged2 = res2.summary.unchanged >= 1 || res2.differences.some(d => d.status === 'UNCHANGED');
  if (hasUnchanged2 && res2.summary.added === 0 && res2.summary.removed === 0) {
    console.log('  ✓ PASS: JavaScript vs JAVASCRIPT correctly identified as UNCHANGED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Mixed case test failed.', res2.summary);
  }

  // Test 3 — Different Location (Page 2 HTML CSS vs Page 7 CSS HTML)
  console.log('\n[Test 3] Different Location (Page 2: HTML CSS vs Page 7: CSS HTML)...');
  const res3 = await runDirectCompare('DocA.pdf', 'HTML\nCSS', 'DocB.pdf', 'CSS\nHTML', 2, 7);
  const unchangedCount3 = res3.summary.unchanged;
  if (unchangedCount3 >= 2) {
    console.log('  ✓ PASS: Reordered skills across different pages correctly identified as UNCHANGED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Location independent test failed.', res3.summary);
  }

  // Test 4 — Added Technology (HTML CSS vs HTML CSS Docker)
  console.log('\n[Test 4] Added Technology ("HTML CSS" vs "HTML CSS Docker")...');
  const res4 = await runDirectCompare('DocA.pdf', 'HTML\nCSS', 'DocB.pdf', 'HTML\nCSS\nDocker');
  const hasAddedDocker = res4.differences.some(d => d.status === 'ADDED' && d.topic.includes('Docker'));
  if (hasAddedDocker) {
    console.log('  ✓ PASS: Docker correctly identified as ADDED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Added technology test failed.', res4.differences);
  }

  // Test 5 — Removed Technology (HTML CSS Docker vs HTML CSS)
  console.log('\n[Test 5] Removed Technology ("HTML CSS Docker" vs "HTML CSS")...');
  const res5 = await runDirectCompare('DocA.pdf', 'HTML\nCSS\nDocker', 'DocB.pdf', 'HTML\nCSS');
  const hasRemovedDocker = res5.differences.some(d => d.status === 'REMOVED' && d.topic.includes('Docker'));
  if (hasRemovedDocker) {
    console.log('  ✓ PASS: Docker correctly identified as REMOVED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Removed technology test failed.', res5.differences);
  }

  // Test 6 — Numeric Modification (20 days vs 25 days)
  console.log('\n[Test 6] Numeric Modification ("20 days" vs "25 days")...');
  const res6 = await runDirectCompare('DocA.pdf', 'Employees receive 20 days of annual leave.', 'DocB.pdf', 'Employees receive 25 days of annual leave.');
  const hasMod6 = res6.differences.some(d => d.status === 'MODIFIED' && d.change.includes('20') && d.change.includes('25'));
  if (hasMod6) {
    console.log('  ✓ PASS: Annual leave update (20 days → 25 days) correctly identified as MODIFIED');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Numeric modification test failed.', res6.differences);
  }

  // Test 7 — Java vs JavaScript
  console.log('\n[Test 7] Skill Distinction ("Java" vs "JavaScript")...');
  const res7 = await runDirectCompare('DocA.pdf', 'Java', 'DocB.pdf', 'JavaScript');
  const notIdentical7 = !res7.differences.some(d => d.status === 'UNCHANGED' && d.topic.includes('Java') && d.topic.includes('JavaScript'));
  if (notIdentical7) {
    console.log('  ✓ PASS: Java and JavaScript are strictly distinguished (NOT treated as same)');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Java vs JavaScript test failed.', res7.differences);
  }

  // Test 8 — C++ vs C
  console.log('\n[Test 8] Special Character Tech ("C++" vs "C")...');
  const res8 = await runDirectCompare('DocA.pdf', 'C++', 'DocB.pdf', 'C');
  const cPlusPlusRemoved = res8.differences.some(d => (d.status === 'REMOVED' || d.status === 'MODIFIED') && d.topic.includes('C++'));
  if (cPlusPlusRemoved) {
    console.log('  ✓ PASS: C++ and C are strictly distinguished without stripping ++');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: C++ vs C test failed.', res8.differences);
  }

  // Test 9 — Page Numbers Ignored (-- 1 of 4 -- vs -- 2 of 4 --)
  console.log('\n[Test 9] Structural Noise Ignored ("-- 1 of 4 --" vs "-- 2 of 4 --")...');
  const res9 = await runDirectCompare('DocA.pdf', '-- 1 of 4 --\nHTML', 'DocB.pdf', '-- 2 of 4 --\nHTML');
  const noContradiction9 = res9.summary.contradictions === 0 && res9.internalContradictions.length === 0;
  if (noContradiction9) {
    console.log('  ✓ PASS: Page markers correctly IGNORED and NOT flagged as contradiction');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Page number structural noise test failed.', res9);
  }

  // Test 10 — Internal Contradiction Detection
  console.log('\n[Test 10] Internal Contradiction Detection (Page 5: ₹40,000 vs Page 20: ₹50,000)...');
  const textInternal = `Page 5: Salary limit is INR 40,000.\nPage 20: Salary limit is INR 50,000.`;
  const res10 = await runDirectCompare('DocA.pdf', textInternal, 'DocB.pdf', 'Salary limit is INR 40,000.');
  const hasInternalContradiction = res10.internalContradictions && res10.internalContradictions.length > 0;
  if (hasInternalContradiction) {
    console.log('  ✓ PASS: Internal contradiction between Page 5 and Page 20 successfully detected!');
    passedTests++;
  } else {
    console.error('  ❌ FAIL: Internal contradiction test failed.', res10.internalContradictions);
  }

  console.log(`\n===========================================================`);
  console.log(`  PASSED ${passedTests} / 10 EXPLICIT TEST SCENARIOS`);
  console.log(`===========================================================`);

  if (passedTests === 10) {
    console.log('\n✓ ALL 10 ACCURACY & COMPARISON TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n❌ SOME ACCURACY TESTS FAILED.');
    process.exit(1);
  }
}

testComparisonSuite().catch(err => {
  console.error('Test Suite Exception:', err);
  process.exit(1);
});
