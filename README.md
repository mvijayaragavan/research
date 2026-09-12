# PrivacyGuard AI

> **PrivacyGuard AI: A Trust-Aware PDF Intelligence Platform for Evidence-Grounded Question Answering, Hallucination Detection, Document Comparison, and Contradiction Verification.**

PrivacyGuard AI is an industry-grade, trust-aware document intelligence platform that solves fundamental security challenges in AI integration:
1. **Privacy-Aware Data Minimization**: Automatically detecting sensitive entities (PII, financial data, internal IDs) and applying purpose-aware data minimization before passing context to LLMs.
2. **Evidence-Grounded Question Answering**: Cross-verifying AI answers against extracted PDF/TXT ground-truth chunks to emit a transparent, multi-factor **Trust Score**.
3. **Multi-PDF Semantic Comparison Engine**: Comparing document versions (e.g. `Contract_V1.pdf` vs `Contract_V2.pdf`) to detect `ADDED`, `REMOVED`, and `MODIFIED` clauses with page-level citations.
4. **Internal Contradiction Detection**: Identifying conflicting factual statements across pages within individual documents or between document revisions.
5. **Human-in-the-Loop Security Controls**: Enforcing deterministic risk classification (`LOW`, `MEDIUM`, `HIGH`) and human sign-off workflows for sensitive operations.
6. **Immutable Audit Stream**: Logging every operational event, document comparison, PII redaction count, and trust score in an immutable security trail.

---

## 🏛️ System Architecture

```
                USER
                  │
                  ▼
         PrivacyGuard UI
                  │
                  ▼
         Node.js Gateway
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

- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism design tokens), JavaScript (ES6+)
- **Backend Gateway**: Node.js, Express.js (Port 5000)
- **AI Microservice**: Python 3.x, Vector Retrieval (TF/Cosine Similarity), Semantic Comparison Engine (Port 8000)
- **Database**: MongoDB (mongodb://localhost:27017/privacyguard)
- **Security & Auth**: JWT (JSON Web Tokens), bcryptjs, Purpose-Aware Access Policies

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
npm test
```

---

## 📜 License
Academic & Research Project Blueprint for Computer Science Engineering.
