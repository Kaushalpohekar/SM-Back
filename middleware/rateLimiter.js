const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // limit per IP
  message: 'Too many requests from this IP, try again later.'
});

module.exports = limiter;