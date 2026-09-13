const { verifyAnswerAgainstSources } = require('../backend/utils/verificationEngine');

async function runRagLogicTests() {
  console.log('===========================================================');
  console.log(' Starting RAG Logic & Verification Engine Unit Tests');
  console.log('===========================================================\n');

  const docChunks = [
    {
      chunkIndex: 1,
      pageNumber: 1,
      rawChunkText: 'Life Balance Score - Student Activity Tracking System using Neo4j Graph Database. Introduction: This project tracks student study hours, exercise, and social activities.'
    },
    {
      chunkIndex: 2,
      pageNumber: 1,
      rawChunkText: 'Technology Stack: Frontend built with HTML, CSS, JavaScript. Backend powered by Node.js, Express, and Neo4j graph database.'
    }
  ];

  // TEST 1: Direct Factual Answer Supported by Doc -> VERIFIED
  console.log('--- TEST 1: Supported Factual Answer ---');
  const answer1 = "The project uses Neo4j graph database.";
  const v1 = verifyAnswerAgainstSources(answer1, docChunks, "What database is used in the project?");
  console.log('Answer:', answer1);
  console.log('Verification Status:', v1.status, '| Trust Score:', v1.trustScore + '%');
  if (v1.status !== 'VERIFIED' || v1.trustScore < 60) {
    throw new Error(`Test 1 Failed: Expected VERIFIED but got ${v1.status} (${v1.trustScore}%)`);
  }
  console.log('✓ TEST 1 PASSED: Factual answer correctly verified.\n');

  // TEST 2: Technology Stack Question -> Direct Answer VERIFIED
  console.log('--- TEST 2: Technology Stack Answer ---');
  const answer2 = "The technology stack consists of HTML, CSS, JavaScript on the frontend, and Node.js, Express, and Neo4j on the backend.";
  const v2 = verifyAnswerAgainstSources(answer2, docChunks, "What is the technology stack?");
  console.log('Answer:', answer2);
  console.log('Verification Status:', v2.status, '| Trust Score:', v2.trustScore + '%');
  if (v2.status !== 'VERIFIED' || v2.trustScore < 60) {
    throw new Error(`Test 2 Failed: Expected VERIFIED but got ${v2.status} (${v2.trustScore}%)`);
  }
  console.log('✓ TEST 2 PASSED: Tech stack answer correctly verified.\n');

  // TEST 3: Ambiguous/Missing Commands Query -> INSUFFICIENT_EVIDENCE
  console.log('--- TEST 3: Missing Commands Query ---');
  const answer3 = "I could not find specific commands in the selected document.";
  const v3 = verifyAnswerAgainstSources(answer3, docChunks, "give the commands?");
  console.log('Answer:', answer3);
  console.log('Verification Status:', v3.status, '| Trust Score:', v3.trustScore + '%');
  if (v3.status !== 'INSUFFICIENT_EVIDENCE' || v3.trustScore !== 0) {
    throw new Error(`Test 3 Failed: Expected INSUFFICIENT_EVIDENCE but got ${v3.status} (${v3.trustScore}%)`);
  }
  console.log('✓ TEST 3 PASSED: Refusal answer correctly marked INSUFFICIENT_EVIDENCE.\n');

  // TEST 4: Unrelated External Knowledge Query -> INSUFFICIENT_EVIDENCE
  console.log('--- TEST 4: Unrelated Question (Capital of Japan) ---');
  const answer4 = "I could not find this information in the selected PDF.";
  const v4 = verifyAnswerAgainstSources(answer4, docChunks, "What is the capital of Japan?");
  console.log('Answer:', answer4);
  console.log('Verification Status:', v4.status, '| Trust Score:', v4.trustScore + '%');
  if (v4.status !== 'INSUFFICIENT_EVIDENCE' || v4.trustScore !== 0) {
    throw new Error(`Test 4 Failed: Expected INSUFFICIENT_EVIDENCE but got ${v4.status} (${v4.trustScore}%)`);
  }
  console.log('✓ TEST 4 PASSED: Out-of-domain query refusal correctly marked INSUFFICIENT_EVIDENCE.\n');

  // TEST 5: Hallucination Prevention (Neo4j Password) -> INSUFFICIENT_EVIDENCE
  console.log('--- TEST 5: Missing Password Query ---');
  const answer5 = "I could not find that information in the selected document.";
  const v5 = verifyAnswerAgainstSources(answer5, docChunks, "What is the exact Neo4j password used by this project?");
  console.log('Answer:', answer5);
  console.log('Verification Status:', v5.status, '| Trust Score:', v5.trustScore + '%');
  if (v5.status !== 'INSUFFICIENT_EVIDENCE' || v5.trustScore !== 0) {
    throw new Error(`Test 5 Failed: Expected INSUFFICIENT_EVIDENCE but got ${v5.status} (${v5.trustScore}%)`);
  }
  console.log('✓ TEST 5 PASSED: Password refusal correctly marked INSUFFICIENT_EVIDENCE.\n');

  // TEST 6: Prevent Raw Passage Dump from Being VERIFIED
  console.log('--- TEST 6: Prevent Raw Passage Dump ---');
  const answer6 = 'Based on PrivacyGuard Gateway analysis of "report.pdf": - Relevant passage: "Life Balance Score - Student Activity Tracking System..."';
  const v6 = verifyAnswerAgainstSources(answer6, docChunks, "give the commands?");
  console.log('Answer:', answer6);
  console.log('Verification Status:', v6.status, '| Trust Score:', v6.trustScore + '%');
  if (v6.status === 'VERIFIED') {
    throw new Error(`Test 6 Failed: Raw passage dump must NOT be VERIFIED`);
  }
  console.log('✓ TEST 6 PASSED: Raw passage dump correctly rejected as VERIFIED.\n');

  console.log('===========================================================');
  console.log(' ALL RAG LOGIC TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('===========================================================');
}

runRagLogicTests().catch(err => {
  console.error('❌ RAG Logic Test Error:', err);
  process.exit(1);
});
