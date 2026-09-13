# ReadDocX

Read. Retrieve. Verify.

Privacy-Preserving Document Intelligence & Evidence Verification Platform

> ReadDocX is a privacy-preserving document intelligence platform that enables users to securely upload, retrieve, analyze, compare, and verify information from their documents. It combines OCR, privacy-aware processing, evidence-grounded retrieval, source citations, answer verification, and deterministic document comparison to provide trustworthy document-based insights.

---

## 🚀 Key Features

1. **Secure Document Management**: Upload, view, and organize PDFs and text documents with page-level PDF navigation.
2. **PDF Extraction & OCR**: Native text extraction with page-by-page Tesseract OCR fallback for scanned and image-based PDFs.
3. **Privacy-Aware Processing**: Automatic detection of sensitive entities (PII, financial data, internal IDs), sanitization, and context minimization before processing.
4. **Evidence-Grounded Question Answering**: Cross-verifying AI answers against extracted PDF ground-truth chunks to emit transparent **Trust Scores** and verification statuses (`VERIFIED`, `INSUFFICIENT_EVIDENCE`).
5. **Deterministic Document Comparison**: Comparing two documents to detect `SAME`, `MODIFIED`, `ADDED`, and `REMOVED` sections with exact similarity metrics and PDF page navigation.
6. **Contradiction Verification**: Identifying conflicting factual statements across pages within documents or revisions.
7. **Document Productivity Tools**: Personal notes, bookmarks, global search, and automated email reminder notifications.

---

## 🏛️ System Architecture

```
                USER
                  │
                  ▼
             ReadDocX UI
                  │
                  ▼
         Node.js Backend
              PORT 5000
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
  MongoDB       Python      Reminder
                AI/RAG       Engine
              PORT 8000
                  │
      ┌───────────┴──────────┐
      ▼                      ▼
 RAG Retrieval       Comparison Engine
      │                      │
      ▼                      ▼
Grounding Check       Document A vs B
      │                      │
      └───────────┬──────────┘
                  ▼
          Verification Layer
                  ▼
        Trust / Risk Decision
                  ▼
         Audit Log / UI
```

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (IBM Carbon-inspired design system), JavaScript (ES6+)
- **Backend Gateway**: Node.js, Express.js (Port 5000)
- **AI Microservice**: Python 3.x, Vector Retrieval, Deterministic Semantic Comparison Engine (Port 8000)
- **Database**: MongoDB (`privacyguard`)
- **Security & Auth**: JWT (JSON Web Tokens), bcryptjs, Purpose-Aware Access Controls

---

## 💻 Running the Application

### 1. Start MongoDB
Ensure MongoDB is running locally on port `27017`.

### 2. Start Services
- **Node Backend Gateway**: `npm start` (Runs on `http://localhost:5000`)
- **Python AI Microservice**: `python ai-service/app.py` (Runs on `http://localhost:8000`)
- **Frontend Console**: Access `http://localhost:5000` or `http://localhost:5000/login.html`

### 3. Run Automated Tests
```bash
node tests/test_ocr_fallback.js
node tests/test_rag_logic.js
node tests/test_production_rag_scenarios.js
node tests/test_comparison.js
```

---

## 📜 License
Academic & Research Project Blueprint for Computer Science Engineering.
