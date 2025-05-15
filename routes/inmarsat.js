const express = require('express');
const router = express.Router();
const { getSomeData, getForwardData, getChatMessages, sendMobileTerminatedMessage } = require('../services/inmarsatService');
const { authenticateUser } = require('../middleware/auth');

router.post('/messages', authenticateUser, async (req, res, next) => {
    try {
        const { start_utc, end_utc } = req.body;

        if (!start_utc || !end_utc) {
            return res.status(400).json({ message: 'start_utc and end_utc are required.' });
        }

        const data = await getSomeData(start_utc, end_utc);
        res.json(data);
    } catch (error) {
        console.error('Inmarsat API Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch Inmarsat messages.' });
    }
});

router.post('/forward', authenticateUser, async (req, res) => {
    try {
        const { start_utc, end_utc } = req.body;

        if (!start_utc || !end_utc) {
            return res.status(400).json({ message: 'start_utc and end_utc are required.' });
        }

        const mergedData = await getForwardData(start_utc, end_utc);
        res.json(mergedData);
    } catch (error) {
        console.error('Inmarsat Forward API Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch forward messages.' });
    }
});

router.post('/chat', authenticateUser, async (req, res) => {
    try {
        const { start_utc, end_utc } = req.body;

        if (!start_utc || !end_utc) {
            return res.status(400).json({ message: 'start_utc and end_utc are required.' });
        }

        const destinationId = req.user.destinationId;
        const mergedData = await getChatMessages(start_utc, end_utc);

        const filtered = mergedData.filter(entry => entry.TerminalID === destinationId);
        res.json(filtered);
    } catch (error) {
        console.error('Inmarsat Forward API Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch forward messages.' });
    }
});

const getRandomByte = () => Math.floor(Math.random() * 256);

router.post('/send-mt', authenticateUser, async (req, res) => {
  try {
    const { DestinationID, message } = req.body;

    if (!DestinationID || !message) {
      return res.status(400).json({ message: 'DestinationID and message are required.' });
    }

    const SIN = getRandomByte();
    const MIN = getRandomByte();
    const messageBytes = Array.from(message).map(ch => ch.charCodeAt(0));
    const RawPayload = [SIN, MIN, ...messageBytes];

    const Payload = {
      Name: 'pingModem',
      SIN,
      MIN,
      Fields: []
    };

    const response = await sendMobileTerminatedMessage({
      DestinationID,
      RawPayload,
      Payload
    });

    res.json({
      message: 'MT message sent successfully',
      response
    });
  } catch (error) {
    console.error('API /send-mt Error:', error.message);
    res.status(500).json({ message: 'Failed to send MT message' });
  }
});


module.exports = router;
