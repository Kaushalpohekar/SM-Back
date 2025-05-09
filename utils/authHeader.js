function getAuthHeader() {
    const username = process.env.INMARSAT_USERNAME;
    const password = process.env.INMARSAT_PASSWORD;
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${token}`;
  }
  
  module.exports = getAuthHeader;