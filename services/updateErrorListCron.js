const cron = require('node-cron');
const { getInmarsatErrorList, upsertErrorCodes, getMobileTerminatedStatus, getMobileTerminatedMessagesByIdList, upsertMobileTerminatedMessages, getMobileOriginatedMessages,
  upsertMobileOriginatedMessages } = require('../services/inmarsatService_v2');

// 🧪 For testing: every 5 seconds
cron.schedule('0 */2 * * *', async () => {
    console.log(`[${new Date().toISOString()}] [CRON] Syncing Inmarsat error list...`);

    try {
        const errors = await getInmarsatErrorList();
        if (errors.length) {
            await upsertErrorCodes(errors);
            console.log(`✅ Synced ${errors.length} error codes from Inmarsat.`);
        } else {
            console.warn('⚠️ No errors returned from Inmarsat API.');
        }
    } catch (err) {
        console.error('❌ Cron job failed:', err.message || err);
    }
});


// 🔁 Combined MO + MT Sync Every 2 Seconds
cron.schedule('*/2 * * * * *', async () => {
  const timestamp = new Date().toISOString();
  const startTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago
  const endTime = new Date().toISOString(); // now

  let mtSynced = 0;
  let moSynced = 0;

  try {
    // 🔹 Mobile Terminated
    const statusList = await getMobileTerminatedStatus(startTime);
    const mtIds = statusList.map(s => s.messageId).filter(Boolean);

    if (mtIds.length > 0) {
      const mtMessages = await getMobileTerminatedMessagesByIdList(mtIds);
      if (mtMessages.length > 0) {
        await upsertMobileTerminatedMessages(mtMessages);
        mtSynced = mtMessages.length;
      }
    }

    // 🔹 Mobile Originated
    const moResponse = await getMobileOriginatedMessages({
      startTime,
      endTime,
      includeRawPayload: true
    });

    const moMessages = moResponse.messages || [];
    if (moMessages.length > 0) {
      await upsertMobileOriginatedMessages(moMessages);
      moSynced = moMessages.length;
    }

    // ✅ Final Summary Log
    console.log(`🛰️ [${timestamp}] MT: ${mtSynced} | MO: ${moSynced} | ✅ Sync complete.`);

  } catch (err) {
    console.error(`❌ [${timestamp}] Combined MO+MT sync failed:`, err.message || err);
  }
});

console.log('✅ [CRON] Schedulers initialized:');
console.log('   ⏱️ Error List: Every 2 minutes');
console.log('   ⏱️ MO + MT Sync: Every 2 seconds');
