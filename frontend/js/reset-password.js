/**
 * PrivacyGuard AI - Reset Password Handler
 */

const API_BASE_URL = 'https://privacyguard-backend-ipou.onrender.com/api';

function showAlert(message, type = 'danger') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.className = `alert-banner ${type}`;
  box.textContent = message;
  box.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const loadingSpinner = document.getElementById('loading-spinner');
  const resetForm = document.getElementById('reset-password-form');
  const invalidActions = document.getElementById('invalid-token-actions');
  const emailBadge = document.getElementById('target-user-email');

  if (!token) {
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    showAlert('Invalid password reset link. Token parameter is missing.', 'danger');
    if (invalidActions) invalidActions.style.display = 'block';
    return;
  }

  // Verify reset token validity on backend
  try {
    const res = await fetch(`${API_BASE_URL}/auth/verify-reset-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    if (loadingSpinner) loadingSpinner.style.display = 'none';

    if (data.success && data.valid) {
      if (emailBadge) emailBadge.textContent = data.userEmail || 'User Account';
      if (resetForm) resetForm.style.display = 'block';
    } else {
      showAlert(data.error || 'Password reset link is invalid or has expired. Please request a new reset email.', 'danger');
      if (invalidActions) invalidActions.style.display = 'block';
    }
  } catch (err) {
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    showAlert('Connection error: Express Gateway server is unreachable.', 'danger');
    if (invalidActions) invalidActions.style.display = 'block';
  }

  // Handle Form Submission
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const submitBtn = document.getElementById('reset-submit-btn');

      if (newPassword !== confirmPassword) {
        showAlert('Passwords do not match. Please re-enter identical passwords.', 'danger');
        return;
      }

      if (newPassword.length < 6) {
        showAlert('Password must be at least 6 characters long.', 'danger');
        return;
      }

      showAlert('Updating password and invalidating token...', 'success');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword })
        });

        const data = await res.json();

        if (data.success) {
          showAlert('Password reset successful! Redirecting to Sign In...', 'success');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1500);
        } else {
          showAlert(data.error || 'Failed to reset password.', 'danger');
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (err) {
        showAlert('Connection error: Express Gateway server is unreachable.', 'danger');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
});
