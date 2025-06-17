const getAuthHeader = require('../utils/authHeader_v2');
const axios = require('axios');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ Helper: Sanitize input
function sanitize(value) {
  if (typeof value === 'string') return value.replace(/\0/g, '').trim();
  return value || null;
}

// ✅ Helper: Encode with SIN + MIN + Payload (Demo Version 2)
function encodePayloadWithSIN_MIN(payloadStr, sin = 0x81, min = 0x01) {
  const payloadBuffer = Buffer.from(payloadStr, 'utf-8');
  const fullBuffer = Buffer.concat([
    Buffer.from([sin, min]),
    payloadBuffer
  ]);
  return fullBuffer.toString('base64');
}

async function getInmarsatErrorList() {
  try {
    const authToken = await getAuthHeader();
    const headers = {
      Authorization: authToken,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${process.env.INMARSAT_BASE_URL}/${process.env.IOT_MSG_VERSION}/info/errors`, {
      headers
    });

    const errors = response.data || [];
    return errors.map(err => ({
      ErrorID: err.code,
      Reason: err.reason,
      Message: err.message
    }));
  } catch (error) {
    console.error('❌ Failed to fetch Inmarsat error list:', error.message);
    return [];
  }
}

async function upsertErrorCodes(errorList) {
  const client = await pool.connect();

  const query = `
    INSERT INTO idp.idp_inmarsat_error_codes (error_id, reason, message)
    VALUES ($1, $2, $3)
    ON CONFLICT (error_id)
    DO UPDATE SET reason = EXCLUDED.reason, message = EXCLUDED.message, updated_at = CURRENT_TIMESTAMP;
  `;

  let successCount = 0;
  let failCount = 0;

  try {
    for (const err of errorList) {
      const errorID = err.ErrorID;
      const reason = sanitize(err.Reason);
      const message = sanitize(err.Message);

      try {
        await client.query(query, [errorID, reason, message]);
        successCount++;
      } catch (e) {
        failCount++;
        console.error(`❌ Failed to upsert error_id ${errorID}:`, e.message);
      }
    }

    //console.log(`✅ Upsert complete: ${successCount} succeeded, ${failCount} failed.`);
  } catch (e) {
    console.error('❌ Bulk upsert loop failed:', e.message);
  } finally {
    client.release();
  }
}

async function getMobileOriginatedMessages({ startTime, endTime, includeRawPayload = false }) {
  try {
    const authToken = await getAuthHeader(); // Will log token usage
    const baseUrl = process.env.INMARSAT_BASE_URL;
    const version = process.env.IOT_MSG_VERSION;
    const mailbox = 'NDY5ODYyNjktMDdmNC00MWEzLThmZTctZGYyNDE0MjIwYmI0OlpkMGAoJCttRFlZSA==';

    const url = `${baseUrl}/${version}/messages/mobileOriginated`;
    const params = {
      startTime,
      endTime,
      includeRawPayload
    };

    const headers = {
      Authorization: authToken,
      'X-Mailbox': mailbox
    };

    const response = await axios.get(url, { params, headers });

    const messages = response.data || [];
    //console.log(`📨 Retrieved ${messages.length} mobile-originated message(s) from ${startTime} to ${endTime}`);
    
    return messages;

  } catch (error) {
    console.error('❌ Failed to fetch mobile-originated messages:', error.message);
    return [];
  }
}

async function upsertMobileOriginatedMessages(messages) {
  const client = await pool.connect();

  const query = `
    INSERT INTO idp.idp_mobile_originated_messages (
      message_id, device_id, receive_time, mailbox_time,
      network, payload_raw, region_name, size, created_at
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, CURRENT_TIMESTAMP
    )
    ON CONFLICT (message_id)
    DO UPDATE SET
      device_id = EXCLUDED.device_id,
      receive_time = EXCLUDED.receive_time,
      mailbox_time = EXCLUDED.mailbox_time,
      network = EXCLUDED.network,
      payload_raw = EXCLUDED.payload_raw,
      region_name = EXCLUDED.region_name,
      size = EXCLUDED.size,
      created_at = CURRENT_TIMESTAMP;
  `;

  let inserted = 0;
  let failed = 0;

  try {
    for (const msg of messages) {
      try {
        await client.query(query, [
          sanitize(msg.messageId),
          sanitize(msg.deviceId),
          sanitize(msg.receiveTime),
          sanitize(msg.mailboxTime),
          msg.network ?? null,
          sanitize(msg.payloadRaw),
          sanitize(msg.regionName),
          msg.size ?? null
        ]);
        inserted++;
      } catch (err) {
        failed++;
        console.error(`❌ Failed to upsert MO message ${msg.messageId}:`, err.message);
      }
    }

    //console.log(`✅ MO upsert complete: ${inserted} inserted/updated, ${failed} failed.`);
  } catch (err) {
    console.error('❌ MO bulk upsert failed:', err.message);
  } finally {
    client.release();
  }
}

async function getMobileTerminatedStatus(startTime) {
  try {
    const authToken = await getAuthHeader();
    const baseUrl = process.env.INMARSAT_BASE_URL;
    const version = process.env.IOT_MSG_VERSION;
    const mailbox = 'NDY5ODYyNjktMDdmNC00MWEzLThmZTctZGYyNDE0MjIwYmI0OlpkMGAoJCttRFlZSA==';

    const url = `${baseUrl}/${version}/messages/mobileTerminated/status`;
    const headers = {
      Authorization: authToken,
      'X-Mailbox': mailbox
    };

    const params = { startTime };

    const response = await axios.get(url, { headers, params });

    const data = response.data;

    if (!data || !Array.isArray(data.statuses)) {
      console.warn('⚠️ Invalid response from /mobileTerminated/status:', data);
      return [];
    }

    //console.log(`📡 Retrieved ${data.statuses.length} mobile-terminated message statuses`);
    return data.statuses;
  } catch (error) {
    console.error('❌ Failed to fetch mobile-terminated status:', error.response?.data || error.message);
    return [];
  }
}

async function getMobileTerminatedMessagesByIdList(idList) {
  try {
    if (!idList.length) return [];

    const authToken = await getAuthHeader();
    const baseUrl = process.env.INMARSAT_BASE_URL;
    const version = process.env.IOT_MSG_VERSION;
    const mailbox = 'NDY5ODYyNjktMDdmNC00MWEzLThmZTctZGYyNDE0MjIwYmI0OlpkMGAoJCttRFlZSA==';

    const url = `${baseUrl}/${version}/messages/mobileTerminated`;
    const headers = {
      Authorization: authToken,
      'X-Mailbox': mailbox
    };

    const params = { idList: idList.join(',') };

    const response = await axios.get(url, { headers, params });
    return response.data || [];
  } catch (error) {
    console.error('❌ Failed to fetch mobile-terminated messages:', error.message);
    return [];
  }
}

async function upsertMobileTerminatedMessages(messages) {
  const client = await pool.connect();
  const query = `
    INSERT INTO idp.idp_mobile_terminated_messages (
      message_id, destination_id, payload_raw, error_id, is_closed, state,
      state_time, submit_time, network, message_class, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, CURRENT_TIMESTAMP
    )
    ON CONFLICT (message_id)
    DO UPDATE SET
      destination_id = EXCLUDED.destination_id,
      payload_raw = EXCLUDED.payload_raw,
      error_id = EXCLUDED.error_id,
      is_closed = EXCLUDED.is_closed,
      state = EXCLUDED.state,
      state_time = EXCLUDED.state_time,
      submit_time = EXCLUDED.submit_time,
      network = EXCLUDED.network,
      message_class = EXCLUDED.message_class,
      updated_at = CURRENT_TIMESTAMP;
  `;

  let inserted = 0;
  let failed = 0;

  try {
    for (const msg of messages) {
      try {
        await client.query(query, [
          msg.messageId,
          sanitize(msg.destinationId),
          msg.payloadRaw || null,
          msg.errorId || null,
          msg.isClosed,
          msg.state,
          msg.stateTime,
          msg.submitTime,
          msg.network,
          msg.messageClass
        ]);
        inserted++;
      } catch (err) {
        failed++;
        console.error(`❌ Failed to upsert message ${msg.messageId}:`, err.message);
      }
    }
    //console.log(`✅ Upserted ${inserted} messages. Failed: ${failed}`);
  } catch (err) {
    console.error('❌ Bulk upsert error:', err.message);
  } finally {
    client.release();
  }
}

async function sendMobileTerminatedMessage(destinationId, userMessageId, payloadText) {
  const payloadRaw = encodePayloadWithSIN_MIN(payloadText);
  const authToken = await getAuthHeader();

  const headers = {
    Authorization: authToken,
    'X-Mailbox': 'NDY5ODYyNjktMDdmNC00MWEzLThmZTctZGYyNDE0MjIwYmI0OlpkMGAoJCttRFlZSA==',
    'Content-Type': 'application/json'
  };

  const requestBody = {
    messages: [
      {
        destinationId,
        userMessageId: userMessageId?.toString(),
        payloadRaw
      }
    ]
  };

  const url = `${process.env.INMARSAT_BASE_URL}/${process.env.IOT_MSG_VERSION}/messages/mobileTerminated`;
  const response = await axios.post(url, requestBody, { headers });

  const message = response.data?.messages?.[0];

  if (message?.messageId && response.status === 200) {
    const client = await pool.connect();

    const insertQuery = `
      INSERT INTO idp.idp_mobile_terminated_messages (
        message_id, destination_id, payload_raw, error_id, is_closed,
        state, state_time, submit_time, network, message_class, updated_at
      )
      VALUES (
        $1, $2, $3, NULL, FALSE,
        NULL, NULL, CURRENT_TIMESTAMP, NULL, NULL, CURRENT_TIMESTAMP
      )
      ON CONFLICT (message_id) DO NOTHING;
    `;

    await client.query(insertQuery, [
      message.messageId,
      sanitize(destinationId),
      payloadRaw
    ]);

    client.release();
  }

  return message;
}

async function getChatMessages(startUtc, endUtc) {
  // Fetch Mobile Originated and Terminated messages
  const [moRows, mtRows] = await Promise.all([
    pool.query(`
      SELECT device_id AS id, message_id, receive_time, mailbox_time, payload_raw, region_name, size
      FROM idp.idp_mobile_originated_messages
      WHERE receive_time BETWEEN $1 AND $2
    `, [startUtc, endUtc]),

    pool.query(`
      SELECT destination_id AS id, message_id, payload_raw, error_id, state, state_time AS status_utc, submit_time AS create_utc
      FROM idp.idp_mobile_terminated_messages
      WHERE submit_time BETWEEN $1 AND $2
    `, [startUtc, endUtc])
  ]);

  const grouped = {};

  // Group Mobile Originated messages
  for (const msg of moRows.rows) {
    const id = msg.id.trim();
    if (!grouped[id]) {
      grouped[id] = {
        MobileID: id,
        MobileOriginated: [],
        MobileTerminated: []
      };
    }
    grouped[id].MobileOriginated.push({
      MessageID: msg.message_id,
      MessageUTC: msg.receive_time,
      ReceiveUTC: msg.mailbox_time,
      RawPayload: msg.payload_raw
    });
  }

  // Group Mobile Terminated messages
  for (const msg of mtRows.rows) {
    const id = msg.id.trim();
    if (!grouped[id]) {
      grouped[id] = {
        MobileID: id,
        MobileOriginated: [],
        MobileTerminated: []
      };
    }
    grouped[id].MobileTerminated.push({
      MessageID: msg.message_id,
      CreateUTC: msg.create_utc,
      StatusUTC: msg.status_utc,
      RawPayload: msg.payload_raw,
      ErrorID: msg.error_id,
      ErrorDescription: null, // Optional: map error_id to string
      State: msg.state
    });
  }

  // Sort by time
  for (const id in grouped) {
    grouped[id].MobileOriginated.sort((a, b) => new Date(a.MessageUTC) - new Date(b.MessageUTC));
    grouped[id].MobileTerminated.sort((a, b) => new Date(a.CreateUTC) - new Date(b.CreateUTC));
  }

  return Object.values(grouped);
}

module.exports = {
  getInmarsatErrorList,
  upsertErrorCodes,
  getMobileOriginatedMessages,
  getMobileTerminatedStatus,
  getMobileTerminatedMessagesByIdList,
  upsertMobileTerminatedMessages,
  sendMobileTerminatedMessage,
  upsertMobileOriginatedMessages,
  getChatMessages 
};
