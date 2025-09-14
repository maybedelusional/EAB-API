const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

let heartbeats = {};   // { hwid: lastSeen }
let detections = [];   // [{ hwid, type, detail, time }]
let bans = [];         // [{ userId, type, reason, expires }]

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1416891410904252486/FAafU2jrIeGnvp_w8fREG5Olj_VpPH9pgxJgSYoBPW0FK4CDW4yOJlTlY3EXBIlHx-oT";
const API_KEY = process.env.API_KEY || "supersecretkey";

// --- Helper: Discord Alerts (native fetch, no axios) ---
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
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embed)
    });
  } catch (err) {
    console.error("[EAB] Discord webhook failed:", err.message);
  }
}

// --- Middleware for API Key (for protected routes) ---
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

  sendDiscordAlert(detection);

  return res.json({ status: "logged", detection });
});

// --- Get all detections ---
app.get("/detections", (req, res) => res.json(detections));

// --- Detection breakdown stats ---
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

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EAB API running on port ${PORT}`));
