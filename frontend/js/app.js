/**
 * PrivacyGuard AI - PDF Reader & Intelligence Workspace Frontend Controller
 */

const BACKEND_URL = 'https://privacyguard-backend-ipou.onrender.com/api';
const PYTHON_URL = 'http://localhost:8000';

let AUTH_TOKEN = '';
let CURRENT_USER = { name: 'User', email: '', role: 'USER' };

// Global Reader State
let currentReaderDoc = null;
let currentReaderPage = 1;
let currentReaderTotalPages = 1;
let currentReaderChunks = [];
let currentHighlightSnippet = '';
let currentPdfDocProxy = null;
let currentReaderZoom = 1.0;
let currentPdfArrayBuffer = null;

function formatErrorMessage(data) {
  if (!data) return 'Unknown error occurred.';
  if (typeof data.error === 'string') return data.error;
  if (typeof data.error === 'object' && data.error !== null) {
    return data.error.message || JSON.stringify(data.error);
  }
  if (data.message) return data.message;
  return 'An unexpected error occurred.';
}

function formatDateDisplay(dInput) {
  if (!dInput) return 'N/A';
  const d = new Date(dInput);
  if (isNaN(d.getTime())) return String(dInput);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeAgo(dInput) {
  if (!dInput) return '';
  const d = new Date(dInput);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Time-aware greeting
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning 👋';
  if (hour < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}

// Navigation Tab Switcher & Client Router
const ROUTE_MAP = {
  'tab-dashboard': '/dashboard',
  'tab-documents': '/documents',
  'tab-recent': '/recent',
  'tab-bookmarks': '/bookmarks',
  'tab-notes': '/notes',
  'tab-ask-ai': '/ask-question',
  'tab-search': '/search',
  'tab-compare': '/compare',
  'tab-reminders': '/reminders',
  'tab-settings': '/settings'
};

function setupTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      if (!targetTab) return;
      switchNavTab(targetTab, true);
    });
  });
}

function switchNavTab(targetTab, updateUrl = true, params = {}) {
  const navItems = document.querySelectorAll('.nav-item');
  const tabViews = document.querySelectorAll('.tab-view');

  navItems.forEach(n => {
    if (n.getAttribute('data-tab') === targetTab) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });

  tabViews.forEach(v => {
    if (v.id === targetTab) {
      v.classList.add('active');
    } else {
      v.classList.remove('active');
    }
  });

  if (updateUrl) {
    let routePath = ROUTE_MAP[targetTab] || '/dashboard';
    if (params.documentId) {
      routePath += `?documentId=${encodeURIComponent(params.documentId)}`;
    }
    if (window.location.pathname + window.location.search !== routePath) {
      window.history.pushState({ tab: targetTab, params }, '', routePath);
    }
  }

  // Pre-select document if passed
  if (params.documentId) {
    const aiDocSelect = document.getElementById('ai-doc-select');
    if (aiDocSelect) {
      aiDocSelect.value = params.documentId;
    }
  }

  // Lazy Refresh for active tabs
  if (targetTab === 'tab-dashboard') loadDashboardData();
  if (targetTab === 'tab-documents' || targetTab === 'tab-recent') loadVaultDocuments();
  if (targetTab === 'tab-reminders') loadReminders();
  if (targetTab === 'tab-ask-ai') {
    const docPromise = loadVaultDocuments();
    if (docPromise && typeof docPromise.then === 'function') {
      docPromise.then(() => {
        if (params.documentId) {
          const aiDocSelect = document.getElementById('ai-doc-select');
          if (aiDocSelect) aiDocSelect.value = params.documentId;
        }
      });
    }
  }
}

function handleInitialRouting() {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  let targetTab = 'tab-dashboard';

  if (path === '/ask-question' || path === '/ask' || hash === '#ask-question' || hash === '#ask' || hash === '#tab-ask-ai') {
    targetTab = 'tab-ask-ai';
  } else if (path === '/documents' || hash === '#documents' || hash === '#tab-documents') {
    targetTab = 'tab-documents';
  } else if (path === '/recent' || hash === '#recent' || hash === '#tab-recent') {
    targetTab = 'tab-recent';
  } else if (path === '/bookmarks' || hash === '#bookmarks' || hash === '#tab-bookmarks') {
    targetTab = 'tab-bookmarks';
  } else if (path === '/notes' || hash === '#notes' || hash === '#tab-notes') {
    targetTab = 'tab-notes';
  } else if (path === '/search' || hash === '#search' || hash === '#tab-search') {
    targetTab = 'tab-search';
  } else if (path === '/compare' || hash === '#compare' || hash === '#tab-compare') {
    targetTab = 'tab-compare';
  } else if (path === '/reminders' || hash === '#reminders' || hash === '#tab-reminders') {
    targetTab = 'tab-reminders';
  } else if (path === '/settings' || hash === '#settings' || hash === '#tab-settings') {
    targetTab = 'tab-settings';
  }

  const documentId = searchParams.get('documentId');
  switchNavTab(targetTab, false, documentId ? { documentId } : {});
}

window.addEventListener('popstate', () => {
  handleInitialRouting();
});

// Initialize Auth Session
function initAuthSession() {
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');

  if (!token) {
    window.location.href = 'login.html';
    return false;
  }

  AUTH_TOKEN = token;
  if (userJson) {
    try {
      CURRENT_USER = JSON.parse(userJson);
    } catch (e) {}
  }

  // Update Header UI & Settings
  const nameEl = document.getElementById('user-display');
  const avatarEl = document.getElementById('user-avatar');
  const settingsEmail = document.getElementById('settings-user-email');
  const greetingEl = document.getElementById('welcome-greeting-text');

  if (greetingEl) greetingEl.textContent = getGreeting();
  if (nameEl) nameEl.textContent = CURRENT_USER.name || CURRENT_USER.email || 'Authenticated User';
  if (settingsEmail) settingsEmail.value = CURRENT_USER.email || 'User Account';

  if (avatarEl && CURRENT_USER.name) {
    const parts = CURRENT_USER.name.split(' ');
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : CURRENT_USER.name.slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }

  return true;
}

function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

window.logoutUser = logoutUser;

// Microservices Health Check
async function checkSystemStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`);
    const data = await res.json();
    console.log('[Node Gateway]', data);
  } catch (err) {}
}

// ============================================================
// DASHBOARD DATA LOAD & RENDER ENGINE
// ============================================================
async function loadDashboardData() {
  try {
    const res = await fetch(`${BACKEND_URL}/documents/dashboard-stats`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (res.status === 401) {
      logoutUser();
      return;
    }
    const data = await res.json();

    if (!data.success) return;

    // 1. Stats Summary Cards
    const { totalDocuments, recentlyOpened, totalBookmarks, totalNotes } = data.stats;
    if (document.getElementById('stat-total-documents')) document.getElementById('stat-total-documents').textContent = totalDocuments;
    if (document.getElementById('stat-recently-opened')) document.getElementById('stat-recently-opened').textContent = recentlyOpened;
    if (document.getElementById('stat-total-bookmarks')) document.getElementById('stat-total-bookmarks').textContent = totalBookmarks;
    if (document.getElementById('stat-total-notes')) document.getElementById('stat-total-notes').textContent = totalNotes;

    // 2. Continue Reading Card
    renderContinueReading(data.continueReading);

    // 3. Recently Asked Questions
    renderRecentQuestions(data.recentQuestions);

    // 4. Activity Stream
    renderRecentActivity(data.recentActivity);

    // 5. Bookmarks Tab List
    renderBookmarksList(data.allBookmarks);

    // 6. Notes Tab List
    renderNotesList(data.allNotes);

    // 7. Load Document Library Dropdowns & Grid
    loadVaultDocuments();

  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

// Render "Continue Reading" Section
function renderContinueReading(cr) {
  const container = document.getElementById('continue-reading-container');
  if (!container) return;

  if (!cr) {
    container.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.9rem; padding: 1rem 0; text-align: center;">
        📚 No reading session in progress. Upload a PDF document to start reading!
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="continue-reading-card">
      <div class="pdf-icon-box">
        📄 <span>PDF</span>
      </div>
      <div style="flex: 1; min-width: 240px;">
        <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main); line-height: 1.3;">
          ${cr.title}
        </div>
        <div style="font-size: 0.825rem; color: var(--text-muted); margin-top: 0.2rem;">
          File: ${cr.fileName} • ${formatTimeAgo(cr.lastOpenedAt)}
        </div>

        <div class="reading-progress-bar">
          <div class="reading-progress-fill" style="width: ${cr.progressPercent}%;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-muted);">
          <span>Reading Progress: <strong style="color: var(--accent-cyan);">${cr.progressPercent}%</strong></span>
          <span>Page <strong>${cr.lastPageRead}</strong> of <strong>${cr.totalPages}</strong></span>
        </div>
      </div>
      <button class="btn btn-success" style="padding: 0.8rem 1.5rem; font-size: 0.95rem; font-weight: 700; white-space: nowrap;" onclick="openPdfReader('${cr.id}', ${cr.lastPageRead})">
        Continue Reading →
      </button>
    </div>
  `;
}

// Render Recently Asked Questions
function renderRecentQuestions(questions) {
  const container = document.getElementById('recent-questions-list');
  if (!container) return;

  if (!questions || questions.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No recent questions asked yet.</div>`;
    return;
  }

  container.innerHTML = '';
  questions.forEach(q => {
    const item = document.createElement('div');
    item.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem;';
    item.innerHTML = `
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-main);">❓ "${q.title}"</div>
        <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.2rem;">
          ${q.documentName ? `Document: <strong>${q.documentName}</strong> (Page ${q.pageNumber || 1}) • ` : ''}${formatTimeAgo(q.createdAt)}
        </div>
      </div>
      ${q.documentId ? `<button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openPdfReader('${q.documentId}', ${q.pageNumber || 1}, '${q.title.replace(/'/g, "\\'")}')">View Source Page</button>` : ''}
    `;
    container.appendChild(item);
  });
}

// Render Recent Activity Stream
function renderRecentActivity(activities) {
  const container = document.getElementById('dashboard-recent-activity-list');
  if (!container) return;

  if (!activities || activities.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No recent activities logged.</div>`;
    return;
  }

  const iconMap = {
    'OPEN_PDF': '📖',
    'BOOKMARK_ADDED': '🔖',
    'NOTE_CREATED': '📝',
    'QUESTION_ASKED': '🤖',
    'UPLOAD_PDF': '📤'
  };

  container.innerHTML = '';
  activities.forEach(a => {
    const icon = iconMap[a.type] || '⚡';
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-icon-badge">${icon}</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-main);">${a.title}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">${a.details || ''}</div>
      </div>
      <div style="font-size: 0.75rem; color: var(--text-dim); text-align: right;">${formatTimeAgo(a.createdAt)}</div>
    `;
    container.appendChild(item);
  });
}

// Render Bookmarks Tab List
function renderBookmarksList(bookmarks) {
  const container = document.getElementById('all-bookmarks-container');
  if (!container) return;

  if (!bookmarks || bookmarks.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted);">No page bookmarks saved. Open any PDF and click 'Bookmark Page' to save bookmarks.</div>`;
    return;
  }

  container.innerHTML = '';
  bookmarks.forEach(b => {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem;';
    card.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--accent-amber);">🔖 Page ${b.pageNumber}: ${b.title}</div>
        <div style="font-size: 0.825rem; color: var(--text-muted); margin-top: 0.25rem;">
          Document: <strong>${b.documentTitle}</strong> (${b.fileName}) • Added ${formatDateDisplay(b.createdAt)}
        </div>
      </div>
      <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openPdfReader('${b.documentId}', ${b.pageNumber})">
        Open Page ${b.pageNumber} →
      </button>
    `;
    container.appendChild(card);
  });
}

// Render Notes Tab List
function renderNotesList(notes) {
  const container = document.getElementById('all-notes-container');
  if (!container) return;

  if (!notes || notes.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted);">No personal notes created yet. Open any PDF and click 'Add Note' to create notes.</div>`;
    return;
  }

  container.innerHTML = '';
  notes.forEach(n => {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--accent-emerald);">📝 Note on Page ${n.pageNumber}</div>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="openPdfReader('${n.documentId}', ${n.pageNumber})">
          View Note in PDF →
        </button>
      </div>
      <div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--text-main); white-space: pre-wrap;">
        "${n.content}"
      </div>
      <div style="font-size: 0.775rem; color: var(--text-muted);">
        Document: <strong>${n.documentTitle}</strong> • Created ${formatDateDisplay(n.createdAt)}
      </div>
    `;
    container.appendChild(card);
  });
}

// Load Document Library Cards & Dropdowns
async function loadVaultDocuments() {
  try {
    const res = await fetch(`${BACKEND_URL}/documents`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (res.status === 401) {
      logoutUser();
      return;
    }
    const data = await res.json();
    if (!data.success || !data.documents) return;

    window.allUserDocuments = data.documents;

    // Render Dashboard Grid & Vault Grid
    renderPdfGrid(data.documents, 'dashboard-pdf-grid');
    renderPdfGrid(data.documents, 'vault-pdf-grid');
    renderPdfGrid(data.documents, 'recent-docs-grid');

    // Populate Dropdowns for AI & Compare
    populateDocDropdowns(data.documents);

  } catch (err) {
    console.error('Failed to load vault documents:', err);
  }
}

function renderPdfGrid(documents, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!documents || documents.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem; text-align: center;">No PDF documents found. Upload a file to get started.</div>`;
    return;
  }

  container.innerHTML = '';
  documents.forEach(doc => {
    const totalPages = Math.max(1, doc.totalPages || 1);
    const lastPage = Math.min(totalPages, Math.max(1, doc.lastPageRead || 1));
    const progressPercent = Math.min(100, Math.round((lastPage / totalPages) * 100));

    const card = document.createElement('div');
    card.className = 'pdf-card';
    card.innerHTML = `
      <div style="display: flex; gap: 0.85rem; align-items: center;">
        <div class="pdf-icon-box" style="width: 44px; height: 52px; font-size: 0.85rem;">
          📄 <span>PDF</span>
        </div>
        <div style="flex: 1; overflow: hidden;">
          <div class="pdf-card-title" title="${doc.title}">${doc.title}</div>
          <div class="pdf-card-meta">
            <span>${doc.fileName}</span>
            <span>Uploaded: ${formatDateDisplay(doc.createdAt)}</span>
          </div>
        </div>
      </div>

      <div class="reading-progress-bar">
        <div class="reading-progress-fill" style="width: ${progressPercent}%;"></div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 0.775rem; color: var(--text-muted);">
        <span>Page ${lastPage} of ${totalPages}</span>
        <span class="badge badge-warning">${doc.classification}</span>
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
        <button class="btn btn-success" style="flex: 1; justify-content: center; padding: 0.4rem; font-size: 0.8rem;" onclick="openPdfReader('${doc._id}', ${lastPage})">
          Open PDF
        </button>
        <button class="btn btn-secondary" style="padding: 0.4rem 0.6rem; font-size: 0.8rem; color: var(--accent-rose);" onclick="deleteDocument('${doc._id}')">
          🗑️
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function filterDashboardPdfGrid() {
  const query = document.getElementById('my-docs-filter-input').value.toLowerCase();
  if (!window.allUserDocuments) return;

  const filtered = window.allUserDocuments.filter(d =>
    d.title.toLowerCase().includes(query) || d.fileName.toLowerCase().includes(query)
  );
  renderPdfGrid(filtered, 'dashboard-pdf-grid');
}

function populateDocDropdowns(documents) {
  const dashSelect = document.getElementById('dashboard-ai-doc-select');
  const aiSelect = document.getElementById('ai-doc-select');
  const compASelect = document.getElementById('compare-doc-a');
  const compBSelect = document.getElementById('compare-doc-b');

  if (dashSelect) {
    const val = dashSelect.value;
    dashSelect.innerHTML = '<option value="">Global Retrieval (Search All PDFs)</option>';
    documents.forEach(d => { dashSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    dashSelect.value = val;
  }

  if (aiSelect) {
    const val = aiSelect.value;
    aiSelect.innerHTML = '<option value="">Global Retrieval (Search All Index)</option>';
    documents.forEach(d => { aiSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    aiSelect.value = val;
  }

  if (compASelect) {
    const val = compASelect.value;
    compASelect.innerHTML = '<option value="">Select Document A from Vault...</option>';
    documents.forEach(d => { compASelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    compASelect.value = val;
  }

  if (compBSelect) {
    const val = compBSelect.value;
    compBSelect.innerHTML = '<option value="">Select Document B from Vault...</option>';
    documents.forEach(d => { compBSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    compBSelect.value = val;
  }
}

// ============================================================
// INTERACTIVE FULLSCREEN PDF READER CONTROLLER
// ============================================================
let currentReaderCitation = null;
window.currentAiCitations = [];

function openSourceCitation(citationIndex) {
  const citations = window.currentAiCitations || [];
  const src = citations[citationIndex];

  if (!src || !src.documentId || src.isResolvable === false) {
    alert('Source unavailable: The target PDF document or chunk could not be resolved.');
    return;
  }

  const documentId = src.documentId;
  const pageNumber = Math.max(1, parseInt(src.pageNumber, 10) || 1);
  const textSnippet = src.rawChunkText || src.text || src.minimizedChunkText || '';

  console.log('[VIEW SOURCE CLICKED]', {
    citationIndex,
    chunkId: src.chunkId,
    documentId: src.documentId,
    fileName: src.fileName,
    pageNumber: pageNumber,
    sourceTextSnippet: textSnippet.substring(0, 80)
  });

  openPdfReader(documentId, pageNumber, textSnippet, src);
}

// ============================================================
// INTERACTIVE FULLSCREEN PDF READER CONTROLLER
// ============================================================
async function openPdfReader(documentId, pageNumber = 1, highlightSnippet = '', citationInfo = null) {
  if (!documentId) {
    alert('Source unavailable: Invalid or missing PDF document ID.');
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/documents/${documentId}`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (!data.success || !data.document) {
      alert('Unable to load PDF. Please try again.');
      return;
    }

    currentReaderDoc = data.document;
    currentReaderChunks = data.chunks || [];
    currentReaderTotalPages = Math.max(1, currentReaderDoc.totalPages || 1);
    currentReaderPage = Math.min(currentReaderTotalPages, Math.max(1, parseInt(pageNumber, 10) || 1));
    currentHighlightSnippet = highlightSnippet || '';
    currentReaderCitation = citationInfo || null;

    // Reset PDF rendering state
    currentPdfDocProxy = null;
    currentPdfArrayBuffer = null;
    currentReaderZoom = 1.0;
    updateZoomDisplay();

    console.log('[PDF PAGE OPENED]', {
      documentId: currentReaderDoc._id,
      fileName: currentReaderDoc.fileName,
      pageNumber: currentReaderPage,
      totalChunks: currentReaderChunks.length
    });

    // Open Reader Modal Overlay
    const modal = document.getElementById('pdf-reader-modal');
    if (modal) modal.style.display = 'flex';

    // Update Header
    document.getElementById('reader-doc-title').textContent = currentReaderDoc.title;
    document.getElementById('reader-doc-subtitle').textContent = `${currentReaderDoc.fileName} (${currentReaderTotalPages} pages)`;
    document.getElementById('reader-total-pages').textContent = currentReaderTotalPages;
    document.getElementById('reader-page-input').value = currentReaderPage;

    // Fetch binary PDF ArrayBuffer for PDF.js rendering
    try {
      const fileRes = await fetch(`${BACKEND_URL}/documents/${documentId}/file`, {
        headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
      });

      if (fileRes.ok) {
        const arrayBuf = await fileRes.arrayBuffer();
        if (arrayBuf && arrayBuf.byteLength > 0) {
          currentPdfArrayBuffer = arrayBuf;
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf.slice(0) });
            currentPdfDocProxy = await loadingTask.promise;
            if (currentPdfDocProxy && currentPdfDocProxy.numPages) {
              currentReaderTotalPages = currentPdfDocProxy.numPages;
              document.getElementById('reader-total-pages').textContent = currentReaderTotalPages;
            }
          }
        }
      }
    } catch (fileErr) {
      console.warn('[PDF Reader Warning] Binary PDF file load error, using text fallback:', fileErr.message);
    }

    // Render Viewport Content
    renderReaderPageContent();

    // Render Sidebar (Outline, Bookmarks, Notes)
    renderReaderSidebar();

    // Sync Progress with Server
    syncReaderProgress();

  } catch (err) {
    alert('Unable to load PDF. Please try again.');
  }
}

function closePdfReader() {
  const modal = document.getElementById('pdf-reader-modal');
  if (modal) modal.style.display = 'none';
  currentReaderDoc = null;
  currentReaderChunks = [];
  currentReaderCitation = null;
  currentPdfDocProxy = null;
  currentPdfArrayBuffer = null;
  loadDashboardData(); // Refresh dashboard on closing reader
}

function readerZoomIn() {
  if (currentReaderZoom < 3.0) {
    currentReaderZoom = parseFloat((currentReaderZoom + 0.25).toFixed(2));
    updateZoomDisplay();
    renderReaderPageContent();
  }
}

function readerZoomOut() {
  if (currentReaderZoom > 0.5) {
    currentReaderZoom = parseFloat((currentReaderZoom - 0.25).toFixed(2));
    updateZoomDisplay();
    renderReaderPageContent();
  }
}

function updateZoomDisplay() {
  const el = document.getElementById('reader-zoom-level');
  if (el) el.textContent = `${Math.round(currentReaderZoom * 100)}%`;
}

async function renderReaderPageContent() {
  const viewport = document.getElementById('reader-page-viewport');
  if (!viewport || !currentReaderDoc) return;

  document.getElementById('reader-page-input').value = currentReaderPage;

  // Build Source Preview Banner if opened via citation
  let sourceBannerHtml = '';
  if (currentReaderCitation) {
    sourceBannerHtml = `
      <div id="source-preview-banner" style="background: rgba(6, 182, 212, 0.1); border: 1px solid var(--accent-cyan); border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <strong style="color: var(--accent-cyan); font-size: 0.9rem;">📍 Grounded RAG Source Passage</strong>
          <span class="badge badge-success">Page ${currentReaderCitation.pageNumber || currentReaderPage} • Chunk ID: ${currentReaderCitation.chunkId || 'N/A'}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.35rem;">
          Source Document: <strong>${currentReaderCitation.fileName || currentReaderDoc.fileName}</strong>
        </div>
        <div style="background: rgba(0, 0, 0, 0.4); border-left: 3px solid var(--accent-cyan); padding: 0.6rem 0.8rem; font-size: 0.85rem; color: #f8fafc; font-style: italic; white-space: pre-wrap;">
          "${(currentReaderCitation.rawChunkText || currentReaderCitation.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"
        </div>
      </div>
    `;
  }

  // 1. PDF.js Canvas Rendering
  if (currentPdfDocProxy) {
    try {
      const page = await currentPdfDocProxy.getPage(currentReaderPage);
      const viewportScale = currentReaderZoom || 1.0;
      const pdfViewport = page.getViewport({ scale: viewportScale });

      viewport.innerHTML = `
        ${sourceBannerHtml}
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem; text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
          📄 ${currentReaderDoc.title} — Page ${currentReaderPage} of ${currentReaderTotalPages} (Scale: ${Math.round(viewportScale * 100)}%)
        </div>
        <div style="display: flex; justify-content: center; overflow-x: auto; background: rgba(0,0,0,0.25); padding: 1.25rem; border-radius: var(--radius-sm); min-height: 400px;">
          <canvas id="pdf-render-canvas" style="box-shadow: 0 10px 30px rgba(0,0,0,0.6); border-radius: 4px; max-width: 100%; height: auto; background: #ffffff;"></canvas>
        </div>
      `;

      const canvas = document.getElementById('pdf-render-canvas');
      if (canvas) {
        const context = canvas.getContext('2d');
        canvas.height = pdfViewport.height;
        canvas.width = pdfViewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: pdfViewport
        };
        await page.render(renderContext).promise;
      }
      return;
    } catch (pdfRenderErr) {
      console.warn('[PDF.js Render Error] Fallback to clean extracted text view:', pdfRenderErr.message);
    }
  }

  // 2. Text Fallback View (Safe text extraction, no raw binary bytes)
  let pageText = '';
  const pageChunks = currentReaderChunks.filter(c => (c.pageNumber || 1) === currentReaderPage);

  if (pageChunks.length > 0) {
    pageText = pageChunks.map(c => c.rawChunkText || c.minimizedChunkText || '').join('\n\n');
  } else if (currentReaderDoc.rawText && !currentReaderDoc.rawText.includes('%PDF-1.')) {
    const pageSize = Math.ceil(currentReaderDoc.rawText.length / currentReaderTotalPages);
    const start = (currentReaderPage - 1) * pageSize;
    pageText = currentReaderDoc.rawText.substring(start, start + pageSize);
  }

  if (!pageText.trim() || pageText.includes('%PDF-1.')) {
    pageText = `Unable to load PDF. Please try again.`;
  }

  let htmlContent = pageText.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (currentHighlightSnippet && currentHighlightSnippet.length > 3) {
    const cleanSnippet = currentHighlightSnippet.trim();
    const searchPhrases = [cleanSnippet, cleanSnippet.split('\n')[0], cleanSnippet.substring(0, 40)].filter(p => p && p.length > 4);

    for (const phrase of searchPhrases) {
      try {
        const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedPhrase})`, 'gi');
        if (regex.test(htmlContent)) {
          htmlContent = htmlContent.replace(regex, '<mark class="page-highlight" style="background: #facc15; color: #0f172a; padding: 0.15rem 0.3rem; border-radius: 3px; font-weight: 600;">$1</mark>');
          break;
        }
      } catch (e) {}
    }
  }

  viewport.innerHTML = `
    ${sourceBannerHtml}
    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
      📄 ${currentReaderDoc.title} — Page ${currentReaderPage} of ${currentReaderTotalPages}
    </div>
    <div style="line-height: 1.6; white-space: pre-wrap;">${htmlContent}</div>
  `;

  setTimeout(() => {
    const mark = viewport.querySelector('.page-highlight');
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function renderReaderSidebar() {
  if (!currentReaderDoc) return;

  // 1. Outline (Pages list)
  const outlineList = document.getElementById('reader-outline-list');
  if (outlineList) {
    outlineList.innerHTML = '';
    for (let p = 1; p <= currentReaderTotalPages; p++) {
      const btn = document.createElement('button');
      btn.className = `btn ${p === currentReaderPage ? 'btn-success' : 'btn-secondary'}`;
      btn.style.cssText = 'padding: 0.3rem 0.6rem; font-size: 0.775rem; justify-content: flex-start;';
      btn.textContent = `Page ${p}`;
      btn.onclick = () => readerJumpToPage(p);
      outlineList.appendChild(btn);
    }
  }

  // 2. Bookmarks
  const bookmarksList = document.getElementById('reader-bookmarks-list');
  if (bookmarksList) {
    const bArr = currentReaderDoc.bookmarks || [];
    if (bArr.length === 0) {
      bookmarksList.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted);">No bookmarks added.</div>`;
    } else {
      bookmarksList.innerHTML = '';
      bArr.forEach(b => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 0.35rem 0.6rem; border-radius: 4px; font-size: 0.775rem;';
        div.innerHTML = `
          <span style="color: var(--accent-amber); cursor: pointer;" onclick="readerJumpToPage(${b.pageNumber})">🔖 Page ${b.pageNumber}</span>
          <button style="background:none; border:none; color: var(--accent-rose); cursor:pointer;" onclick="removeReaderBookmark('${b._id}')">✕</button>
        `;
        bookmarksList.appendChild(div);
      });
    }
  }

  // 3. Notes
  const notesList = document.getElementById('reader-notes-list');
  if (notesList) {
    const nArr = currentReaderDoc.notes || [];
    if (nArr.length === 0) {
      notesList.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted);">No notes created.</div>`;
    } else {
      notesList.innerHTML = '';
      nArr.forEach(n => {
        const div = document.createElement('div');
        div.style.cssText = 'background: rgba(0,0,0,0.3); padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.775rem; color: var(--text-main); margin-bottom: 0.3rem;';
        div.innerHTML = `
          <div style="font-weight:600; color: var(--accent-emerald);">Page ${n.pageNumber}:</div>
          <div>"${n.content}"</div>
        `;
        notesList.appendChild(div);
      });
    }
  }
}

function readerPrevPage() {
  if (currentReaderPage > 1) {
    currentReaderPage--;
    renderReaderPageContent();
    renderReaderSidebar();
    syncReaderProgress();
  }
}

function readerNextPage() {
  if (currentReaderPage < currentReaderTotalPages) {
    currentReaderPage++;
    renderReaderPageContent();
    renderReaderSidebar();
    syncReaderProgress();
  }
}

function readerJumpToPage(page) {
  const p = parseInt(page, 10);
  if (p >= 1 && p <= currentReaderTotalPages) {
    currentReaderPage = p;
    renderReaderPageContent();
    renderReaderSidebar();
    syncReaderProgress();
  }
}

async function syncReaderProgress() {
  if (!currentReaderDoc) return;
  try {
    await fetch(`${BACKEND_URL}/documents/${currentReaderDoc._id}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ pageNumber: currentReaderPage, totalPages: currentReaderTotalPages })
    });
  } catch (e) {}
}

async function addReaderBookmark() {
  if (!currentReaderDoc) return;
  const title = prompt(`Enter bookmark title for Page ${currentReaderPage}:`, `Page ${currentReaderPage} Bookmark`);
  if (!title) return;

  try {
    const res = await fetch(`${BACKEND_URL}/documents/${currentReaderDoc._id}/bookmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ pageNumber: currentReaderPage, title })
    });
    const data = await res.json();
    if (data.success) {
      currentReaderDoc.bookmarks = data.bookmarks;
      renderReaderSidebar();
    }
  } catch (e) {}
}

async function removeReaderBookmark(bookmarkId) {
  if (!currentReaderDoc) return;
  try {
    const res = await fetch(`${BACKEND_URL}/documents/${currentReaderDoc._id}/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.success) {
      currentReaderDoc.bookmarks = data.bookmarks;
      renderReaderSidebar();
    }
  } catch (e) {}
}

async function openReaderNotePrompt() {
  if (!currentReaderDoc) return;
  const content = prompt(`Add a personal note for Page ${currentReaderPage}:`);
  if (!content || !content.trim()) return;

  try {
    const res = await fetch(`${BACKEND_URL}/documents/${currentReaderDoc._id}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ pageNumber: currentReaderPage, content })
    });
    const data = await res.json();
    if (data.success) {
      currentReaderDoc.notes = data.notes;
      renderReaderSidebar();
    }
  } catch (e) {}
}

async function executeReaderAsk() {
  const queryInput = document.getElementById('reader-ask-input');
  const responseBox = document.getElementById('reader-ask-response');
  if (!queryInput || !queryInput.value.trim() || !currentReaderDoc) return;

  const query = queryInput.value.trim();
  responseBox.textContent = 'Analyzing page content...';

  try {
    const res = await fetch(`${BACKEND_URL}/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ documentId: currentReaderDoc._id, query })
    });
    const data = await res.json();
    if (data.success) {
      responseBox.textContent = `🤖 ${data.answer}`;
    } else {
      responseBox.textContent = 'Failed to answer question.';
    }
  } catch (e) {
    responseBox.textContent = 'Error executing Q&A.';
  }
}

// ============================================================
// GLOBAL & DEDICATED SEARCH CONTROLLER
// ============================================================
function handleHeaderSearchKeyPress(e) {
  if (e.key === 'Enter') {
    const q = document.getElementById('global-header-search-input').value;
    if (q.trim()) {
      switchNavTab('tab-search');
      document.getElementById('dedicated-search-input').value = q;
      executeDedicatedSearch();
    }
  }
}

function handleDedicatedSearchKeyPress(e) {
  if (e.key === 'Enter') executeDedicatedSearch();
}

async function executeDedicatedSearch() {
  const queryInput = document.getElementById('dedicated-search-input');
  const container = document.getElementById('search-results-container');
  if (!queryInput || !container) return;

  const q = queryInput.value.trim();
  if (!q) return;

  container.innerHTML = '<div style="color: var(--text-muted);">Searching PDF library...</div>';

  try {
    const res = await fetch(`${BACKEND_URL}/documents/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();

    if (!data.success || !data.results || data.results.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted);">No documents or snippets found matching "${q}".</div>`;
      return;
    }

    container.innerHTML = `<div style="font-weight: 600; font-size: 0.9rem; color: var(--accent-cyan); margin-bottom: 1rem;">Found ${data.results.length} matching document(s) for "${q}":</div>`;

    data.results.forEach(r => {
      const card = document.createElement('div');
      card.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem;';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">📄 ${r.title}</div>
          <button class="btn btn-success" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openPdfReader('${r.documentId}', ${r.lastPageRead}, '${q.replace(/'/g, "\\'")}')">
            Open PDF Reader →
          </button>
        </div>
        <div style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          File: ${r.fileName} • Page ${r.lastPageRead} of ${r.totalPages}
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.875rem; color: #cbd5e1; font-style: italic;">
          "${r.snippet}"
        </div>
      `;
      container.appendChild(card);
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose);">Search error: ${err.message}</div>`;
  }
}

// ============================================================
// UPLOAD FORM & MODAL HANDLERS
// ============================================================
function openUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (modal) modal.style.display = 'flex';
}

function closeUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('upload-form');
  if (form) form.reset();
}

async function handleDashboardAskSubmit(e) {
  if (e) e.preventDefault();

  const docSelect = document.getElementById('dashboard-ai-doc-select');
  const queryInput = document.getElementById('dashboard-ai-query-input');

  const documentId = docSelect ? docSelect.value : '';
  const query = queryInput ? queryInput.value.trim() : '';

  // Navigate to Dedicated Grounded AI Q&A Engine Route (/ask-question)
  switchNavTab('tab-ask-ai', true, { documentId });

  if (query) {
    const aiQueryInput = document.getElementById('ai-query-input');
    if (aiQueryInput) aiQueryInput.value = query;

    const aiDocSelect = document.getElementById('ai-doc-select');
    if (aiDocSelect) aiDocSelect.value = documentId;

    handleAskAiSubmit();
  }
}

async function handleAskAiSubmit(e) {
  if (e) e.preventDefault();

  const docSelect = document.getElementById('ai-doc-select');
  const queryInput = document.getElementById('ai-query-input');
  const submitBtn = document.getElementById('ask-ai-submit-btn');

  const documentId = docSelect ? docSelect.value : '';
  const query = queryInput ? queryInput.value.trim() : '';

  if (!query) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Thinking...';
  }

  try {
    const res = await fetch(`${BACKEND_URL}/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ documentId, query })
    });

    const data = await res.json();
    if (data.success) {
      const card = document.getElementById('ai-answer-card');
      if (card) card.style.display = 'block';

      const answerEl = document.getElementById('ai-answer-text');
      if (answerEl) answerEl.textContent = data.answer;

      const ver = data.verification || {};
      const statusBadge = ver.status === 'VERIFIED' ? 'badge-success' : ver.status === 'CONFLICT_DETECTED' ? 'badge-danger' : 'badge-warning';

      // Store active citations globally for reliable state management
      console.log('[RAG CITATIONS RESPONSE KEYS]', Object.keys(data || {}));
      console.log('[RAG FRONTEND CHECK]', {
        status: data.success ? 'SUCCESS' : 'FAILED',
        verificationStatus: ver.status,
        sourceCount: data.sources?.length || 0,
        citationCount: data.citations?.length || 0
      });

      const retrievedSources = data.sources || data.citations || (data.verification ? data.verification.sources : []) || [];
      window.currentAiCitations = retrievedSources;
      console.log('[RAG CITATIONS RETURNED]', window.currentAiCitations);

      let sourcesHtml = '';
      if (retrievedSources && retrievedSources.length > 0) {
        sourcesHtml += '<div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.85rem;"><strong style="font-size: 0.85rem; color: var(--primary); display: block; margin-bottom: 0.5rem;">Verified Source Citations:</strong>';
        retrievedSources.forEach((src, idx) => {
          const isResolvable = src && src.documentId && (src.pageNumber || src.pageNumber === 0) && (src.rawChunkText || src.text) && src.isResolvable !== false;
          const textSnippet = (src.rawChunkText || src.text || '').substring(0, 80).replace(/</g, '&lt;').replace(/>/g, '&gt;');

          if (!isResolvable) {
            sourcesHtml += `
              <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.825rem;">
                <div>
                  <div>📄 <strong>${src.fileName || 'PDF Document'}</strong> — Page <strong>${src.pageNumber || 1}</strong></div>
                  <div style="color: var(--accent-rose); font-style: italic; margin-top: 0.15rem;">Source unavailable</div>
                </div>
                <span class="badge badge-warning">Source unavailable</span>
              </div>
            `;
          } else {
            sourcesHtml += `
              <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.825rem;">
                <div>
                  <div>📄 <strong>${src.fileName || 'PDF Document'}</strong> — Page <strong>${src.pageNumber || 1}</strong> <span style="font-size:0.75rem; color:var(--text-dim);">(Chunk ID: ${src.chunkId || 'N/A'})</span></div>
                  <div style="color: var(--text-muted); font-style: italic; margin-top: 0.15rem;">"${textSnippet}..."</div>
                </div>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; white-space: nowrap;" onclick="openSourceCitation(${idx})">
                  View Source →
                </button>
              </div>
            `;
          }
        });
        sourcesHtml += '</div>';
      }

      const summaryEl = document.getElementById('ai-verification-summary');
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 0.75rem; align-items: center; font-size: 0.875rem;">
                <span style="color: var(--text-muted);">Grounding Confidence: <strong style="color: var(--text-main);">${ver.trustScore || 0}%</strong></span>
                <span class="badge ${statusBadge}">${ver.status || 'INSUFFICIENT_EVIDENCE'}</span>
              </div>
            </div>
            <div class="trust-bar-container">
              <div class="trust-bar-fill" style="width: ${ver.trustScore || 0}%;"></div>
            </div>
          </div>
          ${sourcesHtml}
        `;
      }
    } else {
      alert('Ask PDF failed: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Ask PDF error: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ask AI';
    }
  }
}

// Delete Document
async function deleteDocument(id) {
  if (!confirm('Are you sure you want to delete this document?')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/documents/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.success) {
      loadDashboardData();
    }
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

// ============================================================
// REMINDERS & COMPARISON HANDLERS (Preserved existing features)
// ============================================================
async function loadReminders() {
  try {
    const res = await fetch(`${BACKEND_URL}/reminders`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (res.status === 401) {
      logoutUser();
      return;
    }
    const data = await res.json();

    const upcomingBox = document.getElementById('upcoming-reminders-container');
    const dueTodayBox = document.getElementById('duetoday-reminders-container');
    const overdueBox = document.getElementById('overdue-reminders-container');
    const completedBox = document.getElementById('completed-reminders-container');

    if (!data.success || !data.categories) return;

    const { upcoming, dueToday, overdue, completed } = data.categories;

    // Update Header Notifications Count
    const totalDue = dueToday.length + overdue.length;
    const countBadge = document.getElementById('header-notif-count');
    if (countBadge) countBadge.textContent = totalDue;

    if (upcomingBox) {
      upcomingBox.innerHTML = upcoming.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem;">No upcoming reminders.</div>` : '';
      upcoming.forEach(r => upcomingBox.appendChild(createReminderCardElement(r)));
    }

    if (dueTodayBox) {
      dueTodayBox.innerHTML = dueToday.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem;">No reminders due today.</div>` : '';
      dueToday.forEach(r => dueTodayBox.appendChild(createReminderCardElement(r)));
    }

    if (overdueBox) {
      overdueBox.innerHTML = overdue.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem;">No overdue reminders.</div>` : '';
      overdue.forEach(r => overdueBox.appendChild(createReminderCardElement(r)));
    }

    if (completedBox) {
      completedBox.innerHTML = completed.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem;">No completed reminders.</div>` : '';
      completed.forEach(r => completedBox.appendChild(createReminderCardElement(r)));
    }

  } catch (err) {}
}

function createReminderCardElement(r) {
  const card = document.createElement('div');
  card.className = 'reminder-card';

  const isAuto = r.type === 'AUTOMATIC';
  const badgeClass = isAuto ? 'badge-automatic' : 'badge-manual';

  let emailBadgeHtml = '';
  if (!r.emailEnabled) {
    emailBadgeHtml = '<span class="badge badge-secondary">Email OFF</span>';
  } else if (r.emailStatus === 'SENT') {
    emailBadgeHtml = '<span class="badge badge-success">Email sent ✓</span>';
  } else if (r.emailStatus === 'FAILED') {
    emailBadgeHtml = `<span class="badge badge-danger">Email failed</span>`;
  } else {
    emailBadgeHtml = '<span class="badge badge-warning">PENDING</span>';
  }

  card.innerHTML = `
    <div class="reminder-header">
      <span class="reminder-title">${r.title}</span>
      <span class="badge ${badgeClass}">${r.type}</span>
    </div>

    <div class="reminder-meta-row">
      <span>📅 Event Date: <strong>${formatDateDisplay(r.eventDate)}</strong></span>
      ${r.eventTime ? `<span>⏰ Time: <strong>${r.eventTime}</strong></span>` : ''}
      <span>🔔 Remind: <strong>${formatDateDisplay(r.reminderDate)}</strong> (${r.noticeDays}d before)</span>
    </div>

    ${r.documentName ? `<div style="font-size: 0.85rem; color: var(--accent-cyan);">📄 Document: <strong>${r.documentName}</strong> (Page ${r.pageNumber || 1})</div>` : ''}
    ${r.evidence ? `<div class="reminder-evidence-box">"${r.evidence}"</div>` : ''}

    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.825rem; margin-top: 0.25rem;">
      <div style="display: flex; align-items: center; gap: 0.4rem;">
        <span>Email:</span>
        ${emailBadgeHtml}
      </div>
      <span>Status: <strong style="color: ${r.status === 'COMPLETED' ? 'var(--accent-emerald)' : 'var(--text-main)'};">${r.status}</strong></span>
    </div>

    <div class="reminder-actions">
      <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="testEmailReminder('${r._id}', event)">
        ${r.emailStatus === 'FAILED' ? '🔄 Retry Email' : '✉️ Test Email'}
      </button>
      ${r.status !== 'COMPLETED' ? `<button class="btn btn-success" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="completeReminder('${r._id}')">✓ Complete</button>` : ''}
      <button class="btn btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="deleteReminder('${r._id}')">🗑️ Delete</button>
    </div>
  `;

  return card;
}

function openManualReminderModal() {
  const modal = document.getElementById('manual-reminder-modal');
  if (modal) modal.style.display = 'flex';
}

function closeManualReminderModal() {
  const modal = document.getElementById('manual-reminder-modal');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('manual-reminder-form');
  if (form) form.reset();
}

async function handleManualReminderSubmit(e) {
  if (e) e.preventDefault();

  const title = document.getElementById('manual-title').value;
  const eventDate = document.getElementById('manual-date').value;
  const eventTime = document.getElementById('manual-time').value;
  const description = document.getElementById('manual-description').value;
  const noticeDays = document.getElementById('manual-notice-days').value;
  const emailEnabled = document.getElementById('manual-email-enabled').checked;

  try {
    const res = await fetch(`${BACKEND_URL}/reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        type: 'MANUAL',
        title,
        eventDate,
        eventTime,
        description,
        noticeDays: parseInt(noticeDays, 10),
        emailEnabled
      })
    });

    const data = await res.json();
    if (data.success) {
      closeManualReminderModal();
      loadReminders();
    } else {
      alert('Failed to create reminder: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Error creating reminder: ' + err.message);
  }
}

async function testEmailReminder(reminderId, event) {
  if (event) event.stopPropagation();

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}/test-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const data = await res.json();

    if (data.success) {
      alert('Test email sent successfully!');
      loadReminders();
    } else {
      alert('Failed to send test email: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Test email error: ' + err.message);
  }
}

async function completeReminder(reminderId) {
  if (!confirm('Mark this reminder as completed?')) return;

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const data = await res.json();

    if (data.success) {
      loadReminders();
    } else {
      alert('Failed to complete reminder: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Complete reminder error: ' + err.message);
  }
}

async function deleteReminder(reminderId) {
  if (!confirm('Are you sure you want to delete this reminder?')) return;

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const data = await res.json();

    if (data.success) {
      loadReminders();
    } else {
      alert('Failed to delete reminder: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Delete reminder error: ' + err.message);
  }
}

window.testEmailReminder = testEmailReminder;
window.completeReminder = completeReminder;
window.deleteReminder = deleteReminder;

function openNotificationsModal() {
  switchNavTab('tab-reminders');
}

// Compare Documents Handler
async function handleCompareSubmit(e) {
  if (e) e.preventDefault();

  const docAId = document.getElementById('compare-doc-a').value;
  const docBId = document.getElementById('compare-doc-b').value;
  const submitBtn = document.getElementById('compare-submit-btn');

  if (!docAId || !docBId || docAId === docBId) {
    alert('Please select two different documents for comparison.');
    return;
  }

  console.log('[COMPARE REQUEST]', {
    documentAId: docAId,
    documentBId: docBId
  });

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Comparing Documents...';
  }

  try {
    const res = await fetch(`${BACKEND_URL}/comparison/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ documentAId: docAId, documentBId: docBId })
    });
    const data = await res.json();

    if (data.success) {
      const r = data.result;
      const resultsPanel = document.getElementById('compare-results-panel');
      resultsPanel.style.display = 'block';

      if (data.status === 'COMPARISON_UNAVAILABLE' || (r && r.status === 'COMPARISON_UNAVAILABLE')) {
        document.getElementById('summary-total-changes').textContent = '0';
        if (document.getElementById('summary-unchanged')) document.getElementById('summary-unchanged').textContent = '0';
        document.getElementById('summary-added').textContent = '0';
        document.getElementById('summary-removed').textContent = '0';
        document.getElementById('summary-modified').textContent = '0';
        document.getElementById('summary-contradictions').textContent = '0';

        document.getElementById('compare-summary-text').textContent = data.warningMessage || (r && r.warningMessage) || 'One or both documents do not contain extractable text.';
        renderDifferenceCards([]);
        return;
      }

      document.getElementById('summary-total-changes').textContent = r.summary.totalChanges;
      if (document.getElementById('summary-unchanged')) document.getElementById('summary-unchanged').textContent = r.summary.unchanged || 0;
      document.getElementById('summary-added').textContent = r.summary.added;
      document.getElementById('summary-removed').textContent = r.summary.removed;
      document.getElementById('summary-modified').textContent = r.summary.modified;
      document.getElementById('summary-contradictions').textContent = r.summary.contradictions;

      document.getElementById('compare-summary-text').textContent = r.summary.textSummary;

      renderDifferenceCards(r.differences);
    } else {
      alert('Comparison failed: ' + formatErrorMessage(data));
    }
  } catch (err) {
    alert('Comparison error: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '[ Compare Documents ]';
    }
  }
}

function renderDifferenceCards(differences) {
  const container = document.getElementById('differences-cards-container');
  if (!container) return;

  if (!differences || differences.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">No significant semantic differences found between selected documents.</p>';
    return;
  }

  container.innerHTML = '';
  differences.forEach(d => {
    const badgeClass = d.status === 'ADDED' ? 'badge-success' : d.status === 'REMOVED' ? 'badge-danger' : d.status === 'MODIFIED' ? 'badge-primary' : 'badge-secondary';

    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(255,255,255,0.03); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-bottom: 1rem;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600; font-size: 0.95rem; color: var(--accent-cyan);">${d.topic}</span>
        <span class="badge ${badgeClass}">${d.status}</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem; margin-bottom: 0.75rem;">
        <div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: var(--radius-sm);">
          <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">DOCUMENT A (Page ${d.documentA.pageNumber || 'N/A'})</div>
          <div style="color: var(--text-primary); line-height: 1.4;">${d.documentA.text}</div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: var(--radius-sm);">
          <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">DOCUMENT B (Page ${d.documentB.pageNumber || 'N/A'})</div>
          <div style="color: var(--text-primary); line-height: 1.4;">${d.documentB.text}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// On DOM Ready Initializer
document.addEventListener('DOMContentLoaded', () => {
  setupTabNavigation();
  if (initAuthSession()) {
    checkSystemStatus();
    loadDashboardData();
    loadReminders();
    handleInitialRouting();
  }

  // Upload Form Listener
  const uploadForm = document.getElementById('upload-form');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('doc-title').value;
      const fileInput = document.getElementById('doc-file');
      const classification = document.getElementById('doc-classification').value;
      const submitBtn = document.getElementById('upload-submit-btn');

      if (!fileInput.files[0]) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading & Indexing...';
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('document', fileInput.files[0]);
      formData.append('classification', classification);

      try {
        const res = await fetch(`${BACKEND_URL}/documents/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          closeUploadModal();
          loadDashboardData();

          if (data.dateSuggestions && data.dateSuggestions.length > 0) {
            openPdfSuggestionModal(data.dateSuggestions[0]);
          } else {
            alert('PDF document uploaded and indexed successfully!');
          }
        } else {
          alert('Upload failed: ' + formatErrorMessage(data));
        }
      } catch (err) {
        alert('Upload error: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload & Index';
        }
      }
    });
  }
});
