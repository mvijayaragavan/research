const express = require('express');
const router = express.Router();
const {
  getReminders,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder,
  completeReminder,
  testEmail
} = require('../controllers/reminderController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getReminders)
  .post(createReminder);

router.route('/:id')
  .get(getReminderById)
  .put(updateReminder)
  .delete(deleteReminder);

router.post('/:id/complete', completeReminder);
router.post('/:id/test-email', testEmail);

module.exports = router;
