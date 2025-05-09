const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const axios = require('axios');

const applySecurity = require('./middleware/securityHeaders');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs/access.log'), { flags: 'a' });

applySecurity(app);
app.use(rateLimiter);
app.use(cors({ origin: ['http://localhost:4200'] }));
app.use(express.json());
app.use(morgan('combined', { stream: accessLogStream }));

app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use('/idp/auth', require('./routes/auth'));
app.use('/idp/msg', require('./routes/inmarsat'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Secure API proxy running on http://localhost:${PORT}`);
});
