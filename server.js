const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

let heartbeats = {};   // { hwid: lastSeen }
let detections = [];   // [{ hwid, type, detail, time }]

// Heartbeat endpoint
app.post("/heartbeat", (req, res) => {
  const { hwid } = req.body;
  if (!hwid) return res.status(400).json({ error: "HWID required" });

  heartbeats[hwid] = Date.now();
  return res.json({ status: "ok", lastSeen: heartbeats[hwid] });
});

// Detections endpoint
app.post("/detections", (req, res) => {
  const { hwid, type, detail } = req.body;
  if (!hwid || !type) return res.status(400).json({ error: "Invalid payload" });

  const detection = {
    hwid,
    type,
    detail: detail || "N/A",
    time: new Date().toISOString(),
  };

  detections.push(detection);

  console.log("[EAB Detection]", detection);

  return res.json({ status: "logged", detection });
});

// Get all detections (for dashboard)
app.get("/detections", (req, res) => {
  return res.json(detections);
});

// Player status
app.get("/status/:hwid", (req, res) => {
  const hwid = req.params.hwid;
  const lastSeen = heartbeats[hwid];

  if (!lastSeen) {
    return res.json({ hwid, status: "offline" });
  }

  // Example: offline if no heartbeat for 15s
  const isOnline = Date.now() - lastSeen < 15000;
  return res.json({
    hwid,
    status: isOnline ? "online" : "offline",
    lastSeen,
  });
});

// Render uses environment port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`EAB API running on port ${PORT}`);
});
