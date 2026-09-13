const axios = require('axios');

/**
 * Format Date objects as "31 December 2026" or "20 September 2026"
 */
function formatDate(dateInput) {
  if (!dateInput) return 'N/A';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Check if EmailJS environment variables are configured
 */
function isEmailJSConfigured() {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  return Boolean(serviceId && templateId && publicKey);
}

/**
 * Validate EmailJS configuration on server startup (without exposing private keys)
 */
function verifyEmailJSConfig() {
  if (!isEmailJSConfigured()) {
    console.log('[EMAILJS] Configuration incomplete. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY in .env');
    return false;
  }
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  console.log(`[EMAILJS] Configuration loaded (Service: ${serviceId}, Template: ${templateId})`);
  return true;
}

/**
 * Send reminder email using EmailJS REST API (POST https://api.emailjs.com/api/v1.0/email/send)
 * 
 * @param {Object} reminder - Reminder Mongoose object or plain JSON
 * @param {Object} user - Authenticated user object containing email
 */
async function sendReminderEmail(reminder, user) {
  if (!isEmailJSConfigured()) {
    throw new Error('EmailJS service is not configured. Check EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY in .env');
  }

  if (!user || (!user.email && !user.userEmail)) {
    throw new Error('User email is missing.');
  }

  const recipientEmail = user.email || user.userEmail;
  const userName = user.name || 'User';
  const formattedEventDate = formatDate(reminder.eventDate);
  const isAutomatic = reminder.type === 'AUTOMATIC';
  const docName = reminder.documentName || 'document.pdf';

  const subject = isAutomatic
    ? `Reminder: ${reminder.title} - ${docName}`
    : `Reminder: ${reminder.title}`;

  const messageBody = isAutomatic
    ? `Hello ${userName},

This is a smart reminder from ReadDocX.

Reminder: ${reminder.title}
Document: ${docName}
Event Date: ${formattedEventDate}
Source Page: Page ${reminder.pageNumber || '1'}

Evidence:
"${reminder.evidence || 'N/A'}"

Please review your document if necessary.

Regards,
ReadDocX`
    : `Hello ${userName},

This is a reminder from ReadDocX.

Reminder: ${reminder.title}
Date: ${formattedEventDate}
${reminder.eventTime ? `Time: ${reminder.eventTime}\n` : ''}${reminder.description ? `Description: ${reminder.description}\n` : ''}
Regards,
ReadDocX`;

  // Build EmailJS REST API payload
  const payload = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    ...(process.env.EMAILJS_PRIVATE_KEY ? { accessToken: process.env.EMAILJS_PRIVATE_KEY } : {}),
    template_params: {
      to_email: recipientEmail,
      to_name: userName,
      subject: subject,
      reminder_title: reminder.title,
      event_date: formattedEventDate,
      event_time: reminder.eventTime || 'N/A',
      description: reminder.description || 'N/A',
      reminder_type: reminder.type,
      document_name: isAutomatic ? docName : 'N/A',
      page_number: reminder.pageNumber ? String(reminder.pageNumber) : 'N/A',
      evidence: reminder.evidence || 'N/A',
      date: formattedEventDate,
      message: messageBody,
      requested_by: userName,
      request_type: reminder.type,
      approval_link: 'http://localhost:5000'
    }
  };

  try {
    console.log(`[EMAILJS] Sending reminder email for '${reminder.title}' to ${recipientEmail}...`);
    
    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 12000
    });

    if (response.status === 200 || response.data === 'OK') {
      console.log(`[EMAILJS] Email sent successfully for reminder '${reminder.title}' to ${recipientEmail}`);
      return {
        success: true,
        recipient: recipientEmail,
        status: 200
      };
    } else {
      throw new Error(`EmailJS API returned non-200 response: ${response.status} ${response.data}`);
    }
  } catch (err) {
    const errorDetail = err.response && err.response.data
      ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
      : err.message;
      
    const safeError = `EmailJS API dispatch failed: ${errorDetail}`;
    console.error(`[EMAILJS] Email sending failed for reminder ID ${reminder._id}: ${safeError}`);
    
    // Throw error so caller marks emailStatus = FAILED
    throw new Error(safeError);
  }
}

/**
 * Send password reset email using EmailJS REST API (Template: template_0qtz5mv)
 * 
 * @param {Object} user - User object containing name and email
 * @param {String} resetLink - Full reset URL with token
 */
async function sendPasswordResetEmail(user, resetLink) {
  if (!isEmailJSConfigured()) {
    throw new Error('EmailJS service is not configured. Check EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY in .env');
  }

  if (!user || !user.email) {
    throw new Error('User email is missing.');
  }

  const recipientEmail = user.email;
  const userName = user.name || 'User';
  const formattedDate = formatDate(new Date());

  const templateId = process.env.EMAILJS_RESET_TEMPLATE_ID || 'template_0qtz5mv';
  const serviceId = process.env.EMAILJS_SERVICE_ID || 'service_zfsc4r1';
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || 'W1LoyGjmHwjxi4kNs';

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    ...(process.env.EMAILJS_PRIVATE_KEY ? { accessToken: process.env.EMAILJS_PRIVATE_KEY } : {}),
    template_params: {
      to_email: recipientEmail,
      user_email: recipientEmail,
      email: recipientEmail,
      recipient_email: recipientEmail,
      email_to: recipientEmail,
      send_to: recipientEmail,
      to_name: userName,
      user_name: userName,
      name: userName,
      reset_link: resetLink,
      link: resetLink,
      url: resetLink,
      reset_url: resetLink,
      subject: 'Password Reset Request - ReadDocX',
      date: formattedDate,
      requested_by: userName,
      request_type: 'PASSWORD_RESET',
      message: `Password reset request received for ${recipientEmail}. Click link to reset: ${resetLink}`
    }
  };

  try {
    console.log(`[EMAILJS] Sending password reset email to ${recipientEmail} via template '${templateId}'...`);
    
    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000
    });

    if (response.status === 200 || response.data === 'OK') {
      console.log(`[EMAILJS] Password reset email sent successfully to ${recipientEmail}`);
      return {
        success: true,
        recipient: recipientEmail,
        status: 200
      };
    } else {
      throw new Error(`EmailJS API returned non-200 response: ${response.status} ${response.data}`);
    }
  } catch (err) {
    const errorDetail = err.response && err.response.data
      ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
      : err.message;
      
    const safeError = `EmailJS password reset API dispatch failed: ${errorDetail}`;
    console.error(`[EMAILJS] Password reset email sending failed: ${safeError}`);
    throw new Error(safeError);
  }
}

module.exports = {
  sendReminderEmail,
  sendPasswordResetEmail,
  isEmailJSConfigured,
  verifyEmailJSConfig,
  formatDate
};
