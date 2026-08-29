process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

const { onRequest } = require("firebase-functions/v2/https");
const cors = require("cors")({ origin: true });
const api = require("./bundle.js");

exports.api = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 60, memory: "1GiB" },
  (req, res) => {
    cors(req, res, async () => {
      if (api.default) {
        await api.default(req, res);
      } else {
        res.status(500).send("API handler not found in bundle");
      }
    });
  }
);
