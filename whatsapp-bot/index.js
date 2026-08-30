"use strict";

const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 4001;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const GROUP_JID = process.env.GROUP_JID || "";
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";
const DONATION_FORM_URL = `${WEB_ORIGIN}/furniture/new`;

if (!INTERNAL_SECRET) {
  console.error("INTERNAL_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

const DONATION_KEYWORDS = [
  "donate",
  "donation",
  "give away",
  "giving away",
  "sofa",
  "furniture",
  "couch",
  "table",
  "chair",
  "wardrobe",
  "bed frame",
];

function looksLikeDonationIntent(text) {
  const lower = text.toLowerCase();
  return DONATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function donationReplyText() {
  return (
    "Hi! Thanks for wanting to donate furniture.\n\n" +
    "Please fill in this short form to list your item:\n" +
    `${DONATION_FORM_URL}\n\n` +
    "You'll be asked to create a free account first (so we can reach you about pickup), " +
    "then describe the item and add a photo. Our team reviews every listing before it goes live."
  );
}

let sock = null;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_state");

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Scan this QR code with the bot's WhatsApp number:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("Connection closed.", { statusCode, shouldReconnect });

      if (shouldReconnect) {
        startSocket();
      } else {
        console.error("Logged out. Delete auth_state/ and restart to re-link.");
      }
    } else if (connection === "open") {
      console.log("WhatsApp connection open.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      if (message.key.fromMe) continue;

      const remoteJid = message.key.remoteJid || "";
      const isGroup = remoteJid.endsWith("@g.us");
      if (isGroup) continue; // only react to direct messages, not group chatter

      const text =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        "";

      if (!text || !looksLikeDonationIntent(text)) continue;

      try {
        await sock.sendMessage(remoteJid, { text: donationReplyText() });
      } catch (err) {
        console.error("Failed to send donation reply", err);
      }
    }
  });
}

function requireInternalSecret(req, res, next) {
  if (req.header("X-Internal-Secret") !== INTERNAL_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", connected: Boolean(sock) });
});

// Run this once after scanning the QR code to find the JID for GROUP_JID.
app.get("/internal/groups", requireInternalSecret, async (_req, res) => {
  if (!sock) return res.status(503).json({ error: "not connected yet" });

  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map((group) => ({
      jid: group.id,
      subject: group.subject,
    }));
    res.json(list);
  } catch (err) {
    console.error("Failed to fetch groups", err);
    res.status(500).json({ error: "failed to fetch groups" });
  }
});

app.post("/internal/announce", requireInternalSecret, async (req, res) => {
  if (!sock) return res.status(503).json({ error: "not connected yet" });
  if (!GROUP_JID) return res.status(500).json({ error: "GROUP_JID is not configured" });

  const { title, category, condition, neighbourhood, url } = req.body || {};
  if (!title || !url) {
    return res.status(400).json({ error: "title and url are required" });
  }

  const lines = ["New furniture listing just went live!", "", title];
  if (category) lines.push(`Category: ${category}`);
  if (condition) lines.push(`Condition: ${condition}`);
  if (neighbourhood) lines.push(`Neighbourhood: ${neighbourhood}`);
  lines.push("", url);

  try {
    await sock.sendMessage(GROUP_JID, { text: lines.join("\n") });
    res.json({ status: "sent" });
  } catch (err) {
    console.error("Failed to post announcement", err);
    res.status(502).json({ error: "failed to send whatsapp message" });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp bot internal API listening on port ${PORT}`);
});

startSocket().catch((err) => {
  console.error("Failed to start WhatsApp socket", err);
  process.exit(1);
});
