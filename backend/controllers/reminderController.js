const Reminder = require('../models/Reminder');
const User = require('../models/User');
const { sendReminderEmail, isEmailConfigured } = require('../services/emailService');

/**
 * Helper to calculate reminderDate given eventDate and noticeDays
 */
function calculateReminderDate(eventDateStr, noticeDays = 7) {
  const eventDate = new Date(eventDateStr);
  if (isNaN(eventDate.getTime())) {
    throw new Error('Invalid eventDate format.');
  }
  const reminderDate = new Date(eventDate);
  reminderDate.setDate(reminderDate.getDate() - parseInt(noticeDays, 10));
  return { eventDate, reminderDate };
}

/**
 * @desc    Get reminders for authenticated user categorized into sections
 * @route   GET /api/reminders
 * @access  Private
 */
exports.getReminders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const reminders = await Reminder.find({
      $or: [{ owner: userId }, { userId: userId }]
    }).sort({ eventDate: 1 });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const upcoming = [];
    const dueToday = [];
    const overdue = [];
    const completed = [];

    reminders.forEach((rem) => {
      if (rem.status === 'COMPLETED' || rem.status === 'DISMISSED') {
        completed.push(rem);
      } else {
        const eDateStr = new Date(rem.eventDate).toISOString().split('T')[0];
        if (eDateStr === todayStr) {
          dueToday.push(rem);
        } else if (new Date(rem.eventDate) < new Date(todayStr)) {
          overdue.push(rem);
        } else {
          upcoming.push(rem);
        }
      }
    });

    res.status(200).json({
      success: true,
      count: reminders.length,
      categories: {
        upcoming,
        dueToday,
        overdue,
        completed
      },
      reminders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single reminder by ID
 * @route   GET /api/reminders/:id
 * @access  Private
 */
exports.getReminderById = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user.id }, { userId: req.user.id }]
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    res.status(200).json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new reminder (Manual or Automatic confirmation)
 * @route   POST /api/reminders
 * @access  Private
 */
exports.createReminder = async (req, res, next) => {
  try {
    const {
      title,
      eventDate,
      eventTime,
      description,
      type = 'MANUAL',
      eventType = 'CUSTOM',
      noticeDays = 7,
      documentId,
      documentName,
      pageNumber,
      evidence,
      confidence,
      emailEnabled = true
    } = req.body;

    if (!title || !eventDate) {
      return res.status(400).json({
        success: false,
        error: 'Title and eventDate are required'
      });
    }

    const { eventDate: eDate, reminderDate: rDate } = calculateReminderDate(eventDate, noticeDays);

    const reminder = await Reminder.create({
      owner: req.user.id,
      userId: req.user.id,
      documentId: documentId || null,
      documentName: documentName || null,
      type: type.toUpperCase() === 'AUTOMATIC' ? 'AUTOMATIC' : 'MANUAL',
      eventType: eventType.toUpperCase(),
      title,
      eventDate: eDate,
      eventTime: eventTime || null,
      description: description || null,
      noticeDays: parseInt(noticeDays, 10),
      reminderDate: rDate,
      pageNumber: pageNumber || null,
      evidence: evidence || null,
      confidence: confidence || null,
      emailEnabled: Boolean(emailEnabled),
      emailStatus: 'PENDING',
      emailSentAt: null,
      emailError: null,
      status: 'PENDING'
    });

    res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      reminder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update reminder
 * @route   PUT /api/reminders/:id
 * @access  Private
 */
exports.updateReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user.id }, { userId: req.user.id }]
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const { title, eventDate, eventTime, description, noticeDays, emailEnabled } = req.body;

    if (title !== undefined) reminder.title = title;
    if (eventTime !== undefined) reminder.eventTime = eventTime;
    if (description !== undefined) reminder.description = description;
    if (emailEnabled !== undefined) reminder.emailEnabled = Boolean(emailEnabled);

    let dateChanged = false;
    if (eventDate !== undefined || noticeDays !== undefined) {
      const targetEventDate = eventDate || reminder.eventDate;
      const targetNoticeDays = noticeDays !== undefined ? noticeDays : reminder.noticeDays;
      const { eventDate: eDate, reminderDate: rDate } = calculateReminderDate(targetEventDate, targetNoticeDays);

      reminder.eventDate = eDate;
      reminder.noticeDays = targetNoticeDays;
      reminder.reminderDate = rDate;

      dateChanged = true;
    }

    if (dateChanged && reminder.emailStatus === 'SENT') {
      reminder.emailStatus = 'PENDING';
      reminder.emailSentAt = null;
      reminder.emailError = null;
    }

    await reminder.save();

    res.status(200).json({
      success: true,
      message: 'Reminder updated successfully',
      reminder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete reminder
 * @route   DELETE /api/reminders/:id
 * @access  Private
 */
exports.deleteReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      $or: [{ owner: req.user.id }, { userId: req.user.id }]
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Reminder deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark reminder as complete
 * @route   POST /api/reminders/:id/complete
 * @access  Private
 */
exports.completeReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user.id }, { userId: req.user.id }]
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    reminder.status = 'COMPLETED';
    await reminder.save();

    res.status(200).json({
      success: true,
      message: 'Reminder marked as completed',
      reminder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Test trigger immediate email dispatch for reminder
 * @route   POST /api/reminders/:id/test-email
 * @access  Private
 */
exports.testEmail = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      $or: [{ owner: req.user.id }, { userId: req.user.id }]
    });

    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user || (!user.email && !user.userEmail)) {
      return res.status(400).json({
        success: false,
        error: 'User email is not available.'
      });
    }

    try {
      const result = await sendReminderEmail(reminder, user);

      reminder.emailStatus = 'SENT';
      reminder.emailSentAt = new Date();
      reminder.emailError = null;
      await reminder.save();

      res.status(200).json({
        success: true,
        emailStatus: 'SENT',
        message: 'Test email sent successfully',
        recipient: result.recipient
      });
    } catch (sendErr) {
      const safeErrorMsg = sendErr.message || 'EmailJS API delivery failed';
      reminder.emailStatus = 'FAILED';
      reminder.emailError = safeErrorMsg;
      await reminder.save();

      res.status(500).json({
        success: false,
        emailStatus: 'FAILED',
        message: 'Unable to send test email',
        error: safeErrorMsg
      });
    }
  } catch (error) {
    next(error);
  }
};
