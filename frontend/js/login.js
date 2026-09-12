/**
 * PrivacyGuard AI - Authentication & Gateway Access Controller
 */

const API_BASE_URL = 'https://privacyguard-backend-ipou.onrender.com/api';

function showAlert(message, type = 'danger') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.className = `alert-banner ${type}`;
  box.textContent = message;
  box.style.display = 'block';
}

function switchAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  const loginBtn = document.getElementById('tab-btn-login');
  const regBtn = document.getElementById('tab-btn-register');
  const box = document.getElementById('alert-box');

  if (box) box.style.display = 'none';

  if (mode === 'register') {
    if (loginForm) loginForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    loginBtn.classList.remove('active');
    regBtn.classList.add('active');
  } else if (mode === 'forgot') {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'block';
    loginBtn.classList.remove('active');
    regBtn.classList.remove('active');
  } else {
    if (registerForm) registerForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    regBtn.classList.remove('active');
    loginBtn.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Check if user already authenticated with valid token
  const existingToken = localStorage.getItem('token');
  if (existingToken) {
    window.location.href = 'index.html';
    return;
  }

  // Handle Login Submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      showAlert('Authenticating with Express Gateway...', 'success');

      try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          showAlert('Authentication successful! Launching console...', 'success');
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 400);
        } else {
          showAlert(data.error || 'Invalid email or password', 'danger');
        }
      } catch (err) {
        showAlert('Connection error: Gateway server is unreachable.', 'danger');
      }
    });
  }

  // Handle Registration Submission
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;

      showAlert('Creating user account...', 'success');

      try {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          showAlert('Account created successfully! Launching console...', 'success');
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 400);
        } else {
          showAlert(data.error || 'Registration failed', 'danger');
        }
      } catch (err) {
        showAlert('Connection error: Gateway server is unreachable.', 'danger');
      }
    });
  }

  // Handle Forgot Password Submission
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value;
      const submitBtn = document.getElementById('forgot-submit-btn');

      showAlert('Sending password reset email via EmailJS...', 'success');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (data.success) {
          showAlert('Reset link dispatched! Please check your email inbox.', 'success');
          document.getElementById('forgot-email').value = '';
        } else {
          showAlert(data.error || 'Failed to request password reset', 'danger');
        }
      } catch (err) {
        showAlert('Connection error: Gateway server is unreachable.', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});

