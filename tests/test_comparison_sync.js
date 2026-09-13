const connectDB = require('../backend/config/db');
const Document = require('../backend/models/Document');
const DocumentChunk = require('../backend/models/DocumentChunk');
const User = require('../backend/models/User');
const { compareDocuments } = require('../backend/controllers/comparisonController');

async function testComparisonSyncSuite() {
  console.log('===========================================================');
  console.log(' READDOCX — COMPARISON EXTRACTION & SYNC TEST SUITE');
  console.log('===========================================================');

  await connectDB();

  try {
    // 1. Create or get test user
    let user = await User.findOne({ email: 'comp_sync_test@privacyguard.ai' });
    if (!user) {
      user = await User.create({
        name: 'Comp Sync Tester',
        email: 'comp_sync_test@privacyguard.ai',
        password: 'Password123!',
        role: 'USER'
      });
    }

    const mockReq = (docAId, docBId) => ({
      user: { id: user._id.toString(), role: 'USER' },
      body: { documentAId: docAId.toString(), documentBId: docBId.toString() }
    });

    const mockRes = (resolve) => ({
      status: (statusCode) => ({
        json: (data) => resolve({ statusCode, data })
      })
    });

    function runCompareController(docAId, docBId) {
      return new Promise((resolve) => {
        const req = mockReq(docAId, docBId);
        const res = mockRes(resolve);
        const next = (err) => resolve({ statusCode: 500, data: { error: err ? err.message : 'Unknown error' } });
        compareDocuments(req, res, next);
      });
    }

    let passed = 0;

    // --- TEST 1: Similar Resumes ---
    console.log('\n[Test 1] Similar Resumes (Python Java Docker AWS Git)...');
    const resumeTextA = 'Python Developer with expertise in Java, Docker, AWS, and Git.';
    const resumeTextB = 'Senior Engineer specializing in Python, Java, Docker, AWS, and Git.';

    const doc1A = await Document.create({
      owner: user._id,
      title: 'Resume A',
      fileName: 'ResumeA.pdf',
      fileSize: 1024,
      rawText: resumeTextA,
      minimizedText: resumeTextA,
      extractionMethod: 'native'
    });
    await DocumentChunk.create({
      documentId: doc1A._id,
      ownerId: user._id,
      chunkIndex: 1,
      pageNumber: 1,
      rawChunkText: resumeTextA,
      minimizedChunkText: resumeTextA
    });

    const doc1B = await Document.create({
      owner: user._id,
      title: 'Resume B',
      fileName: 'ResumeB.pdf',
      fileSize: 1024,
      rawText: resumeTextB,
      minimizedText: resumeTextB,
      extractionMethod: 'native'
    });
    await DocumentChunk.create({
      documentId: doc1B._id,
      ownerId: user._id,
      chunkIndex: 1,
      pageNumber: 1,
      rawChunkText: resumeTextB,
      minimizedChunkText: resumeTextB
    });

    const res1 = await runCompareController(doc1A._id, doc1B._id);
    const sim1 = res1.data.result ? res1.data.result.documentSimilarity : 0;
    console.log('  Similarity Output:', `${sim1}%`);
    if (res1.statusCode === 200 && sim1 > 0) {
      console.log('  ✓ PASS: Similar resumes successfully returned similarity > 0%.');
      passed++;
    } else {
      console.error('  ❌ FAIL: Similar resumes test failed.', res1.data);
    }

    // --- TEST 2: Completely Different Documents ---
    console.log('\n[Test 2] Completely Different Documents (Tech vs HR Policy)...');
    const textDiffB = 'Employees receive 20 days annual leave. Contract salary limit is 50000.';
    const doc2B = await Document.create({
      owner: user._id,
      title: 'HR Policy',
      fileName: 'HRPolicy.pdf',
      fileSize: 1024,
      rawText: textDiffB,
      minimizedText: textDiffB,
      extractionMethod: 'native'
    });
    await DocumentChunk.create({
      documentId: doc2B._id,
      ownerId: user._id,
      chunkIndex: 1,
      pageNumber: 1,
      rawChunkText: textDiffB,
      minimizedChunkText: textDiffB
    });

    const res2 = await runCompareController(doc1A._id, doc2B._id);
    const sim2 = res2.data.result ? res2.data.result.documentSimilarity : 0;
    console.log('  Similarity Output:', `${sim2}%`);
    if (res2.statusCode === 200 && sim2 === 0) {
      console.log('  ✓ PASS: Completely different documents correctly returned 0% similarity.');
      passed++;
    } else {
      console.error('  ❌ FAIL: Different documents test failed.', res2.data);
    }

    // --- TEST 3: Document with Missing Chunks (Auto Rebuild) ---
    console.log('\n[Test 3] Document A has rawText but 0 DocumentChunk records (Auto Rebuild)...');
    const doc3A = await Document.create({
      owner: user._id,
      title: 'Resume No Chunks',
      fileName: 'ResumeNoChunks.pdf',
      fileSize: 1024,
      rawText: resumeTextA,
      minimizedText: resumeTextA,
      extractionMethod: 'native'
    });
    // Deliberately do NOT create DocumentChunks for doc3A

    const res3 = await runCompareController(doc3A._id, doc1B._id);
    const chunks3AAfter = await DocumentChunk.countDocuments({ documentId: doc3A._id });
    const sim3 = res3.data.result ? res3.data.result.documentSimilarity : 0;
    console.log('  Chunks rebuilt count:', chunks3AAfter);
    console.log('  Similarity Output:', `${sim3}%`);

    if (res3.statusCode === 200 && chunks3AAfter > 0 && sim3 > 0) {
      console.log('  ✓ PASS: Missing chunks automatically rebuilt and comparison succeeded!');
      passed++;
    } else {
      console.error('  ❌ FAIL: Missing chunk auto-rebuild failed.', res3.data);
    }

    // --- TEST 4: Both Documents Missing Chunks ---
    console.log('\n[Test 4] Both Document A and B have 0 DocumentChunk records...');
    const doc4B = await Document.create({
      owner: user._id,
      title: 'Resume B No Chunks',
      fileName: 'ResumeBNoChunks.pdf',
      fileSize: 1024,
      rawText: resumeTextB,
      minimizedText: resumeTextB,
      extractionMethod: 'native'
    });
    // Deliberately no chunks for doc4B either

    const res4 = await runCompareController(doc3A._id, doc4B._id);
    const chunks4AAfter = await DocumentChunk.countDocuments({ documentId: doc3A._id });
    const chunks4BAfter = await DocumentChunk.countDocuments({ documentId: doc4B._id });
    const sim4 = res4.data.result ? res4.data.result.documentSimilarity : 0;
    console.log(`  Rebuilt Chunks -> Doc A: ${chunks4AAfter}, Doc B: ${chunks4BAfter}`);
    console.log('  Similarity Output:', `${sim4}%`);

    if (res4.statusCode === 200 && chunks4AAfter > 0 && chunks4BAfter > 0 && sim4 > 0) {
      console.log('  ✓ PASS: Both documents missing chunks automatically rebuilt and comparison succeeded!');
      passed++;
    } else {
      console.error('  ❌ FAIL: Both docs missing chunks test failed.', res4.data);
    }

    // --- TEST 5: Blank / Unreadable PDF Handling ---
    console.log('\n[Test 5] Blank / Unreadable PDF (INSUFFICIENT_SOURCE)...');
    const doc5A = await Document.create({
      owner: user._id,
      title: 'Blank Corrupted PDF',
      fileName: 'Blank.pdf',
      fileSize: 1024,
      rawText: '[Document: Scanned or image-only PDF - text content not extractable]',
      minimizedText: '[Document: Scanned or image-only PDF - text content not extractable]',
      extractionMethod: 'none'
    });

    const res5 = await runCompareController(doc5A._id, doc1B._id);
    console.log('  Status Code:', res5.statusCode);
    console.log('  Status Response:', res5.data.status || res5.data.result.verificationStatus);

    if (res5.statusCode === 200 && (res5.data.status === 'INSUFFICIENT_SOURCE' || res5.data.result.verificationStatus === 'INSUFFICIENT_SOURCE')) {
      console.log('  ✓ PASS: Blank/unreadable PDF correctly returned INSUFFICIENT_SOURCE (not 0% similarity).');
      passed++;
    } else {
      console.error('  ❌ FAIL: Unreadable PDF test failed.', res5.data);
    }

    console.log('\n===========================================================');
    console.log(`  PASSED ${passed} / 5 COMPARISON EXTRACTION & SYNC TESTS`);
    console.log('===========================================================');

    if (passed === 5) {
      console.log('\n🎉 ALL COMPARISON EXTRACTION & SYNC TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('\n❌ SOME COMPARISON EXTRACTION TESTS FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Comparison sync test suite exception:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  testComparisonSyncSuite();
}

module.exports = { testComparisonSyncSuite };
