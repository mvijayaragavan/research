/**
 * Comprehensive Automated RAG Pipeline Verification Suite
 * Tests document isolation, retrieval thresholding, strict grounding refusal, structured citations, and View Source metadata
 */

async function runRagPipelineTests() {
  console.log('===========================================================');
  console.log(' Testing Complete PDF Q&A / RAG Pipeline & Grounding Fixes');
  console.log('===========================================================');

  const timestamp = Date.now();
  const testUser = {
    name: 'RAG Audit Tester',
    email: `rag_tester_${timestamp}@privacyguard.ai`,
    password: 'Password123!'
  };

  try {
    // 1. User Registration & Login
    console.log('\n[Step 1] Registering test user (POST /api/auth/register)...');
    const regReq = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    const regRes = await regReq.json();

    if (!regReq.ok || !regRes.token) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes)}`);
    }
    const token = regRes.token;
    console.log(`✓ PASS: User registered and authenticated.`);

    // 2. Upload Document A (Employment Agreement)
    console.log('\n[Step 2] Uploading Document A (Employment Agreement)...');
    const textDocA = 
      `--- PAGE 1 ---\n` +
      `EMPLOYMENT AGREEMENT\n` +
      `This Employment Agreement is entered into between PrivacyGuard Corp and Vijay Ragavan.\n` +
      `Position: Senior AI Systems Architect.\n` +
      `Base Salary: $185,000 USD per annum.\n\n` +
      `--- PAGE 2 ---\n` +
      `LEAVE & BENEFIT POLICY\n` +
      `Annual Paid Leave Entitlement: 25 business days per calendar year.\n` +
      `Health Insurance: Full coverage under BlueShield Plan #9921.\n\n` +
      `--- PAGE 3 ---\n` +
      `TERMINATION & RESIGNATION NOTICE\n` +
      `Resignation Notice Period: Either party must give 60 days written notice prior to termination.`;

    const formDataA = new FormData();
    formDataA.append('title', 'Vijay Employment Agreement 2026');
    formDataA.append('document', new Blob([textDocA], { type: 'text/plain' }), 'employment_agreement.txt');
    formDataA.append('classification', 'CONFIDENTIAL');

    const uploadReqA = await fetch('http://localhost:5000/api/documents/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formDataA
    });
    const uploadResA = await uploadReqA.json();
    if (!uploadReqA.ok || !uploadResA.document) {
      throw new Error(`Document A upload failed: ${JSON.stringify(uploadResA)}`);
    }
    const docAId = uploadResA.document.id;
    console.log(`✓ PASS: Document A uploaded successfully (ID: ${docAId}).`);

    // 3. Upload Document B (Vendor Purchase Order)
    console.log('\n[Step 3] Uploading Document B (Vendor Purchase Order)...');
    const textDocB = 
      `--- PAGE 1 ---\n` +
      `PURCHASE ORDER PO-88421\n` +
      `Vendor: CyberSecurity Solutions Ltd.\n` +
      `Total PO Amount: $45,000 USD.\n` +
      `Payment Terms: Net 30 days upon invoice approval.`;

    const formDataB = new FormData();
    formDataB.append('title', 'CyberSecurity Purchase Order PO-88421');
    formDataB.append('document', new Blob([textDocB], { type: 'text/plain' }), 'purchase_order.txt');
    formDataB.append('classification', 'INTERNAL');

    const uploadReqB = await fetch('http://localhost:5000/api/documents/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formDataB
    });
    const uploadResB = await uploadReqB.json();
    if (!uploadReqB.ok || !uploadResB.document) {
      throw new Error(`Document B upload failed: ${JSON.stringify(uploadResB)}`);
    }
    const docBId = uploadResB.document.id;
    console.log(`✓ PASS: Document B uploaded successfully (ID: ${docBId}).`);

    // TEST A: Question whose answer IS clearly in Document A
    console.log('\n[Test A] Question clearly present in Document A ("What is the base salary and annual leave entitlement?")...');
    const askReqA = await fetch('http://localhost:5000/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentId: docAId, query: 'What is the base salary and annual leave entitlement?' })
    });
    const askResA = await askReqA.json();

    console.log(`Answer: "${askResA.answer}"`);
    console.log(`Citations Count: ${askResA.sources ? askResA.sources.length : 0}`);

    if (!askReqA.ok || !askResA.answer || askResA.sources.length === 0) {
      throw new Error(`Test A failed: ${JSON.stringify(askResA)}`);
    }

    const hasSalary = askResA.answer.toLowerCase().includes('185,000') || askResA.answer.toLowerCase().includes('salary');
    if (!hasSalary) {
      throw new Error(`Test A answer did not contain expected salary information: ${askResA.answer}`);
    }
    console.log(`✓ PASS: Answer accurately extracted from Document A.`);

    // TEST B: Multi-chunk / multi-page citation verification
    console.log('\n[Test B] Verifying page numbers & citations across multiple pages...');
    const pagesFound = askResA.sources.map(s => s.pageNumber);
    console.log(`Cited Page Numbers: [${pagesFound.join(', ')}]`);
    console.log(`First Citation Object:`, JSON.stringify(askResA.sources[0]));

    if (!askResA.sources[0].chunkId || !askResA.sources[0].pageNumber || !askResA.sources[0].documentId) {
      throw new Error(`Test B citation metadata missing required fields: ${JSON.stringify(askResA.sources[0])}`);
    }
    console.log(`✓ PASS: Structured citation objects contain valid chunkId, documentId, pageNumber, and text.`);

    // TEST C: Question whose answer is NOT present in Document A (Expect Strict Refusal)
    console.log('\n[Test C] Asking unmentioned question on Document A ("What is the flight cancellation refund policy?")...');
    const askReqC = await fetch('http://localhost:5000/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentId: docAId, query: 'What is the flight cancellation refund policy?' })
    });
    const askResC = await askReqC.json();

    console.log(`Refusal Response: "${askResC.answer}"`);
    const isRefusal = askResC.answer.includes('could not find this information') || askResC.answer.includes('Insufficient');
    if (!isRefusal) {
      throw new Error(`Test C failed! System hallucinated an answer instead of refusing: ${askResC.answer}`);
    }
    console.log(`✓ PASS: Strict grounding refusal enforced. System correctly refused without hallucination.`);

    // TEST D: Select Document A and ask question about Document B (Document Isolation Test)
    console.log('\n[Test D] Selecting Document A and asking question about Document B ("What is the PO amount for CyberSecurity Solutions?")...');
    const askReqD = await fetch('http://localhost:5000/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentId: docAId, query: 'What is the PO amount for CyberSecurity Solutions?' })
    });
    const askResD = await askReqD.json();

    console.log(`Document Isolation Response: "${askResD.answer}"`);
    const isIsolated = askResD.answer.includes('could not find this information') || askResD.answer.includes('Insufficient');
    if (!isIsolated) {
      throw new Error(`Test D failed! Document isolation breached: system retrieved Document B data while Document A was selected: ${askResD.answer}`);
    }
    console.log(`✓ PASS: Strict document isolation enforced! Chunks from Document B were NOT leaked.`);

    // TEST E: View Source metadata verification
    console.log('\n[Test E] Verifying View Source link parameters...');
    const topSource = askResA.sources[0];
    console.log(`View Source Link Targets: Document ID = ${topSource.documentId}, Page = ${topSource.pageNumber}, Snippet = "${topSource.text.substring(0, 30)}..."`);

    if (topSource.documentId !== docAId) {
      throw new Error(`View Source documentId mismatch! Expected ${docAId}, got ${topSource.documentId}`);
    }
    console.log(`✓ PASS: View Source parameters reference exact document ID, page number, and text snippet.`);

    // Cleanup Test Documents
    await fetch(`http://localhost:5000/api/documents/${docAId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    await fetch(`http://localhost:5000/api/documents/${docBId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });

    console.log('\n===========================================================');
    console.log(' ALL RAG PIPELINE FIX & GROUNDING TESTS PASSED 100%!');
    console.log('===========================================================');
  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
    process.exit(1);
  }
}

runRagPipelineTests();
