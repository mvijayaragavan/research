# Implementation Plan: PrivacyGuard AI Gateway

PrivacyGuard AI is a privacy-aware AI decision and action gateway designed to sit between users/enterprise clients, data stores, and AI models (LLMs). The gateway ensures that:
1. **What AI Sees**: Sensitive data is automatically detected, classified, and minimized based on query purpose before context reaches any LLM.
2. **What AI Answers**: LLM answers are verified against source evidence, emitting a transparent **Trust Score** and conflict warnings.
3. **What AI Does**: AI proposed actions are evaluated by a deterministic policy engine, enforcing strict risk classification (LOW/MEDIUM/HIGH) and human approval workflows before mock SAP/enterprise execution.

---

## 1. System Architecture Blueprint

```
[ USER / UI (HTML/CSS/JS) ]
         │
         ▼
[ NODE.JS + EXPRESS BACKEND ] ── (JWT Auth & Deterministic Security Boundary)
         │
         ├──► [ MONGO DB ] (Users, Docs, Chunks, Policies, SAP Data, Audit Logs)
         │
         ├──► [ PRIVACY GATEWAY ] (Sensitive Entity Detection & Purpose-Aware Minimization)
         │           │
         │           ▼ (Sanitized Minimal Context ONLY)
         ├──► [ PYTHON AI SERVICE ] ──► [ FAISS / Vector Search ] ──► [ LLM (Local/API Abstraction) ]
         │           │
         │           ▼ (Raw LLM Answer + Proposed Action)
         ├──► [ ANSWER VERIFICATION ENGINE ] (Ground Truth Check + Trust Score Calculation)
         │
         ├──► [ ACTION POLICY ENGINE ] (Deterministic Risk Classification: LOW, MEDIUM, HIGH)
         │           │
         │           ├── (HIGH/MEDIUM) ──► [ HUMAN APPROVAL QUEUE ]
         │           └── (LOW / APPROVED) ──► [ MOCK SAP / ENTERPRISE SYSTEM ]
         │
         └──► [ SMART REMINDER ENGINE & AUDIT LOGGER ]
```

---

## 2. Technology Stack & Dependencies

| Layer | Technology | Rationale & User Compatibility |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Modern Vanilla CSS, JavaScript (ES6+) | Direct match with current skills; no React overhead |
| **Backend API** | Node.js, Express.js | Core stack match; handles HTTP endpoints, auth, and policy checks |
| **Database** | MongoDB (via `mongoose`) | Match with skills; stores documents, chunks, policies, mock SAP records |
| **AI Microservice** | Python 3.x (FastAPI or Flask) | Native ML/RAG support; isolated behind internal REST endpoints |
| **Vector Search** | FAISS / Sentence-Transformers (Python) | Simple, in-memory/local vector indexing without external cloud services |
| **LLM Interface** | Configurable LLM Wrapper (Local Ollama / Gemini API / OpenAI API) | Flexible abstraction layer switching local vs cloud seamlessly |
| **Auth & Security** | JWT (`jsonwebtoken`), Password hashing (`bcryptjs`) | Industry-standard deterministic auth |

---

## 3. Technology Matrix: Known vs New Concepts

### Technologies You Already Know
- **Node.js, Express, HTML/CSS/JS, MongoDB, Python, Git, VS Code**

### Concepts to Master During Implementation (Explained Simply as We Go)
1. **JWT Auth Middleware**: How Node.js inspects request headers deterministically to verify user identities and roles.
2. **PII/Sensitive Data Pattern Matcher**: Regex & NLP rules in Python/Node to detect names, phone numbers, policy numbers, and financial details.
3. **Purpose-Aware Data Minimization**: Stripping out non-essential sensitive entities from retrieved context based on the specific question asked.
4. **Vector Embeddings & Semantic Search**: Converting text chunks into numbers to find the most relevant document snippet.
5. **Deterministic Action Policy Engine**: Code rules (not AI) that evaluate whether an action is safe or requires human sign-off.
6. **Grounding & Trust Score Engine**: Programmatically comparing an AI response against retrieved source chunks to calculate an evidence score.

---

## 4. User Review Required

> [!IMPORTANT]
> **Deterministic Security Boundary**: The LLM will **never** have authority over database access, SAP execution, permissions, or approvals. All authorization rules are written in Node.js backend code.

> [!NOTE]
> MongoDB will run locally at `mongodb://localhost:27017/privacyguard`. The Python AI service will run on `http://localhost:8000` and Node.js on `http://localhost:5000`.

---

## 5. Milestone Breakdown (16-Phase Roadmap)

- [ ] **Milestone 1: Project Setup & Core Server Foundation (CURRENT FOCUS)**
  - Initialize directory structure (`backend/`, `frontend/`, `ai-service/`, `mock-sap/`, `docs/`, `tests/`).
  - Set up Node.js Express server with initial routes, health checks, `.env.example`, and MongoDB connection setup.
  - Set up basic Python AI service foundation (`FastAPI` / `Flask`) with health check endpoint.
  - Set up basic Vanilla HTML/CSS/JS dashboard shell.

- [ ] **Milestone 2: Database Schemas & JWT Auth Module**
  - Mongoose models: `User`, `Document`, `DocumentChunk`, `AuditLog`, `Policy`, `SAPRecord`, `ActionProposal`, `Reminder`.
  - User registration & login with password hashing (`bcryptjs`) and JWT issue/verification middleware with Role-Based Access Control (`NORMAL_USER`, `EMPLOYEE`, `MANAGER`, `FINANCE_USER`, `ADMIN`).

- [ ] **Milestone 3: Document Ingestion & Text Extraction**
  - PDF/TXT upload endpoint in Node.js (`multer`).
  - Text extraction and metadata tagging (`documentId`, `ownerId`, `classification`).

- [ ] **Milestone 4: Sensitive Entity Detection & Privacy Engine**
  - Regex and NLP sensitive data detectors (Name, Email, Phone, Govt ID, Account #, Policy #).
  - Data classification engine (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `HIGHLY_SENSITIVE`).
  - Sanitization preview (Redaction, Masking, Tokenization, Placeholders).

- [ ] **Milestone 5: Vector Search & RAG Pipeline (Python Service)**
  - Embedding generator & local vector storage (FAISS / numpy matrix).
  - Chunking strategy preserving source line/page numbers and chunk metadata.

- [ ] **Milestone 6: Purpose-Aware Data Minimization Gateway**
  - Query intent parsing: identify requested target attribute (e.g. "expiry date").
  - Filter out sensitive fields not required to answer the query before constructing prompt payload.

- [ ] **Milestone 7: Abstraction LLM Service & Answer Generation**
  - Dual adapter pattern (Local model via Ollama / Cloud API like Gemini/OpenAI).
  - Strict system prompt wrapping data as DATA, not code (Prompt Injection Defense).

- [ ] **Milestone 8: Answer Verification & Explainable Trust Score**
  - Text overlap & claim verification against ground truth chunks.
  - Multi-factor Trust Score formula (Evidence Score + Consistency Score - Risk Penalty).
  - UI visual breakdown of Trust Score percentage and status (`VERIFIED`, `CONFLICT_DETECTED`, `INSUFFICIENT_EVIDENCE`).

- [ ] **Milestone 9: Deterministic Action Policy Engine**
  - Action proposals parser from AI response.
  - Risk categorization engine (`LOW`, `MEDIUM`, `HIGH`).
  - Human approval workflow and authorization checks.

- [ ] **Milestone 10: Mock SAP Enterprise Integration**
  - Enterprise POs, Suppliers, and Invoice endpoints.
  - Discrepancy detector comparing PDF PO vs Mock SAP DB record.

- [ ] **Milestone 11: Smart Reminder Engine**
  - Deterministic date parser (expiry, renewal, notice periods).
  - Automatic reminder creation logic with zero LLM date calculation reliance.

- [ ] **Milestone 12: Comprehensive Audit Logging**
  - Structured logging without storing raw sensitive payload or plaintext secrets.

- [ ] **Milestone 13: UI Dashboard Integration**
  - Rich modern dark-mode dashboard with custom CSS glassmorphism, responsive navigation, live metrics, privacy breakdown view, approval queue, and verification view.

- [ ] **Milestone 14: Failure Scenario & Security Testing**
  - Automated test scripts for prompt injection, unauthorized cross-tenant access, role escalation, data mismatch detection.

- [ ] **Milestone 15: Empirical Research Evaluation Framework**
  - Benchmark script comparing Baseline A (Direct LLM), Baseline B (Standard RAG), and Proposed PrivacyGuard Gateway on Privacy Leakage Ratio, Minimization %, Verification Accuracy, and Latency.

- [ ] **Milestone 16: Documentation & Interview Readiness Bundle**
  - Architecture docs, API spec, Security guide, Demo video script, Resume project description, and Q&A defense cheat sheet.

---

## 6. Proposed Milestone 1 Implementation Details

### Files to Create in Milestone 1:

1. `PrivacyGuard-AI/`
   - `.env.example`
   - `.gitignore`
   - `README.md`
   - `package.json` (Root runner scripts)

2. `backend/`
   - `package.json`
   - `server.js` (Express entry point)
   - `config/db.js` (MongoDB connection helper)
   - `middleware/errorHandler.js`
   - `routes/health.js`

3. `ai-service/`
   - `requirements.txt`
   - `app.py` (FastAPI / Flask server)
   - `config.py`

4. `frontend/`
   - `index.html` (Landing & Architecture Overview)
   - `css/styles.css` (Base design system tokens, typography, glassmorphism UI)
   - `js/app.js` (Main frontend script & state manager)

5. `mock-sap/`
   - `package.json`
   - `server.js`
   - `data/sap_data.json`

---

## 7. Verification Plan

### Milestone 1 Automated & Manual Checks:
- **Backend Health Check**: `GET http://localhost:5000/api/health` -> `200 OK` with JSON status.
- **AI Service Health Check**: `GET http://localhost:8000/health` -> `200 OK` with JSON status.
- **Mock SAP Health Check**: `GET http://localhost:5001/api/sap/health` -> `200 OK`.
- **Database Connectivity**: Log message in console confirming MongoDB connection at `mongodb://localhost:27017/privacyguard`.
- **Frontend Dashboard Load**: Open `frontend/index.html` in browser to confirm responsive design, glassmorphism theme, and status indicators.
