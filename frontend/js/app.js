/**
 * ReadDocX — PDF Reader & Document Intelligence Workspace Controller
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

// Enterprise Button Micro-Interaction Helper
function setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
  } else {
    if (btn.dataset.originalHtml !== undefined) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

// Enterprise Toast Notification System
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconMap = {
    success: '✓',
    warning: '⚠️',
    error: '✕',
    info: 'ℹ️'
  };
  const icon = iconMap[type] || 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
  }, duration);
}

window.setButtonLoading = setButtonLoading;
window.showToast = showToast;

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

const TITLE_MAP = {
  'tab-dashboard': 'ReadDocX — Dashboard',
  'tab-documents': 'ReadDocX — Documents',
  'tab-recent': 'ReadDocX — Documents',
  'tab-bookmarks': 'ReadDocX — Bookmarks',
  'tab-notes': 'ReadDocX — Notes',
  'tab-ask-ai': 'ReadDocX — Document Verification',
  'tab-search': 'ReadDocX — Search',
  'tab-compare': 'ReadDocX — Compare',
  'tab-reminders': 'ReadDocX — Reminders',
  'tab-settings': 'ReadDocX — Settings'
};

function switchNavTab(targetTab, updateUrl = true, params = {}) {
  if (TITLE_MAP[targetTab]) {
    document.title = TITLE_MAP[targetTab];
  }
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
  if (targetTab === 'tab-settings') {
    if (!window.allUserDocuments) {
      loadVaultDocuments().then(() => updatePrivacySettingsMetrics());
    } else {
      updatePrivacySettingsMetrics();
    }
  }
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

function handleUnauthorized() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.setItem('session_expired_message', 'Your session has expired. Please sign in again.');
  window.location.href = 'login.html';
}

function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

window.handleUnauthorized = handleUnauthorized;
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
      handleUnauthorized();
      return;
    }
    const data = await res.json();

    if (!data.success) return;

    // 1. Stats Summary Cards
    const { totalDocuments, recentlyOpened, totalBookmarks, totalNotes } = data.stats;
    if (document.getElementById('stat-total-documents')) document.getElementById('stat-total-documents').textContent = totalDocuments;
    if (document.getElementById('stat-recently-opened')) document.getElementById('stat-recently-opened').textContent = recentlyOpened;
    if (document.getElementById('stat-documents-ready')) document.getElementById('stat-documents-ready').textContent = totalDocuments;
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

window.allUserBookmarks = [];
window.allUserNotes = [];

function escapeJsString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
}

// Render Bookmarks Tab List
function renderBookmarksList(bookmarks) {
  window.allUserBookmarks = bookmarks || [];
  filterBookmarksList();
}

function filterBookmarksList() {
  const container = document.getElementById('bookmarks-container') || document.getElementById('all-bookmarks-container');
  if (!container) return;

  const searchInput = document.getElementById('bookmarks-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = (window.allUserBookmarks || []).filter(b => {
    if (!q) return true;
    const titleMatch = (b.title || '').toLowerCase().includes(q);
    const docMatch = (b.documentTitle || b.fileName || '').toLowerCase().includes(q);
    const pageMatch = String(b.pageNumber || 1).includes(q);
    return titleMatch || docMatch || pageMatch;
  });

  if (filtered.length === 0) {
    if (!window.allUserBookmarks || window.allUserBookmarks.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text-muted); padding: 1.5rem; text-align: center; background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px;">
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-main); margin-bottom: 0.25rem;">No bookmarks yet</div>
          <div style="font-size: 0.85rem;">Bookmark important document pages while reviewing to access them quickly.</div>
        </div>
      `;
    } else {
      container.innerHTML = `<div style="color: var(--text-muted); padding: 1rem; background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px;">No bookmarks match your search query "${q}".</div>`;
    }
    return;
  }

  container.innerHTML = '';
  filtered.forEach(b => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem;';
    card.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.95rem; color: #0f62fe; display: flex; align-items: center; gap: 0.4rem;">
          <svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span>Page ${b.pageNumber}: ${b.title || 'Page Bookmark'}</span>
        </div>
        <div style="font-size: 0.825rem; color: var(--text-muted); margin-top: 0.25rem;">
          Document: <strong>${b.documentTitle || b.fileName}</strong> • Added ${formatDateDisplay(b.createdAt)}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; border-radius: 2px;" onclick="openPdfReader('${b.documentId}', ${b.pageNumber})">
          Open Page ${b.pageNumber} →
        </button>
        <button class="btn btn-danger" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; border-radius: 2px;" onclick="deleteBookmark('${b.documentId}', '${b.id}')">
          Remove
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Delete Bookmark
async function deleteBookmark(documentId, bookmarkId) {
  if (!confirm('Remove this bookmark?')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/documents/${documentId}/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Bookmark removed', 'success');
      loadDashboardData();
    } else {
      showToast('Failed to remove bookmark: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Error removing bookmark: ' + err.message, 'error');
  }
}

// Render Notes Tab List
function renderNotesList(notes) {
  window.allUserNotes = notes || [];
  filterNotesList();
}

function filterNotesList() {
  const container = document.getElementById('notes-container') || document.getElementById('all-notes-container');
  if (!container) return;

  const searchInput = document.getElementById('notes-search-input');
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = (window.allUserNotes || []).filter(n => {
    if (!q) return true;
    const contentMatch = (n.content || '').toLowerCase().includes(q);
    const docMatch = (n.documentTitle || n.fileName || '').toLowerCase().includes(q);
    const pageMatch = String(n.pageNumber || 1).includes(q);
    return contentMatch || docMatch || pageMatch;
  });

  if (filtered.length === 0) {
    if (!window.allUserNotes || window.allUserNotes.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text-muted); padding: 1.5rem; text-align: center; background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px;">
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-main); margin-bottom: 0.25rem;">No notes yet</div>
          <div style="font-size: 0.85rem; margin-bottom: 1rem;">Create a note while reviewing a document to store important findings.</div>
          <button class="btn btn-primary" onclick="openCreateNoteModal()">+ New Note</button>
        </div>
      `;
    } else {
      container.innerHTML = `<div style="color: var(--text-muted); padding: 1rem; background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px;">No notes match your search query "${q}".</div>`;
    }
    return;
  }

  container.innerHTML = '';
  filtered.forEach(n => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px; padding: 1.15rem; margin-bottom: 0.85rem; display: flex; flex-direction: column; gap: 0.6rem;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 600; font-size: 0.95rem; color: #198038; display: flex; align-items: center; gap: 0.4rem;">
          <svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>Note on Page ${n.pageNumber}</span>
        </div>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.775rem; border-radius: 2px;" onclick="openPdfReader('${n.documentId}', ${n.pageNumber})">
            Open PDF →
          </button>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.775rem; border-radius: 2px;" onclick="openEditNoteModal('${n.documentId}', '${n.id}', '${escapeJsString(n.content)}', ${n.pageNumber})">
            Edit
          </button>
          <button class="btn btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.775rem; border-radius: 2px;" onclick="deleteNote('${n.documentId}', '${n.id}')">
            Delete
          </button>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 0.85rem 1rem; border-radius: 2px; font-size: 0.875rem; color: var(--text-main); line-height: 1.5; border: 1px solid var(--border-color); white-space: pre-wrap;">${(n.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div style="font-size: 0.775rem; color: var(--text-muted);">
        Document: <strong>${n.documentTitle || n.fileName}</strong> • Updated ${formatDateDisplay(n.createdAt)}
      </div>
    `;
    container.appendChild(card);
  });
}

// Open Create Note Modal
function openCreateNoteModal(documentId = '', pageNumber = 1) {
  const modal = document.getElementById('note-modal');
  const titleEl = document.getElementById('note-modal-title');
  const docIdInput = document.getElementById('note-target-doc-id');
  const noteIdInput = document.getElementById('note-target-note-id');
  const docSelect = document.getElementById('note-doc-select');
  const pageInput = document.getElementById('note-page-input');
  const contentInput = document.getElementById('note-content-input');
  const submitBtn = document.getElementById('note-submit-btn');

  if (!modal || !docSelect) return;

  if (titleEl) titleEl.textContent = 'New Document Note';
  if (docIdInput) docIdInput.value = '';
  if (noteIdInput) noteIdInput.value = '';
  if (contentInput) contentInput.value = '';
  if (pageInput) pageInput.value = pageNumber || 1;
  if (submitBtn) submitBtn.textContent = 'Save Note';

  // Populate docSelect dropdown
  docSelect.innerHTML = '<option value="">Select Document...</option>';
  if (window.allUserDocuments && window.allUserDocuments.length > 0) {
    window.allUserDocuments.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc._id;
      opt.textContent = `${doc.title} (${doc.fileName})`;
      if (documentId && doc._id === documentId) opt.selected = true;
      docSelect.appendChild(opt);
    });
  }

  modal.style.display = 'flex';
}

// Open Edit Note Modal
function openEditNoteModal(documentId, noteId, content, pageNumber = 1) {
  const modal = document.getElementById('note-modal');
  const titleEl = document.getElementById('note-modal-title');
  const docIdInput = document.getElementById('note-target-doc-id');
  const noteIdInput = document.getElementById('note-target-note-id');
  const docSelect = document.getElementById('note-doc-select');
  const pageInput = document.getElementById('note-page-input');
  const contentInput = document.getElementById('note-content-input');
  const submitBtn = document.getElementById('note-submit-btn');

  if (!modal || !docSelect) return;

  if (titleEl) titleEl.textContent = 'Edit Document Note';
  if (docIdInput) docIdInput.value = documentId;
  if (noteIdInput) noteIdInput.value = noteId;
  if (contentInput) contentInput.value = content || '';
  if (pageInput) pageInput.value = pageNumber || 1;
  if (submitBtn) submitBtn.textContent = 'Update Note';

  // Populate docSelect dropdown
  docSelect.innerHTML = '<option value="">Select Document...</option>';
  if (window.allUserDocuments && window.allUserDocuments.length > 0) {
    window.allUserDocuments.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc._id;
      opt.textContent = `${doc.title} (${doc.fileName})`;
      if (doc._id === documentId) opt.selected = true;
      docSelect.appendChild(opt);
    });
  }
  docSelect.value = documentId;

  modal.style.display = 'flex';
}

function closeNoteModal() {
  const modal = document.getElementById('note-modal');
  if (modal) modal.style.display = 'none';
}

// Handle Note Form Submission (Create or Update)
async function handleNoteFormSubmit(e) {
  if (e) e.preventDefault();

  const docIdInput = document.getElementById('note-target-doc-id');
  const noteIdInput = document.getElementById('note-target-note-id');
  const docSelect = document.getElementById('note-doc-select');
  const pageInput = document.getElementById('note-page-input');
  const contentInput = document.getElementById('note-content-input');
  const submitBtn = document.getElementById('note-submit-btn');

  const documentId = docSelect ? docSelect.value : (docIdInput ? docIdInput.value : '');
  const noteId = noteIdInput ? noteIdInput.value : '';
  const pageNumber = pageInput ? parseInt(pageInput.value, 10) || 1 : 1;
  const content = contentInput ? contentInput.value.trim() : '';

  if (!documentId) {
    showToast('Please select a target document', 'warning');
    return;
  }
  if (!content) {
    showToast('Note content cannot be empty', 'warning');
    return;
  }

  const isEditing = Boolean(noteId);
  setButtonLoading(submitBtn, true, isEditing ? 'Updating...' : 'Saving...');

  try {
    const url = isEditing
      ? `${BACKEND_URL}/documents/${documentId}/notes/${noteId}`
      : `${BACKEND_URL}/documents/${documentId}/notes`;
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ pageNumber, content })
    });

    const data = await res.json();
    if (data.success) {
      showToast(isEditing ? 'Note updated' : 'Note saved', 'success');
      closeNoteModal();
      loadDashboardData();
    } else {
      showToast('Failed to save note: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Error saving note: ' + err.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

// Delete Note
async function deleteNote(documentId, noteId) {
  if (!confirm('Delete this note?')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/documents/${documentId}/notes/${noteId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Note deleted', 'success');
      loadDashboardData();
    } else {
      showToast('Failed to delete note: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Error deleting note: ' + err.message, 'error');
  }
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

    // Update Settings Privacy Metrics
    updatePrivacySettingsMetrics();

  } catch (err) {
    console.error('Failed to load vault documents:', err);
  }
}

function updatePrivacySettingsMetrics() {
  const docs = window.allUserDocuments || [];
  const totalEl = document.getElementById('settings-total-docs');
  const confEl = document.getElementById('settings-confidential-docs');
  const ocrEl = document.getElementById('settings-ocr-docs');
  const recentEl = document.getElementById('settings-recent-docs');

  if (totalEl) totalEl.textContent = docs.length;
  if (confEl) {
    const confidentialCount = docs.filter(d => 
      !d.classification || d.classification === 'CONFIDENTIAL' || d.classification === 'HIGHLY_SENSITIVE'
    ).length;
    confEl.textContent = confidentialCount;
  }
  if (ocrEl) {
    const ocrCount = docs.filter(d => d.extractionMethod === 'ocr').length;
    ocrEl.textContent = ocrCount;
  }
  if (recentEl) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = docs.filter(d => new Date(d.createdAt) >= sevenDaysAgo).length;
    recentEl.textContent = recentCount;
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
        <span class="badge badge-success">✓ Ready</span>
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
    dashSelect.innerHTML = '<option value="">Search All Documents</option>';
    documents.forEach(d => { dashSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    dashSelect.value = val;
  }

  if (aiSelect) {
    const val = aiSelect.value;
    aiSelect.innerHTML = '<option value="">Search All Documents</option>';
    documents.forEach(d => { aiSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    aiSelect.value = val;
  }

  if (compASelect) {
    const val = compASelect.value;
    compASelect.innerHTML = '<option value="">Select Document A...</option>';
    documents.forEach(d => { compASelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    compASelect.value = val;
  }

  if (compBSelect) {
    const val = compBSelect.value;
    compBSelect.innerHTML = '<option value="">Select Document B...</option>';
    documents.forEach(d => { compBSelect.innerHTML += `<option value="${d._id}">${d.title} (${d.fileName})</option>`; });
    compBSelect.value = val;
  }
}

// ============================================================
// INTERACTIVE FULLSCREEN PDF READER CONTROLLER
// ============================================================
let currentReaderCitation = null;
window.currentAiCitations = [];

// SAFE MARKDOWN RENDERER
function renderMarkdownSafely(text) {
  if (!text) return '';
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```...```
  safe = safe.replace(/```([\s\S]*?)```/g, (match, p1) => {
    return `<pre class="code-block-wrapper" style="background:#161616; color:#f8fafc; padding:0.85rem 1rem; border-radius:4px; overflow-x:auto; font-family:monospace; font-size:0.85rem; margin:0.75rem 0;"><code>${p1.trim()}</code></pre>`;
  });

  // Inline code `...`
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:#e8e8e8; color:#161616; padding:0.15rem 0.35rem; border-radius:3px; font-family:monospace; font-size:0.85em;">$1</code>');

  // Headers
  safe = safe.replace(/^### (.*$)/gim, '<h4 style="font-size:1rem; font-weight:600; color:var(--text-main); margin-top:1.25rem; margin-bottom:0.4rem;">$1</h4>');
  safe = safe.replace(/^## (.*$)/gim, '<h3 style="font-size:1.1rem; font-weight:600; color:var(--text-main); margin-top:1.5rem; margin-bottom:0.5rem;">$1</h3>');
  safe = safe.replace(/^# (.*$)/gim, '<h2 style="font-size:1.25rem; font-weight:700; color:var(--text-main); margin-top:1.5rem; margin-bottom:0.5rem;">$1</h2>');

  // Bold & Italics
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Tables
  safe = safe.replace(/((?:\|[^\n]+\|\n)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => l.includes('|'));
    if (lines.length < 2) return match;
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:1rem 0; font-size:0.85rem; border:1px solid var(--border-color);">';
    lines.forEach((line, i) => {
      if (line.includes('---')) return;
      const cells = line.split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      const tag = i === 0 ? 'th' : 'td';
      const bg = i === 0 ? 'background:#f4f4f4; font-weight:600;' : '';
      tableHtml += '<tr>';
      cells.forEach(c => {
        tableHtml += `<${tag} style="padding:0.5rem 0.75rem; border:1px solid var(--border-color); ${bg}">${c.trim()}</${tag}>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table>';
    return tableHtml;
  });

  // Bullets
  safe = safe.replace(/^[\*\-] (.*$)/gim, '<li style="margin-bottom:0.25rem;">$1</li>');
  safe = safe.replace(/((?:<li style="margin-bottom:0.25rem;">.*<\/li>\n?)+)/g, '<ul style="margin:0.5rem 0 1rem 1.25rem; padding:0; list-style-type:disc;">$1</ul>');

  // Paragraph breaks
  safe = safe.replace(/\n\n/g, '<br><br>');

  return safe;
}

function openSourceCitation(citationIndex) {
  const citations = window.currentAiCitations || [];
  const src = citations[citationIndex];

  if (!src || !src.documentId) {
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
    const modal = document.getElementById('reader-modal') || document.getElementById('pdf-reader-modal');
    if (modal) modal.style.display = 'flex';

    // Update Header
    const titleEl = document.getElementById('reader-pdf-title') || document.getElementById('reader-doc-title');
    if (titleEl) titleEl.textContent = currentReaderDoc.title || currentReaderDoc.fileName || 'Document Viewer';

    const pageCurEl = document.getElementById('reader-current-page') || document.getElementById('reader-page-input');
    if (pageCurEl) {
      if (pageCurEl.tagName === 'INPUT') pageCurEl.value = currentReaderPage;
      else pageCurEl.textContent = currentReaderPage;
    }

    const totalPagesEl = document.getElementById('reader-total-pages');
    if (totalPagesEl) totalPagesEl.textContent = currentReaderTotalPages;

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
              if (totalPagesEl) totalPagesEl.textContent = currentReaderTotalPages;
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
    console.error('[openPdfReader Exception]', err);
    alert('Unable to load PDF. Please try again.');
  }
}

function closePdfReader() {
  const modal = document.getElementById('reader-modal') || document.getElementById('pdf-reader-modal');
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
          <strong style="color: var(--accent-cyan); font-size: 0.9rem;">📍 Source Evidence Citation</strong>
          <span class="badge badge-success">Page ${currentReaderCitation.pageNumber || currentReaderPage}</span>
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
      showToast('Bookmark added', 'success');
      renderReaderSidebar();
      loadDashboardData();
    } else {
      showToast('Failed to add bookmark: ' + formatErrorMessage(data), 'error');
    }
  } catch (e) {
    showToast('Error adding bookmark: ' + e.message, 'error');
  }
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
      showToast('Bookmark removed', 'success');
      renderReaderSidebar();
      loadDashboardData();
    } else {
      showToast('Failed to remove bookmark: ' + formatErrorMessage(data), 'error');
    }
  } catch (e) {
    showToast('Error removing bookmark: ' + e.message, 'error');
  }
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
      showToast('Note saved', 'success');
      renderReaderSidebar();
      loadDashboardData();
    } else {
      showToast('Failed to save note: ' + formatErrorMessage(data), 'error');
    }
  } catch (e) {
    showToast('Error saving note: ' + e.message, 'error');
  }
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
  const searchBtn = document.getElementById('dedicated-search-btn') || document.querySelector('#tab-search button');
  if (!queryInput || !container) return;

  const q = queryInput.value.trim();
  if (!q) return;

  setButtonLoading(searchBtn, true, 'Searching document...');
  container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.875rem;">Searching document library...</div>';

  try {
    const res = await fetch(`${BACKEND_URL}/documents/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    const data = await res.json();

    if (!data.success || !data.results || data.results.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.875rem;">No documents or snippets found matching "${q}".</div>`;
      showToast(`No documents found matching "${q}"`, 'info');
      return;
    }

    container.innerHTML = `<div style="font-weight: 600; font-size: 0.9rem; color: var(--primary); margin-bottom: 1rem;">Found ${data.results.length} matching document(s) for "${q}":</div>`;

    data.results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'result-slide-up';
      card.style.cssText = 'background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem; box-shadow: var(--shadow-sm);';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">📄 ${r.title}</div>
          <button class="btn btn-success" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openPdfReader('${r.documentId}', ${r.lastPageRead}, '${q.replace(/'/g, "\\'")}')">
            Open PDF Reader →
          </button>
        </div>
        <div style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          File: ${r.fileName} • Page ${r.lastPageRead} of ${r.totalPages}
        </div>
        <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--text-muted); font-style: italic;">
          "${r.snippet}"
        </div>
      `;
      container.appendChild(card);
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose);">Search error: ${err.message}</div>`;
    showToast('Search error: ' + err.message, 'error');
  } finally {
    setButtonLoading(searchBtn, false);
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

async function renderReaderPageContent() {
  const viewport = document.getElementById('reader-text-viewport') || document.getElementById('reader-page-viewport');
  if (!viewport || !currentReaderDoc) return;

  const pageInp = document.getElementById('reader-page-input') || document.getElementById('reader-current-page');
  if (pageInp) {
    if (pageInp.tagName === 'INPUT') pageInp.value = currentReaderPage;
    else pageInp.textContent = currentReaderPage;
  }

  // Build Source Preview Banner if opened via citation
  let sourceBannerHtml = '';
  if (currentReaderCitation) {
    sourceBannerHtml = `
      <div id="source-preview-banner" style="background: rgba(15, 98, 254, 0.08); border: 1px solid #0f62fe; border-radius: var(--radius-sm); padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <strong style="color: #0f62fe; font-size: 0.9rem;">📍 Source Evidence Citation</strong>
          <span class="badge badge-success">Page ${currentReaderCitation.pageNumber || currentReaderPage}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.35rem;">
          Source Document: <strong>${currentReaderCitation.fileName || currentReaderDoc.fileName}</strong>
        </div>
        <div style="background: #ffffff; border-left: 3px solid #0f62fe; padding: 0.6rem 0.8rem; font-size: 0.85rem; color: var(--text-main); font-style: italic; white-space: pre-wrap; border-radius: 2px;">
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
        <div style="display: flex; justify-content: center; overflow-x: auto; background: #e8e8e8; padding: 1.25rem; border-radius: var(--radius-sm); min-height: 400px;">
          <canvas id="pdf-render-canvas" style="box-shadow: 0 4px 16px rgba(0,0,0,0.15); border-radius: 2px; max-width: 100%; height: auto; background: #ffffff;"></canvas>
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

  // 2. Text Fallback View
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
    pageText = `Unable to load PDF text content for page ${currentReaderPage}.`;
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
          htmlContent = htmlContent.replace(regex, '<mark class="page-highlight" style="background: #f1c21b; color: #161616; padding: 0.15rem 0.3rem; border-radius: 2px; font-weight: 600;">$1</mark>');
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
    <div style="line-height: 1.6; white-space: pre-wrap; font-size: 0.9rem;">${htmlContent}</div>
  `;

  setTimeout(() => {
    const mark = viewport.querySelector('.page-highlight');
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function openAskAiForDoc(documentId, query = '') {
  switchNavTab('tab-ask-ai', true, { documentId });

  if (query) {
    const aiQueryInput = document.getElementById('ai-query-input');
    if (aiQueryInput) aiQueryInput.value = query;
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

  setButtonLoading(submitBtn, true, 'Analyzing document evidence...');

  try {
    const res = await fetch(`${BACKEND_URL}/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ documentId, query })
    });

    if (res.status === 401) {
      handleUnauthorized();
      return;
    }

    const data = await res.json();
    if (data.success) {
      const card = document.getElementById('ai-answer-card');
      if (card) {
        card.style.display = 'block';
        card.className = 'panel result-slide-up';
      }

      const answerEl = document.getElementById('ai-answer-text');
      if (answerEl) {
        answerEl.innerHTML = renderMarkdownSafely(data.answer);
      }

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

      let sourcesHtml = '';
      if (retrievedSources && retrievedSources.length > 0) {
        sourcesHtml += '<div style="margin-top: 1.25rem; border-top: 1px solid var(--border-color); padding-top: 1rem;"><strong style="font-size: 0.875rem; color: var(--text-main); display: block; margin-bottom: 0.65rem;">Source Evidence Citations:</strong>';
        retrievedSources.forEach((src, idx) => {
          const isResolvable = Boolean(src && src.documentId && (src.pageNumber || src.pageNumber === 0) && src.isResolvable !== false);
          const textSnippet = (src.rawChunkText || src.text || src.minimizedChunkText || '').substring(0, 100).replace(/</g, '&lt;').replace(/>/g, '&gt;');

          if (!isResolvable) {
            sourcesHtml += `
              <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px; padding: 0.75rem 0.9rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.825rem;">
                <div>
                  <div>📄 <strong>${src.fileName || 'PDF Document'}</strong> — Page <strong>${src.pageNumber || 1}</strong></div>
                  <div style="color: var(--accent-rose); font-style: italic; margin-top: 0.15rem;">Source unavailable</div>
                </div>
                <span class="badge badge-warning">Source unavailable</span>
              </div>
            `;
          } else {
            sourcesHtml += `
              <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 2px; padding: 0.75rem 0.9rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font-size: 0.825rem;">
                <div>
                  <div>📄 <strong>${src.fileName || 'PDF Document'}</strong> — Page <strong>${src.pageNumber || 1}</strong></div>
                  <div style="color: var(--text-muted); font-style: italic; margin-top: 0.2rem;">"${textSnippet}..."</div>
                </div>
                <button class="btn btn-secondary" style="padding: 0.3rem 0.7rem; font-size: 0.775rem; white-space: nowrap; border-radius: 2px;" onclick="openSourceCitation(${idx})">
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
        const userStatusLabel = ver.status === 'VERIFIED' ? '✓ Verified' : ver.status === 'CONFLICT_DETECTED' ? 'Conflict Detected' : 'Answer Could Not Be Verified';
        const userStatusBadge = ver.status === 'VERIFIED' ? 'badge-success' : ver.status === 'CONFLICT_DETECTED' ? 'badge-danger' : 'badge-warning';
        summaryEl.innerHTML = `
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 2px; padding: 1rem; margin-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Confidence & Sources</span>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">${ver.trustScore || 0}%</span>
                <span class="badge ${userStatusBadge}">${userStatusLabel}</span>
              </div>
            </div>
            <div class="trust-bar-container" style="background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
              <div class="trust-bar-fill" style="width: ${ver.trustScore || 0}%; background: ${ver.status === 'VERIFIED' ? '#16a34a' : ver.status === 'CONFLICT_DETECTED' ? '#dc2626' : '#d97706'}; height: 100%;"></div>
            </div>
          </div>
          ${sourcesHtml}
        `;
      }
    } else {
      showToast('Ask PDF failed: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Ask PDF error: ' + err.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false);
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
      showToast('Document deleted successfully.', 'success');
      loadDashboardData();
    } else {
      showToast('Delete failed: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

// ============================================================
// REMINDERS & COMPARISON HANDLERS (Preserved existing features)
// ============================================================
let isLoadingReminders = false;

async function loadReminders(forceReload = false) {
  if (isLoadingReminders) return;
  isLoadingReminders = true;

  const pendingBox = document.getElementById('reminders-pending-container');
  const completedBox = document.getElementById('reminders-completed-container');

  const upcomingBox = document.getElementById('upcoming-reminders-container');
  const dueTodayBox = document.getElementById('duetoday-reminders-container');
  const overdueBox = document.getElementById('overdue-reminders-container');
  const altCompletedBox = document.getElementById('completed-reminders-container');

  if (forceReload) {
    const loadingHtml = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.875rem;">Loading reminders...</div>`;
    if (pendingBox) pendingBox.innerHTML = loadingHtml;
    if (upcomingBox) upcomingBox.innerHTML = loadingHtml;
  }

  if (!AUTH_TOKEN) {
    isLoadingReminders = false;
    const msg = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Authentication required. Please sign in again.</div>`;
    if (pendingBox) pendingBox.innerHTML = msg;
    if (upcomingBox) upcomingBox.innerHTML = msg;
    return;
  }

  console.log('[REMINDER API] Fetching user reminders via GET /api/reminders...');
  console.log('[REMINDER API] Auth present:', !!AUTH_TOKEN);

  try {
    const res = await fetch(`${BACKEND_URL}/reminders`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    console.log('[REMINDER API]', { method: 'GET', url: `${BACKEND_URL}/reminders`, status: res.status });

    if (res.status === 401) {
      const authErrHtml = `<div style="grid-column: 1/-1; color: var(--accent-amber); font-size: 0.875rem;">Session expired. Please sign in again.</div>`;
      if (pendingBox) pendingBox.innerHTML = authErrHtml;
      if (upcomingBox) upcomingBox.innerHTML = authErrHtml;
      showToast('Session expired. Please sign in again.', 'warning');
      logoutUser();
      return;
    }

    if (res.status === 403) {
      const errHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Access denied. You do not have permission to view reminders.</div>`;
      if (pendingBox) pendingBox.innerHTML = errHtml;
      if (upcomingBox) upcomingBox.innerHTML = errHtml;
      return;
    }

    if (res.status === 404) {
      const errHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Reminders service is unavailable (404). Endpoint: ${BACKEND_URL}/reminders</div>`;
      if (pendingBox) pendingBox.innerHTML = errHtml;
      if (upcomingBox) upcomingBox.innerHTML = errHtml;
      console.error('[REMINDER API ERROR]', { status: 404, url: `${BACKEND_URL}/reminders`, message: 'Route not found' });
      return;
    }

    if (res.status >= 500) {
      const errHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Unable to load reminders. Server error (${res.status}). Please try again.</div>`;
      if (pendingBox) pendingBox.innerHTML = errHtml;
      if (upcomingBox) upcomingBox.innerHTML = errHtml;
      console.error('[REMINDER API ERROR]', { status: res.status, message: 'Server error' });
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const errHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Received non-JSON response from reminders service.</div>`;
      if (pendingBox) pendingBox.innerHTML = errHtml;
      if (upcomingBox) upcomingBox.innerHTML = errHtml;
      console.error('[REMINDER API ERROR]', { status: res.status, statusText: res.statusText, message: 'Non-JSON response received' });
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errMessage = formatErrorMessage(data);
      const errHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">${errMessage}</div>`;
      if (pendingBox) pendingBox.innerHTML = errHtml;
      if (upcomingBox) upcomingBox.innerHTML = errHtml;
      console.error('[REMINDER API ERROR]', { status: res.status, message: errMessage });
      return;
    }

    const categories = data.categories || {};
    const upcoming = categories.upcoming || [];
    const dueToday = categories.dueToday || [];
    const overdue = categories.overdue || [];
    const completed = categories.completed || [];

    const totalDue = dueToday.length + overdue.length;
    const countBadge = document.getElementById('header-notif-count');
    if (countBadge) countBadge.textContent = totalDue;

    const allPending = [...dueToday, ...overdue, ...upcoming];

    if (pendingBox) {
      pendingBox.innerHTML = allPending.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.875rem;">No upcoming or pending reminders.</div>` : '';
      allPending.forEach(r => pendingBox.appendChild(createReminderCardElement(r)));
    }

    if (completedBox) {
      completedBox.innerHTML = completed.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.875rem;">No completed reminders.</div>` : '';
      completed.forEach(r => completedBox.appendChild(createReminderCardElement(r)));
    }

    if (altCompletedBox) {
      altCompletedBox.innerHTML = completed.length === 0 ? `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.875rem;">No completed reminders.</div>` : '';
      completed.forEach(r => altCompletedBox.appendChild(createReminderCardElement(r)));
    }

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
  } catch (err) {
    console.error('[REMINDER API ERROR]', { status: 'FETCH_ERROR', message: err.message || String(err) });
    const netErrHtml = `<div style="grid-column: 1/-1; color: var(--accent-rose); font-size: 0.875rem;">Unable to connect to the reminders service. Please try again.</div>`;
    if (pendingBox) pendingBox.innerHTML = netErrHtml;
    if (upcomingBox) upcomingBox.innerHTML = netErrHtml;
  } finally {
    isLoadingReminders = false;
  }
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

window.activeDateSuggestion = null;

function openPdfSuggestionModal(suggestion) {
  window.activeDateSuggestion = suggestion;
  const modal = document.getElementById('pdf-suggestion-modal');
  if (!modal) return;

  const titleEl = document.getElementById('suggestion-title');
  const dateEl = document.getElementById('suggestion-date');
  const snippetEl = document.getElementById('suggestion-snippet');

  if (titleEl) titleEl.textContent = suggestion.title || suggestion.eventType || 'Document Deadline';
  if (dateEl) dateEl.textContent = formatDateDisplay(suggestion.eventDate || suggestion.date);
  if (snippetEl) snippetEl.textContent = `"${suggestion.snippet || suggestion.evidence || 'Actionable date detected'}"`;

  modal.style.display = 'flex';
}

function closePdfSuggestionModal() {
  const modal = document.getElementById('pdf-suggestion-modal');
  if (modal) modal.style.display = 'none';
  window.activeDateSuggestion = null;
}

async function confirmPdfSuggestion() {
  if (!window.activeDateSuggestion) {
    closePdfSuggestionModal();
    return;
  }
  const s = window.activeDateSuggestion;
  const noticeDaysSelect = document.getElementById('suggestion-notice-days');
  const noticeDays = noticeDaysSelect ? parseInt(noticeDaysSelect.value, 10) : 3;

  try {
    const res = await fetch(`${BACKEND_URL}/reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        type: 'AUTOMATIC',
        eventType: s.eventType || 'COMPLIANCE_DATE',
        title: s.title || 'Document Deadline',
        eventDate: s.eventDate || s.date,
        eventTime: s.eventTime || '09:00',
        noticeDays: noticeDays,
        documentId: s.documentId || null,
        documentName: s.documentName || null,
        pageNumber: s.pageNumber || 1,
        evidence: s.snippet || s.evidence || null,
        emailEnabled: true
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Automated reminder created!', 'success');
      closePdfSuggestionModal();
      loadReminders();
    } else {
      showToast('Failed to create reminder: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    showToast('Error creating reminder: ' + err.message, 'error');
  }
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

  const titleEl = document.getElementById('manual-title');
  const dateEl = document.getElementById('manual-date');
  const timeEl = document.getElementById('manual-time');
  const descEl = document.getElementById('manual-description');
  const noticeEl = document.getElementById('manual-notice-days');
  const emailEl = document.getElementById('manual-email-enabled');

  const title = titleEl ? titleEl.value : '';
  const eventDate = dateEl ? dateEl.value : '';
  const eventTime = timeEl ? timeEl.value : '';
  const description = descEl ? descEl.value : '';
  const noticeDays = noticeEl ? noticeEl.value : '7';
  const emailEnabled = emailEl ? emailEl.checked : true;
  const submitBtn = document.getElementById('manual-reminder-submit-btn') || (e && e.target ? e.target.querySelector('button[type="submit"]') : null);

  if (!title || !eventDate) {
    showToast('Title and Event Date are required.', 'warning');
    return;
  }

  setButtonLoading(submitBtn, true, 'Saving reminder...');

  console.log('[REMINDER API] Creating manual reminder via POST /api/reminders...');

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

    console.log('[REMINDER API]', { method: 'POST', url: `${BACKEND_URL}/reminders`, status: res.status });

    if (res.status === 401) {
      showToast('Session expired. Please sign in again.', 'warning');
      logoutUser();
      return;
    }

    const data = await res.json();
    if (data.success) {
      closeManualReminderModal();
      showToast('Reminder created successfully!', 'success');
      loadReminders();
    } else {
      console.error('[REMINDER API ERROR]', { status: res.status, message: formatErrorMessage(data) });
      showToast('Failed to create reminder: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    console.error('[REMINDER API ERROR]', { status: 'FETCH_ERROR', message: err.message || String(err) });
    showToast('Error creating reminder: ' + err.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function testEmailReminder(reminderId, event) {
  if (event) event.stopPropagation();
  const targetEl = event ? (event.target.closest ? event.target.closest('button') : event.target) : null;
  const btn = targetEl || (event ? event.target : null);

  setButtonLoading(btn, true, 'Sending...');

  console.log('[REMINDER API] Triggering test email for reminder ID:', reminderId);

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}/test-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    console.log('[REMINDER API]', { method: 'POST', url: `${BACKEND_URL}/reminders/${reminderId}/test-email`, status: res.status });

    if (res.status === 401) {
      showToast('Session expired. Please sign in again.', 'warning');
      logoutUser();
      return;
    }

    const data = await res.json();

    if (data.success) {
      showToast('Test email notification dispatched successfully!', 'success');
      loadReminders();
    } else {
      console.error('[REMINDER API ERROR]', { status: res.status, message: formatErrorMessage(data) });
      showToast('Unable to send test email: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    console.error('[REMINDER API ERROR]', { status: 'FETCH_ERROR', message: err.message || String(err) });
    showToast('Unable to send test email. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function completeReminder(reminderId) {
  if (!confirm('Mark this reminder as completed?')) return;
  console.log('[REMINDER API] Marking reminder completed ID:', reminderId);

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    console.log('[REMINDER API]', { method: 'POST', url: `${BACKEND_URL}/reminders/${reminderId}/complete`, status: res.status });

    if (res.status === 401) {
      showToast('Session expired. Please sign in again.', 'warning');
      logoutUser();
      return;
    }

    const data = await res.json();

    if (data.success) {
      showToast('Reminder marked as completed.', 'success');
      loadReminders();
    } else {
      console.error('[REMINDER API ERROR]', { status: res.status, message: formatErrorMessage(data) });
      showToast('Failed to complete reminder: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    console.error('[REMINDER API ERROR]', { status: 'FETCH_ERROR', message: err.message || String(err) });
    showToast('Failed to complete reminder. Please try again.', 'error');
  }
}

async function deleteReminder(reminderId) {
  if (!confirm('Are you sure you want to delete this reminder?')) return;
  console.log('[REMINDER API] Deleting reminder ID:', reminderId);

  try {
    const res = await fetch(`${BACKEND_URL}/reminders/${reminderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    console.log('[REMINDER API]', { method: 'DELETE', url: `${BACKEND_URL}/reminders/${reminderId}`, status: res.status });

    if (res.status === 401) {
      showToast('Session expired. Please sign in again.', 'warning');
      logoutUser();
      return;
    }

    const data = await res.json();

    if (data.success) {
      showToast('Reminder deleted successfully.', 'info');
      loadReminders();
    } else {
      console.error('[REMINDER API ERROR]', { status: res.status, message: formatErrorMessage(data) });
      showToast('Failed to delete reminder: ' + formatErrorMessage(data), 'error');
    }
  } catch (err) {
    console.error('[REMINDER API ERROR]', { status: 'FETCH_ERROR', message: err.message || String(err) });
    showToast('Failed to delete reminder. Please try again.', 'error');
  }
}

window.loadReminders = loadReminders;
window.openPdfSuggestionModal = openPdfSuggestionModal;
window.closePdfSuggestionModal = closePdfSuggestionModal;
window.confirmPdfSuggestion = confirmPdfSuggestion;
window.openManualReminderModal = openManualReminderModal;
window.closeManualReminderModal = closeManualReminderModal;
window.handleManualReminderSubmit = handleManualReminderSubmit;
window.testEmailReminder = testEmailReminder;
window.completeReminder = completeReminder;
window.deleteReminder = deleteReminder;

function openNotificationsModal() {
  switchNavTab('tab-reminders');
}

window.allCompareDifferences = [];
window.compareDocAId = '';
window.compareDocBId = '';

// Compare Documents Handler
async function handleCompareSubmit(e) {
  if (e) e.preventDefault();

  const docASelect = document.getElementById('compare-doc-a');
  const docBSelect = document.getElementById('compare-doc-b');
  const submitBtn = document.getElementById('compare-submit-btn');

  const docAId = docASelect ? docASelect.value : '';
  const docBId = docBSelect ? docBSelect.value : '';

  if (!docAId || !docBId) {
    showToast('Please select two documents to compare.', 'warning');
    return;
  }
  if (docAId === docBId) {
    showToast('Please select two different documents.', 'warning');
    return;
  }

  setButtonLoading(submitBtn, true, 'Comparing documents...');

  try {
    const res = await fetch(`${BACKEND_URL}/comparison/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ documentAId: docAId, documentBId: docBId })
    });

    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    const data = await res.json();

    if (data.success) {
      const r = data.result || {};
      window.compareDocAId = r.documentAId || docAId;
      window.compareDocBId = r.documentBId || docBId;

      const resultsPanel = document.getElementById('compare-results-panel');
      if (resultsPanel) {
        resultsPanel.style.display = 'block';
      }

      const docANameEl = document.getElementById('compare-doc-a-name');
      const docBNameEl = document.getElementById('compare-doc-b-name');
      if (docANameEl) docANameEl.textContent = r.documentA || 'Document A';
      if (docBNameEl) docBNameEl.textContent = r.documentB || 'Document B';

      const simValEl = document.getElementById('summary-similarity-value');
      const simStatusText = document.getElementById('similarity-status-text');
      const filterWrapper = document.getElementById('compare-filter-wrapper');

      const simPct = typeof r.documentSimilarity === 'number' ? r.documentSimilarity : 0;
      if (simValEl) simValEl.textContent = `${simPct}%`;

      if (data.status === 'COMPARISON_UNAVAILABLE' || r.status === 'COMPARISON_UNAVAILABLE' || data.status === 'INSUFFICIENT_SOURCE' || r.status === 'INSUFFICIENT_SOURCE') {
        if (simValEl) simValEl.textContent = '--';
        if (simStatusText) {
          simStatusText.style.display = 'block';
          simStatusText.textContent = 'Unable to compare these documents. We could not extract usable text from one or both documents.';
        }
        if (filterWrapper) filterWrapper.style.display = 'none';
        window.allCompareDifferences = [];
        const container = document.getElementById('differences-cards-container');
        if (container) {
          container.innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.9rem; background: #f8fafc; border: 1px solid var(--border-color); padding: 2rem 1.5rem; border-radius: 2px; text-align: center;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 1rem; margin-bottom: 0.35rem;">Unable to compare these documents</div>
              <div>We could not extract usable text from one or both documents.</div>
            </div>
          `;
        }
        showToast('We could not extract usable text from one or both documents.', 'warning');
        return;
      }

      const diffs = r.differences || [];
      window.allCompareDifferences = diffs;

      if (simPct === 0 || diffs.length === 0) {
        if (simStatusText) {
          simStatusText.style.display = 'block';
          simStatusText.textContent = 'No similarity found.';
        }
        if (filterWrapper) filterWrapper.style.display = 'none';
        const container = document.getElementById('differences-cards-container');
        if (container) {
          container.innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.9rem; background: #f8fafc; border: 1px solid var(--border-color); padding: 2rem 1.5rem; border-radius: 2px; text-align: center;">
              <div style="font-weight: 700; color: var(--text-main); font-size: 1rem; margin-bottom: 0.35rem;">No similarity found</div>
              <div>The selected documents do not contain matching content.</div>
            </div>
          `;
        }
      } else {
        if (simStatusText) {
          simStatusText.style.display = 'none';
          simStatusText.textContent = '';
        }
        if (filterWrapper) filterWrapper.style.display = 'flex';

        const filterSelect = document.getElementById('compare-filter-select');
        if (filterSelect) filterSelect.value = 'ALL';

        filterCompareResults('ALL');
      }

      showToast('Document comparison completed successfully.', 'success');
    } else {
      showToast('Unable to compare the selected documents. Please try again.', 'error');
    }
  } catch (err) {
    showToast('Unable to compare the selected documents. Please try again.', 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

function filterCompareResults(filterType = 'ALL') {
  const diffs = window.allCompareDifferences || [];
  let filtered = diffs;

  if (filterType !== 'ALL') {
    filtered = diffs.filter(d => d.status === filterType);
  }

  const filterSelect = document.getElementById('compare-filter-select');
  if (filterSelect && filterSelect.value !== filterType) {
    filterSelect.value = filterType;
  }

  renderDifferenceCards(filtered);
}

function renderDifferenceCards(differences) {
  const container = document.getElementById('differences-cards-container');
  if (!container) return;

  if (!differences || differences.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.875rem; background: #f8fafc; border: 1px solid var(--border-color); padding: 1.25rem; border-radius: 2px; text-align: center;">No comparison results match the selected filter.</div>';
    return;
  }

  container.innerHTML = '';
  differences.forEach(d => {
    let badgeBg = '#f4f4f4';
    let badgeColor = '#161616';
    let badgeLabel = d.status;

    if (d.status === 'UNCHANGED') {
      badgeBg = '#def8ee'; badgeColor = '#198038'; badgeLabel = '✓ SIMILAR';
    } else if (d.status === 'MODIFIED') {
      badgeBg = '#fff8e1'; badgeColor = '#b25900'; badgeLabel = '! MODIFIED';
    } else if (d.status === 'ADDED') {
      badgeBg = '#edf5ff'; badgeColor = '#0f62fe'; badgeLabel = '+ ADDED';
    } else if (d.status === 'REMOVED') {
      badgeBg = '#fff1f1'; badgeColor = '#da1e28'; badgeLabel = '- REMOVED';
    }

    const pageA = d.documentA && typeof d.documentA.pageNumber === 'number' ? d.documentA.pageNumber : 0;
    const pageB = d.documentB && typeof d.documentB.pageNumber === 'number' ? d.documentB.pageNumber : 0;

    const docAId = window.compareDocAId || '';
    const docBId = window.compareDocBId || '';

    const textA = d.documentA ? (d.documentA.text || 'Not present').replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Not present';
    const textB = d.documentB ? (d.documentB.text || 'Not present').replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Not present';

    const card = document.createElement('div');
    card.className = 'result-slide-up';
    card.style.cssText = 'background: #ffffff; padding: 1.15rem; border-radius: 2px; border: 1px solid var(--border-color); margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.03);';
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
        <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${d.topic || 'Content Comparison'}</span>
        <span style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 700; font-size: 0.75rem; padding: 0.25rem 0.65rem; border-radius: 2px; text-transform: uppercase;">${badgeLabel}</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem; margin-bottom: 0.75rem;">
        <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 2px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; color: var(--text-muted); font-size: 0.775rem; margin-bottom: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
              <span>DOCUMENT A</span>
              ${pageA > 0 ? `<span>Page ${pageA}</span>` : ''}
            </div>
            <div style="color: var(--text-main); line-height: 1.5; font-size: 0.85rem;">${textA}</div>
          </div>
          ${pageA > 0 && docAId ? `
            <div style="margin-top: 0.75rem; text-align: right;">
              <button class="btn btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; border-radius: 2px;" onclick="openPdfReader('${docAId}', ${pageA})">
                View Doc A (Page ${pageA}) →
              </button>
            </div>
          ` : ''}
        </div>
        <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 0.85rem; border-radius: 2px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; color: var(--text-muted); font-size: 0.775rem; margin-bottom: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
              <span>DOCUMENT B</span>
              ${pageB > 0 ? `<span>Page ${pageB}</span>` : ''}
            </div>
            <div style="color: var(--text-main); line-height: 1.5; font-size: 0.85rem;">${textB}</div>
          </div>
          ${pageB > 0 && docBId ? `
            <div style="margin-top: 0.75rem; text-align: right;">
              <button class="btn btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.75rem; border-radius: 2px;" onclick="openPdfReader('${docBId}', ${pageB})">
                View Doc B (Page ${pageB}) →
              </button>
            </div>
          ` : ''}
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
      const classEl = document.getElementById('doc-classification');
      const classification = classEl ? classEl.value : 'CONFIDENTIAL';
      const submitBtn = document.getElementById('upload-submit-btn');

      if (!fileInput.files[0]) return;

      setButtonLoading(submitBtn, true, 'Uploading document...');

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
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        const data = await res.json();
        if (data.success) {
          closeUploadModal();
          loadDashboardData();
          showToast('PDF document uploaded and indexed successfully!', 'success');

          if (data.dateSuggestions && data.dateSuggestions.length > 0) {
            openPdfSuggestionModal(data.dateSuggestions[0]);
          }
        } else {
          showToast('Upload failed: ' + formatErrorMessage(data), 'error');
        }
      } catch (err) {
        showToast('Upload error: ' + err.message, 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
});
