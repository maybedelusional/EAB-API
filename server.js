const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

let heartbeats = {};   // { hwid: lastSeen }
let detections = [];   // [{ hwid, type, detail, time }]
let bans = [];         // [{ userId, type, reason, expires }]

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "";
const API_KEY = process.env.API_KEY || "supersecretkey";

// --- Helper: Discord Alerts ---
async function sendDiscordAlert(detection) {
  if (!DISCORD_WEBHOOK) return;
  const embed = {
    embeds: [
      {
        title: "🚨 Easy Anti-Blox Detection 🚨",
        color: 15158332,
        fields: [
          { name: "HWID", value: detection.hwid, inline: true },
          { name: "Type", value: detection.type, inline: true },
          { name: "Detail", value: detection.detail, inline: false },
          { name: "Time", value: detection.time, inline: false }
        ]
      }
    ]
  };
  try {
    await axios.post(DISCORD_WEBHOOK, embed);
  } catch (err) {
    console.error("[EAB] Discord webhook failed", err.message);
  }
}

// --- Middleware for API Key ---
function requireKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// --- Heartbeat ---
app.post("/heartbeat", (req, res) => {
  const { hwid } = req.body;
  if (!hwid) return res.status(400).json({ error: "HWID required" });

  heartbeats[hwid] = Date.now();
  return res.json({ status: "ok", lastSeen: heartbeats[hwid] });
});

// --- Detections ---
app.post("/detections", (req, res) => {
  const { hwid, type, detail } = req.body;
  if (!hwid || !type) return res.status(400).json({ error: "Invalid payload" });

  const detection = {
    hwid,
    type,
    detail: detail || "N/A",
    time: new Date().toISOString()
  };

  detections.push(detection);
  console.log("[EAB Detection]", detection);

  // Send Discord alert
  sendDiscordAlert(detection);

  return res.json({ status: "logged", detection });
});

// --- Get all detections ---
app.get("/detections", (req, res) => res.json(detections));

// --- Detection breakdown ---
app.get("/stats", (req, res) => {
  const counts = detections.reduce((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {});
  res.json(counts);
});

// --- Ban System ---
app.post("/ban", requireKey, (req, res) => {
  const { userId, type, reason } = req.body;
  if (!userId || !type) return res.status(400).json({ error: "Missing data" });

  let expires = null;
  if (type === "temp") {
    expires = Date.now() + 1000 * 60 * 60 * 24 * 60; // 60 days
  }

  const ban = { userId, type, reason: reason || "Rule violation", expires };
  bans.push(ban);
  return res.json({ status: "banned", ban });
});

app.get("/ban/:userId", (req, res) => {
  const ban = bans.find(b => b.userId === req.params.userId);
  if (!ban) return res.json({ userId: req.params.userId, status: "clean" });

  if (ban.expires && ban.expires < Date.now()) {
    return res.json({ userId: req.params.userId, status: "clean" });
  }
  return res.json({ userId: ban.userId, status: "banned", ban });
});

// --- Status check ---
app.get("/status/:hwid", (req, res) => {
  const hwid = req.params.hwid;
  const lastSeen = heartbeats[hwid];
  if (!lastSeen) return res.json({ hwid, status: "offline" });

  const isOnline = Date.now() - lastSeen < 15000;
  res.json({ hwid, status: isOnline ? "online" : "offline", lastSeen });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EAB API running on port ${PORT}`));
