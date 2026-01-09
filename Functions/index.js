/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const { setGlobalOptions } = require("firebase-functions");
const { logger } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // v2 scheduler
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// ----------------------
// Cleanup inactive locations
// ----------------------
exports.cleanupInactiveDevices = onSchedule('every 10 minutes', async (event) => {
  const now = Date.now();
  const EXPIRATION_TIME = 20 * 60 * 1000; // 20 minutes

  const ref = admin.database().ref('locations');
  const snapshot = await ref.once('value');

  snapshot.forEach((child) => {
    const data = child.val();
    if (!data?.timestamp) return;

    if (now - data.timestamp > EXPIRATION_TIME) {
      logger.info(`Removing inactive device: ${child.key}`);
      child.ref.remove();
    }
  });
});
