/**
 * Automated Integration Test Suite for PDF Reader & Intelligence Dashboard
 */

async function runPdfDashboardTests() {
  console.log('===========================================================');
  console.log(' Testing PDF Reader & Intelligence Dashboard End-to-End');
  console.log('===========================================================');

  const timestamp = Date.now();
  const testUser = {
    name: 'Dashboard Test User',
    email: `pdf_user_${timestamp}@privacyguard.ai`,
    password: 'SecurePassword123!'
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

    // 2. Upload Sample Document via FormData
    console.log('\n[Step 2] Uploading sample PDF document...');
    const textContent = 
      `1. OBLIGATIONS & SERVICES\nThis Master Service Agreement shall govern all software development services rendered by the Provider.\n\n` +
      `2. TERMINATION CLAUSE\nEither party may terminate this agreement upon giving 30 days written notice. Contract expiry date is 31 December 2026.\n\n` +
      `3. PRIVACY & COMPLIANCE\nAll customer PII shall be handled in strict accordance with GDPR and PrivacyGuard AI Gateway standards.`;

    const blob = new Blob([textContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('title', 'Master Enterprise Service Agreement 2026');
    formData.append('document', blob, 'agreement.txt');
    formData.append('classification', 'CONFIDENTIAL');

    const uploadReq = await fetch('http://localhost:5000/api/documents/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const uploadRes = await uploadReq.json();

    console.log(`Response Status: ${uploadReq.status}`);
    if (!uploadReq.ok || !uploadRes.document) {
      throw new Error(`Document upload failed: ${JSON.stringify(uploadRes)}`);
    }
    const docId = uploadRes.document.id;
    console.log(`✓ PASS: Document uploaded successfully (ID: ${docId}). Total pages: ${uploadRes.document.totalPages || 1}`);

    // 3. Fetch Dashboard Stats
    console.log('\n[Step 3] Fetching Dashboard Stats (GET /api/documents/dashboard-stats)...');
    const statsReq = await fetch('http://localhost:5000/api/documents/dashboard-stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const statsRes = await statsReq.json();

    console.log(`Response Status: ${statsReq.status}`);
    if (!statsReq.ok || !statsRes.stats) {
      throw new Error(`Dashboard stats request failed: ${JSON.stringify(statsRes)}`);
    }
    console.log(`✓ PASS: Total Documents = ${statsRes.stats.totalDocuments}, Continue Reading Title = "${statsRes.continueReading ? statsRes.continueReading.title : 'None'}"`);

    // 4. Update Reading Progress
    console.log('\n[Step 4] Updating Reading Progress (PUT /api/documents/:id/progress)...');
    const progressReq = await fetch(`http://localhost:5000/api/documents/${docId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ pageNumber: 3, totalPages: 10 })
    });
    const progressRes = await progressReq.json();

    console.log(`Response Status: ${progressReq.status}`);
    if (!progressReq.ok || progressRes.progressPercent !== 30) {
      throw new Error(`Update progress failed: ${JSON.stringify(progressRes)}`);
    }
    console.log(`✓ PASS: Reading progress updated to Page 3 of 10 (${progressRes.progressPercent}%).`);

    // 5. Add Bookmark
    console.log('\n[Step 5] Adding Page Bookmark (POST /api/documents/:id/bookmarks)...');
    const bookmarkReq = await fetch(`http://localhost:5000/api/documents/${docId}/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ pageNumber: 3, title: 'Termination Clause Bookmark' })
    });
    const bookmarkRes = await bookmarkReq.json();

    console.log(`Response Status: ${bookmarkReq.status}`);
    if (!bookmarkReq.ok || !bookmarkRes.bookmarks || bookmarkRes.bookmarks.length === 0) {
      throw new Error(`Bookmark creation failed: ${JSON.stringify(bookmarkRes)}`);
    }
    console.log(`✓ PASS: Bookmark added successfully.`);

    // 6. Add Note
    console.log('\n[Step 6] Adding Personal Note (POST /api/documents/:id/notes)...');
    const noteReq = await fetch(`http://localhost:5000/api/documents/${docId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ pageNumber: 3, content: 'Need legal review on 30 days notice period.' })
    });
    const noteRes = await noteReq.json();

    console.log(`Response Status: ${noteReq.status}`);
    if (!noteReq.ok || !noteRes.notes || noteRes.notes.length === 0) {
      throw new Error(`Note creation failed: ${JSON.stringify(noteRes)}`);
    }
    console.log(`✓ PASS: Note added successfully.`);

    // 7. Test Ask PDF Q&A & Activity Logging
    console.log('\n[Step 7] Testing Ask PDF Q&A (POST /api/ai/ask)...');
    const askReq = await fetch('http://localhost:5000/api/ai/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ documentId: docId, query: 'What is the notice period for termination?' })
    });
    const askRes = await askReq.json();

    console.log(`Response Status: ${askReq.status}`);
    if (!askReq.ok || !askRes.answer) {
      throw new Error(`Ask PDF failed: ${JSON.stringify(askRes)}`);
    }
    console.log(`✓ PASS: Ask PDF generated answer with Trust Score ${askRes.verification.trustScore}%.`);

    // 8. Global Search
    console.log('\n[Step 8] Testing Global Search (GET /api/documents/search?q=notice)...');
    const searchReq = await fetch('http://localhost:5000/api/documents/search?q=notice', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const searchRes = await searchReq.json();

    console.log(`Response Status: ${searchReq.status}`);
    if (!searchReq.ok || !searchRes.results || searchRes.results.length === 0) {
      throw new Error(`Global search failed: ${JSON.stringify(searchRes)}`);
    }
    console.log(`✓ PASS: Search returned ${searchRes.results.length} matching document(s).`);

    // 9. Re-verify Dashboard Stats with Bookmarks & Notes
    console.log('\n[Step 9] Verifying updated dashboard stats & activity timeline...');
    const updatedStatsReq = await fetch('http://localhost:5000/api/documents/dashboard-stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const s = await updatedStatsReq.json();

    if (s.stats.totalBookmarks !== 1 || s.stats.totalNotes !== 1 || s.recentActivity.length === 0) {
      throw new Error(`Dashboard stats update failed: ${JSON.stringify(s)}`);
    }
    console.log(`✓ PASS: Dashboard stats verified: Bookmarks=${s.stats.totalBookmarks}, Notes=${s.stats.totalNotes}, Recent Activities=${s.recentActivity.length}.`);

    // 10. Delete Document
    console.log('\n[Step 10] Deleting test document (DELETE /api/documents/:id)...');
    const delReq = await fetch(`http://localhost:5000/api/documents/${docId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const delRes = await delReq.json();

    if (!delReq.ok || !delRes.success) {
      throw new Error(`Document deletion failed: ${JSON.stringify(delRes)}`);
    }
    console.log(`✓ PASS: Test document deleted successfully.`);

    console.log('\n===========================================================');
    console.log(' ALL PDF READER DASHBOARD INTEGRATION TESTS PASSED 100%!');
    console.log('===========================================================');
  } catch (err) {
    console.error(`\n❌ TEST FAILURE: ${err.message}`);
    process.exit(1);
  }
}

runPdfDashboardTests();
