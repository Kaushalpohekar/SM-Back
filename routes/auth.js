const express = require('express');
const router = express.Router();
const validator = require('validator');
const auth = require('../controllers/auth');
const { authenticateUser } = require('../middleware/auth');

router.post('/register', async (req, res, next) => {
  try {
    const { first_name, last_name, email, password, role, destination_id } = req.body;

    if (!first_name || !last_name || !email || !password || !role || !destination_id)
      return res.status(400).json({ message: 'All fields are required.' });

    if (!validator.isEmail(email))
      return res.status(400).json({ message: 'Invalid email format.' });

    if (!validator.isStrongPassword(password, { minLength: 8, minSymbols: 0 }))
      return res.status(400).json({ message: 'Weak password.' });

    req.body.email = validator.normalizeEmail(email);
    req.body.first_name = validator.escape(first_name.trim());
    req.body.last_name = validator.escape(last_name.trim());
    req.body.role = validator.escape(role.trim());
    req.body.destination_id = validator.escape(destination_id.trim());

    await auth.register(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    if (!validator.isEmail(email))
      return res.status(400).json({ message: 'Invalid email format.' });

    req.body.email = validator.normalizeEmail(email);

    await auth.login(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/user', authenticateUser, auth.getUserDetails);
router.get('/getUser', authenticateUser, auth.getUser);

router.put('/user/:id', async (req, res, next) => {
  try {
    const fields = ['first_name', 'last_name', 'email', 'role', 'destination_id'];

    for (const field of fields) {
      if (req.body[field]) {
        req.body[field] = validator.escape(req.body[field].toString().trim());
      }
    }

    if (req.body.email && !validator.isEmail(req.body.email))
      return res.status(400).json({ message: 'Invalid email format.' });

    await auth.updateUser(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;