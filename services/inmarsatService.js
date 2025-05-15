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


async function getChatMessages(startUtc, endUtc) {
  const [rawReturnMessages, forwardMessages] = await Promise.all([
    getSomeData(startUtc, endUtc),
    getForwardData(startUtc, endUtc)
  ]);

  const returnMessages = Array.isArray(rawReturnMessages.Messages)
    ? rawReturnMessages.Messages
    : [];

  const grouped = {};

  // Group and simplify return messages
  for (const msg of returnMessages) {
    const id = String(msg.MobileID).trim();
    if (!grouped[id]) {
      grouped[id] = {
        MobileID: id,
        MobileOriginated: [],
        MobileTerminated: []
      };
    }
    grouped[id].MobileOriginated.push({
      MessageUTC: msg.MessageUTC,
      ReceiveUTC: msg.ReceiveUTC,
      RawPayload: msg.RawPayload || null
    });
  }

  // Group and simplify forward messages
  for (const msg of forwardMessages) {
    const id = String(msg.DestinationID).trim();
    if (!grouped[id]) {
      grouped[id] = {
        MobileID: id,
        MobileOriginated: [],
        MobileTerminated: []
      };
    }
    grouped[id].MobileTerminated.push({
      CreateUTC: msg.CreateUTC,
      StatusUTC: msg.StatusUTC,
      RawPayload: msg.RawPayload || null,
      ErrorID: msg.ErrorID,
      ErrorDescription: msg.ErrorDescription,
      State: msg.State,
    });
  } 

  // Sort both arrays by time
  for (const id in grouped) {
    grouped[id].MobileOriginated.sort(
      (a, b) => new Date(a.MessageUTC) - new Date(b.MessageUTC)
    );
    grouped[id].MobileTerminated.sort(
      (a, b) => new Date(a.CreateUTC) - new Date(b.CreateUTC)
    );
  }

  return Object.values(grouped);
}

async function sendMobileTerminatedMessage({ DestinationID, RawPayload, Payload }) {
  if (!DestinationID || !RawPayload) {
    throw new Error('Missing required parameters: DestinationID, RawPayload');
  }

  const access_id = process.env.INMARSAT_ACCESS_ID;
  const password = process.env.INMARSAT_ACCESS_PASSWORD;

  const headers = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const UserMessageID = String(Math.floor(Math.random() * 9) + 1); 

  const payload = {
    access_id,
    password,
    messages: [
      {
        DestinationID,
        UserMessageID,
        RawPayload,
        Payload
      }
    ]
  };

  try {
    const response = await axios.post(
      `${process.env.INMARSAT_BASE_URL}submit_messages.json/`,
      payload,
      { headers }
    );

    return response.data;
  } catch (error) {
    console.error('Send MT Message Error:', error.message);
    throw error;
  }
}

module.exports = { getSomeData, getForwardData, getChatMessages, sendMobileTerminatedMessage };
