const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

async function fetchOAuthToken() {
  const url = `${process.env.INMARSAT_BASE_URL}/oauth/token`;

  const headers = {
    ClientId: process.env.INMARSAT_CLIENT_ID,
    ClientSecret: process.env.INMARSAT_CLIENT_SECRET
  };

  try {
    const response = await axios.post(url, {}, { headers });

    const { access_token, expires_in, token_type } = response.data;

    cachedToken = `${token_type} ${access_token}`;
    tokenExpiry = Date.now() + (expires_in - 60) * 1000; // Subtract 60s buffer

    const expiryDate = new Date(tokenExpiry).toISOString();
    console.log(`🔑 New OAuth token fetched. Expires at: ${expiryDate}`);

    return cachedToken;
  } catch (error) {
    console.error('❌ Failed to fetch OAuth token:', error.message);
    throw error;
  }
}

async function getAuthHeader() {
  if (cachedToken && Date.now() < tokenExpiry) {
    const remaining = Math.round((tokenExpiry - Date.now()) / 1000);
    //console.log(`✅ Using cached token. Valid for another ${remaining}s`);
    return cachedToken;
  }

  console.log('♻️ Cached token missing or expired. Fetching new token...');
  return await fetchOAuthToken();
}

module.exports = getAuthHeader;
