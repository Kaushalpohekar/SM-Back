const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');

const devicesPath = path.join(__dirname, '../data/devices.json');

// Utility: Ensure file exists with default structure
function ensureDevicesFileExists() {
  if (!fs.existsSync(devicesPath)) {
    fs.writeFileSync(devicesPath, JSON.stringify([], null, 2));
    console.log('Created devices.json');
  }
}

// Utility: Load devices safely
function loadDevices() {
  ensureDevicesFileExists();
  const data = fs.readFileSync(devicesPath, 'utf-8');
  return JSON.parse(data);
}

// Utility: Save devices safely
function saveDevices(devices) {
  fs.writeFileSync(devicesPath, JSON.stringify(devices, null, 2));
}

// ✅ GET /idp/devices - Get all devices
router.get('/', authenticateUser, (req, res) => {
  try {
    const devices = loadDevices();
    res.json(devices);
  } catch (error) {
    console.error('Error loading devices:', error.message);
    res.status(500).json({ message: 'Failed to fetch devices.' });
  }
});

// ✅ POST /idp/devices - Add new device
router.post('/', authenticateUser, (req, res) => {
  try {
    const { id, name } = req.body;
    if (!id || !name) {
      return res.status(400).json({ message: 'id and name are required.' });
    }

    const devices = loadDevices();
    if (devices.find(d => d.id === id)) {
      return res.status(409).json({ message: 'Device already exists.' });
    }

    devices.push({ id, name });
    saveDevices(devices);
    res.status(201).json({ message: 'Device added successfully.' });
  } catch (error) {
    console.error('Error adding device:', error.message);
    res.status(500).json({ message: 'Failed to add device.' });
  }
});

// ✅ PUT /idp/devices/:id - Update device name
router.put('/:id', authenticateUser, (req, res) => {
  try {
    const deviceId = req.params.id;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'New name is required.' });
    }

    const devices = loadDevices();
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    device.name = name;
    saveDevices(devices);
    res.json({ message: 'Device updated successfully.' });
  } catch (error) {
    console.error('Error updating device:', error.message);
    res.status(500).json({ message: 'Failed to update device.' });
  }
});

// ✅ DELETE /idp/devices/:id - Remove device
router.delete('/:id', authenticateUser, (req, res) => {
  try {
    const deviceId = req.params.id;

    const devices = loadDevices();
    const index = devices.findIndex(d => d.id === deviceId);

    if (index === -1) {
      return res.status(404).json({ message: 'Device not found.' });
    }

    devices.splice(index, 1);
    saveDevices(devices);
    res.json({ message: 'Device deleted successfully.' });
  } catch (error) {
    console.error('Error deleting device:', error.message);
    res.status(500).json({ message: 'Failed to delete device.' });
  }
});

module.exports = router;
