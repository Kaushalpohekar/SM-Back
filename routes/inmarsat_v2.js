const express = require('express');
const router = express.Router();
const {  getInmarsatErrorList, getMobileOriginatedMessages, getMobileTerminatedStatus, sendMobileTerminatedMessage, getChatMessages } = require('../services/inmarsatService_v2');
const { authenticateUser } = require('../middleware/auth');

router.get('/errors', /* authenticateUser, */ async (req, res) => {
  try {
    const errorList = await getInmarsatErrorList();
    res.status(200).json(errorList);
  } catch (error) {
    console.error('❌ /errors route failed:', error.message);
    res.status(500).json({ message: 'Failed to fetch Inmarsat error list.' });
  }
});

router.get('/messages', async (req, res) => {
  const { startTime, endTime, includeRawPayload } = req.query;

  if (!startTime || !endTime) {
    return res.status(400).json({ error: 'startTime and endTime are required.' });
  }

  try {
    const data = await getMobileOriginatedMessages({
      startTime,
      endTime,
      includeRawPayload: includeRawPayload === 'true'
    });

    return res.status(200).json({
      status: 200,
      success: true,
      count: data.length,
      data
    });

  } catch (error) {
    console.error('❌ API Route Error:', error.message);
    return res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to fetch mobile-originated messages.'
    });
  }
});

router.get('/messages/mobile-terminated/status', async (req, res) => {
  const { startTime } = req.query;

  if (!startTime) {
    return res.status(400).json({ error: 'startTime is required.' });
  }

  try {
    const data = await getMobileTerminatedStatus(startTime);

    return res.status(200).json({
      status: 200,
      success: true,
      count: data.length,
      data
    });

  } catch (err) {
    res.status(500).json({
      status: 500,
      success: false,
      message: 'Failed to fetch mobile-terminated status.',
      error: err.message
    });
  }
});

router.post('/send-mt', authenticateUser, async (req, res) => {
  const { destinationId, userMessageId, payloadText } = req.body;
  
  if (!destinationId || !payloadText) {
    return res.status(400).json({ error: 'destinationId and payloadText are required.' });
  }

  try {
    const message = await sendMobileTerminatedMessage(destinationId, userMessageId, payloadText);

    if (message?.messageId) {
      return res.status(200).json({
        success: true,
        message: 'Message sent and saved to DB.',
        data: message
      });
    } else {
      return res.status(502).json({
        success: false,
        error: 'Inmarsat API returned invalid response.'
      });
    }
  } catch (err) {
    console.error('❌ Error sending MT message:', err.message);
    return res.status(500).json({ error: 'Failed to send or save message', details: err.message });
  }
});

router.post('/chat', authenticateUser, async (req, res) => {
  try {
    const { start_utc, end_utc } = req.body;

    if (!start_utc || !end_utc) {
      return res.status(400).json({ message: 'start_utc and end_utc are required.' });
    }

    const mergedData = await getChatMessages(start_utc, end_utc);
    res.json(mergedData);
  } catch (error) {
    console.error('❌ Inmarsat Chat API Error:', error.message);
    res.status(500).json({ message: 'Failed to fetch chat messages from database.' });
  }
});

module.exports = router;