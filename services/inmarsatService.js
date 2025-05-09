const axios = require('axios');
const getAuthHeader = require('../utils/authHeader');

async function getSomeData(startUtc, endUtc) {
  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json'
  };

  const baseUrl = `${process.env.INMARSAT_BASE_URL}get_return_messages.json/`;
  const queryParams = new URLSearchParams({
    access_id: process.env.INMARSAT_ACCESS_ID,
    password: process.env.INMARSAT_ACCESS_PASSWORD,
    start_utc: startUtc,
    end_utc: endUtc
  });

  const response = await axios.get(`${baseUrl}?${queryParams.toString()}`, { headers });
  return response.data;
}

async function getForwardMessages(startUtc, endUtc) {
  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json'
  };

  const baseUrl = `${process.env.INMARSAT_BASE_URL}get_forward_statuses.json/`;
  const queryParams = new URLSearchParams({
    access_id: process.env.INMARSAT_ACCESS_ID,
    password: process.env.INMARSAT_ACCESS_PASSWORD,
    start_utc: startUtc,
    end_utc: endUtc
  });

  const response = await axios.get(`${baseUrl}?${queryParams.toString()}`, { headers });
  return response.data.Statuses || [];
}

function chunkArray(arr, chunkSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchForwardMessageDetails(fwIDs) {
  const params = {
    access_id: process.env.INMARSAT_ACCESS_ID,
    password: process.env.INMARSAT_ACCESS_PASSWORD,
    fwIDs: fwIDs.join(','),
  };

  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.get(`${process.env.INMARSAT_BASE_URL}get_forward_messages.json/`, {
      params,
      headers
    });

    return response.data?.Messages || [];
  } catch (err) {
    console.error(`❌ Failed to fetch batch [${fwIDs.join(',')}]:`, err.message);
    return [];
  }
}

async function getForwardData(startUtc, endUtc) {
  const statusList = await getForwardMessages(startUtc, endUtc);

  if (!Array.isArray(statusList) || !statusList.length) {
    console.warn('⚠️ No forward messages found.');
    return [];
  }

  const allFwIDs = statusList.map(msg => msg.ForwardMessageID);
  const fwIDChunks = chunkArray(allFwIDs, 5); // 👈 batching with 5 IDs per call

  let allMessageDetails = [];
  for (const chunk of fwIDChunks) {
    const details = await fetchForwardMessageDetails(chunk);
    allMessageDetails = allMessageDetails.concat(details);
  }

  const errorResponse = await axios.get(`${process.env.INMARSAT_BASE_URL}info_errors.json/`, {
    headers: { Authorization: getAuthHeader() }
  });

  const errorMap = (errorResponse.data || []).reduce((acc, err) => {
    acc[err.ID] = err.Description;
    return acc;
  }, {});

  const mergedData = allMessageDetails.map(detail => {
    const statusEntry = statusList.find(s => s.ForwardMessageID === detail.ID);

    const isError = statusEntry?.ErrorID && statusEntry.ErrorID !== 0;
    const errorDescription = isError ? (errorMap[statusEntry.ErrorID] || 'Unknown Error') : 'No Error';

    return {
      ID: detail.ID,
      DestinationID: detail.DestinationID,
      CreateUTC: detail.CreateUTC,
      StatusUTC: statusEntry?.StateUTC || null,
      State: statusEntry?.State || null,
      IsClosed: statusEntry?.IsClosed || null,
      Payload: detail.Payload,
      RawPayload: detail.RawPayload,
      ErrorID: statusEntry?.ErrorID || 0,
      ErrorDescription: errorDescription
    };
  });

  return mergedData;
}




module.exports = { getSomeData, getForwardData};
