const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});



// Check DB connection
pool.connect()
  .then((client) => {
    console.log('PostgreSQL connected successfully');
    client.release(); 
  })
  .catch((err) => {
    console.error('Error connecting to PostgreSQL:', err.message);
  });


module.exports = pool;
