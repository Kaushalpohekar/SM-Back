const express = require('express');
const router = express.Router();
const { getSomeData, getForwardData } = require('../services/inmarsatService');
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

module.exports = router;
