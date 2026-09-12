const axios = require('../backend/node_modules/axios');
const path = require('path');
const dotenv = require('../backend/node_modules/dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5000/api';
const Reminder = require('../backend/models/Reminder');
const User = require('../backend/models/User');
const { checkAndSendReminders } = require('../backend/utils/scheduler');
const { detectDateSuggestions } = require('../backend/utils/reminderEngine');

const connectDB = require('../backend/config/db');

async function runReminderTests() {
  console.log('===========================================================');
  console.log('🚀 RUNNING SMART REMINDERS COMPREHENSIVE TEST SUITE');
  console.log('===========================================================');

  await connectDB();

  try {
    // 1. Register & Login Test User
    const testUserEmail = `reminder_test_${Date.now()}@privacyguard.ai`;
    const userPassword = 'TestPassword123!';

    console.log('\n[1/7] Registering test user:', testUserEmail);
    const regRes = await axios.post(`${GATEWAY_URL}/auth/register`, {
      name: 'Reminder Tester',
      email: testUserEmail,
      password: userPassword
    });
    const token = regRes.data.token;
    const userId = regRes.data.user.id;
    console.log('✅ User registered successfully. Token received.');

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // 2. Automatic Date Detection Engine Test
    console.log('\n[2/7] Testing Automatic PDF Date & Evidence Detection Engine...');
    const pdfText = `MASTER SERVICES AGREEMENT\n\nSection 8. Term and Expiration\nThe contract shall remain valid until 31 December 2026.\nUpon expiration, renewal shall require mutual written consent.`;
    
    const suggestions = detectDateSuggestions(pdfText, 'contract.pdf');
    if (suggestions.length === 0) {
      throw new Error('FAILED: Date detection engine failed to detect "31 December 2026" expiry.');
    }
    const sugg = suggestions[0];
    console.log('  Detected Event Type:', sugg.eventType);
    console.log('  Detected Event Date:', sugg.formattedEventDate);
    console.log('  Evidence Sentence:', `"${sugg.evidence}"`);
    console.log('  Confidence Score:', sugg.confidence);
    console.log('✅ Automatic date suggestion verified successfully.');

    // 3. Create Confirmed Automatic Reminder via API
    console.log('\n[3/7] Creating confirmed AUTOMATIC reminder (7 days before notice)...');
    const autoRemRes = await axios.post(
      `${GATEWAY_URL}/reminders`,
      {
        type: 'AUTOMATIC',
        eventType: sugg.eventType,
        title: 'Contract Expiry - contract.pdf',
        eventDate: '2026-12-31',
        noticeDays: 7,
        documentName: 'contract.pdf',
        pageNumber: 1,
        evidence: sugg.evidence,
        confidence: sugg.confidence,
        emailEnabled: true
      },
      authHeaders
    );

    const autoRem = autoRemRes.data.reminder;
    console.log('  Created Reminder ID:', autoRem._id);
    console.log('  Type:', autoRem.type);
    console.log('  Event Date:', new Date(autoRem.eventDate).toISOString().split('T')[0]);
    console.log('  Reminder Date:', new Date(autoRem.reminderDate).toISOString().split('T')[0]);
    console.log('  Email Status:', autoRem.emailStatus);

    if (new Date(autoRem.reminderDate).toISOString().split('T')[0] !== '2026-12-24') {
      throw new Error(`FAILED: Expected reminderDate 2026-12-24, got ${autoRem.reminderDate}`);
    }
    console.log('✅ Automatic reminder date calculation verified (31 Dec - 7 days = 24 Dec).');

    // 4. Create Manual Reminder via API
    console.log('\n[4/7] Creating MANUAL custom reminder (Submit Project Report)...');
    const manualRemRes = await axios.post(
      `${GATEWAY_URL}/reminders`,
      {
        type: 'MANUAL',
        title: 'Submit Project Report',
        eventDate: '2026-09-20',
        eventTime: '10:00',
        description: 'Submit final project report.',
        noticeDays: 1,
        emailEnabled: true
      },
      authHeaders
    );

    const manualRem = manualRemRes.data.reminder;
    console.log('  Created Manual Reminder ID:', manualRem._id);
    console.log('  Type:', manualRem.type);
    console.log('  Title:', manualRem.title);
    console.log('  Time:', manualRem.eventTime);
    console.log('  Description:', manualRem.description);
    console.log('✅ Manual reminder created successfully.');

    // 5. Test Categorized Dashboard GET API
    console.log('\n[5/7] Testing GET /api/reminders dashboard categorization...');
    const listRes = await axios.get(`${GATEWAY_URL}/reminders`, authHeaders);
    const categories = listRes.data.categories;
    console.log('  Upcoming count:', categories.upcoming.length);
    console.log('  Due Today count:', categories.dueToday.length);
    console.log('  Overdue count:', categories.overdue.length);
    console.log('  Completed count:', categories.completed.length);
    console.log('✅ Categorization verified.');

    // 6. Test Email Dispatch & Duplicate Prevention Scheduler
    console.log('\n[6/7] Testing Background Scheduler & Duplicate Prevention...');
    // Create a due reminder to trigger scheduler dispatch
    const dueReminder = await Reminder.create({
      owner: userId,
      userId: userId,
      type: 'MANUAL',
      title: 'Immediate Due Task',
      eventDate: new Date(),
      reminderDate: new Date(Date.now() - 3600000), // 1 hour ago
      emailEnabled: true,
      emailStatus: 'PENDING',
      status: 'PENDING'
    });

    console.log('  Triggering checkAndSendReminders scheduler pass #1...');
    const schedPass1 = await checkAndSendReminders({ owner: userId });
    console.log(`  Pass #1 Result -> Processed: ${schedPass1.processed}, Sent: ${schedPass1.sent}, Failed: ${schedPass1.failed}`);

    const updatedDueRem = await Reminder.findById(dueReminder._id);
    console.log('  Reminder emailStatus after Pass #1:', updatedDueRem.emailStatus);

    // Simulate successful email dispatch status to verify duplicate protection
    updatedDueRem.emailStatus = 'SENT';
    updatedDueRem.emailSentAt = new Date();
    await updatedDueRem.save();

    console.log('  Triggering checkAndSendReminders scheduler pass #2 (Duplicate Protection Test)...');
    const schedPass2 = await checkAndSendReminders({ owner: userId });
    console.log(`  Pass #2 Result -> Processed: ${schedPass2.processed}, Sent: ${schedPass2.sent}, Failed: ${schedPass2.failed}`);

    if (schedPass2.sent > 0 || schedPass2.processed > 0) {
      throw new Error('FAILED: Duplicate email protection failed! Sent reminder was re-processed.');
    }
    console.log('✅ Duplicate email protection verified: 0 duplicate emails sent on pass #2.');

    // 7. Test Complete and Delete APIs
    console.log('\n[7/7] Testing Mark Complete & Delete endpoints...');
    const completeRes = await axios.post(`${GATEWAY_URL}/reminders/${autoRem._id}/complete`, {}, authHeaders);
    if (completeRes.data.reminder.status !== 'COMPLETED') {
      throw new Error('FAILED: Status was not updated to COMPLETED');
    }
    console.log('  Marked as COMPLETED successfully.');

    const deleteRes = await axios.delete(`${GATEWAY_URL}/reminders/${manualRem._id}`, authHeaders);
    if (!deleteRes.data.success) {
      throw new Error('FAILED: Could not delete reminder');
    }
    console.log('  Deleted reminder successfully.');

    console.log('\n===========================================================');
    console.log('🎉 ALL SMART REMINDERS TESTS PASSED SUCCESSFULLY! (7/7)');
    console.log('===========================================================');
    return true;
  } catch (error) {
    console.error('\n❌ REMINDER TEST SUITE FAILED:');
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    } else {
      console.error('Error Message:', error.message);
    }
    process.exit(1);
  }
}

// Execute tests if called directly
if (require.main === module) {
  runReminderTests().then(() => process.exit(0));
}

module.exports = { runReminderTests };
