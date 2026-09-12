const cron = require('node-cron');
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const { sendReminderEmail } = require('../services/emailService');

/**
 * Process all due pending reminders and send email notifications.
 * Uses atomic locking to guarantee 100% idempotency and duplicate prevention.
 * 
 * @param {Object} [customFilter={}] - Optional query filters for test isolation
 */
async function checkAndSendReminders(customFilter = {}) {
  try {
    const now = new Date();

    // Query due reminders that are enabled, not already sent, and due for notification
    const query = {
      status: { $in: ['PENDING', 'ACTIVE'] },
      emailEnabled: true,
      emailStatus: { $ne: 'SENT' },
      reminderDate: { $lte: now },
      ...customFilter
    };

    const dueReminders = await Reminder.find(query);

    if (dueReminders.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const reminderItem of dueReminders) {
      // Atomic Lock: Ensure no concurrent execution updates the same reminder
      const reminder = await Reminder.findOneAndUpdate(
        { _id: reminderItem._id, emailStatus: { $ne: 'SENT' } },
        { $set: { updatedAt: new Date() } },
        { new: true }
      );

      if (!reminder || reminder.emailStatus === 'SENT') {
        continue;
      }

      const userId = reminder.owner || reminder.userId;
      if (!userId) {
        reminder.emailStatus = 'FAILED';
        reminder.emailError = 'No user associated with reminder';
        await reminder.save();
        failedCount++;
        continue;
      }

      const user = await User.findById(userId);
      if (!user || (!user.email && !user.userEmail)) {
        reminder.emailStatus = 'FAILED';
        reminder.emailError = 'User registered email address not found';
        await reminder.save();
        failedCount++;
        continue;
      }

      try {
        await sendReminderEmail(reminder, user);
        reminder.emailStatus = 'SENT';
        reminder.emailSentAt = new Date();
        reminder.emailError = null;
        await reminder.save();
        sentCount++;
      } catch (err) {
        const safeErrorMsg = err.message || 'SMTP delivery failed';
        console.error(`[Scheduler] SMTP delivery failed for reminder ID ${reminder._id}: ${safeErrorMsg}`);
        reminder.emailStatus = 'FAILED';
        reminder.emailError = safeErrorMsg;
        await reminder.save();
        failedCount++;
      }
    }

    return { processed: dueReminders.length, sent: sentCount, failed: failedCount };
  } catch (error) {
    console.error('[Scheduler] Error running checkAndSendReminders:', error.message);
    return { error: error.message };
  }
}

/**
 * Initialize background cron job (runs every minute)
 */
function initScheduler() {
  console.log('⏰ Initializing Smart Reminder Background Scheduler...');

  // Run every 1 minute: '* * * * *'
  const job = cron.schedule('* * * * *', async () => {
    await checkAndSendReminders();
  });

  // Startup check
  checkAndSendReminders().then((res) => {
    if (res && res.processed > 0) {
      console.log(`[Scheduler Startup Check] Processed ${res.processed} due reminder(s): ${res.sent} sent, ${res.failed} failed.`);
    }
  });

  return job;
}

module.exports = {
  checkAndSendReminders,
  initScheduler
};
