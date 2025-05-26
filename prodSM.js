const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const https = require('https');

require('dotenv').config();
const axios = require('axios');

const applySecurity = require('./middleware/securityHeaders');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs/access.log'), { flags: 'a' });

const privateKey = fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/privkey.pem', 'utf8');
const fullchain = fs.readFileSync('/etc/letsencrypt/live/senso.senselive.io/fullchain.pem', 'utf8');
const credentials = { key: privateKey, cert: fullchain };


applySecurity(app);
app.use(rateLimiter);
// app.use(cors({ origin: ['http://localhost:4200'] }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('combined', { stream: accessLogStream }));

app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

app.get('/idp/test', (req, res) => {
  res.json({ status: 'success', message: 'System is working' });
});

app.use('/idp/auth', require('./routes/auth'));
app.use('/idp/msg', require('./routes/inmarsat'));
app.use('/idp/devices', require('./routes/devices'));

const PORT = process.env.PORT || 5550;
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(PORT, () => {
  console.log(`HTTPS server listening on port ${PORT}`);
});

