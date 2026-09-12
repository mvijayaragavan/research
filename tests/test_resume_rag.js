// Node.js native fetch available

async function uploadResumeAndQuery() {
  console.log('Uploading Vijay Resume to PrivacyGuard Document Vault...');

  // 1. Authenticate / Login
  const loginRes = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'vijay_resume_test@privacyguard.ai',
      password: 'Password123!',
      name: 'Vijay'
    })
  });
  
  let authData = await loginRes.json();
  if (!authData.token) {
    const lRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'vijay_resume_test@privacyguard.ai',
        password: 'Password123!'
      })
    });
    authData = await lRes.json();
  }

  const token = authData.token;

  // 2. Resume Text Payload
  const resumeText = `Vijay - Computer Science Undergraduate
Email: vijayaragavan681@gmail.com | Phone: +1 6246075049
Location: Tirunelveli, India

SUMMARY
Computer Science undergraduate with experience building scalable web applications and secure backend services.

EDUCATION
Bachelor of Engineering in Computer Science and Engineering
PSG College of Technology, Coimbatore

SKILLS
Programming Languages: Java, C, Python
Databases: MySQL, MongoDB
Web Technologies: HTML, CSS, JavaScript, Node.js

PROJECTS
ScholarPrep | GitHub
- Developed a MERN-based placement preparation platform featuring company-specific mock tests, performance analytics, and an alumni interaction portal.
- Built an AI-assisted MCQ generation system using LangChain, Google Gemini, and Groq, leveraging RAG with embeddings and cosine similarity for context-aware question generation.
- Implemented a staff approval workflow to verify AI-generated questions before publishing them to the student question repository.
- Designed secure REST APIs with JWT authentication and integrated MongoDB for managing users, companies, interview blueprints, and MCQs.

Research Paper Summarizer | GitHub
- Built an end-to-end system to analyze and summarize research papers using a Retrieval-Augmented Generation (RAG) pipeline.
- Developed backend services using FastAPI for document processing, querying, and response generation.
- Engineered and benchmarked the RAG workflow with real-time performance logging, achieving semantic retrieval latency as low as 1.2s and end-to-end response generation under 15s.
`;

  const blob = new Blob([resumeText], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('title', 'Vijay Resume - Technical Profile');
  formData.append('document', blob, 'vijay_resume.txt');
  formData.append('classification', 'CONFIDENTIAL');

  const uploadRes = await fetch('http://localhost:5000/api/documents/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  const uploadData = await uploadRes.json();
  console.log('Upload Result:', uploadData);

  if (!uploadData.success) {
    console.error('Failed to upload resume.');
    return;
  }

  const docId = uploadData.document.id;

  // 3. Query AI Grounded Engine
  const askRes = await fetch('http://localhost:5000/api/ai/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      documentId: docId,
      query: 'What features were built for the ScholarPrep project?'
    })
  });

  const askData = await askRes.json();
  console.log('\n--- AI GROUNDED RESPONSE ---');
  console.log('Answer:\n', askData.answer);
  console.log('Verification Status:', askData.verification.status);
  console.log('Trust Score:', askData.verification.trustScore + '%');
}

uploadResumeAndQuery().catch(console.error);
