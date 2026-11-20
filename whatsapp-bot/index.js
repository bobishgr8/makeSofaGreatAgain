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
const DONATION_FORM_URL = `${WEB_ORIGIN}/donate`;
// Who to talk to for help (EPIC 13). Digits in international format, e.g. 6591234567.
const HELP_WHATSAPP = (process.env.HELP_WHATSAPP || "").replace(/[^0-9]/g, "");

if (!INTERNAL_SECRET) {
  console.error("INTERNAL_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

// The welcome menus from the Figma flow (donor: Donate Furniture / Track Status;
// social worker: Find Specific Furniture / Check Status / View All Furniture /
// Get Help). Baileys cannot send reliable buttons, so people reply with a
// number and get a link to the right page of the web app.
const MENU = [
  { key: "1", label: "Donate furniture", path: "/donate", intro: "Thanks for wanting to donate! Fill in this short form to list your item:" },
  { key: "2", label: "Track my donations", path: "/donor", intro: "Here is the status of your donations:" },
  { key: "3", label: "Find furniture for a household (social workers)", path: "/cases/new", intro: "Tell us what the household needs and we will recommend furniture:" },
  { key: "4", label: "Check my requests (social workers)", path: "/workspace", intro: "Here are your cases and requests:" },
  { key: "5", label: "View all furniture", path: "/furniture", intro: "Here is all the furniture available right now:" },
  { key: "6", label: "Get help", path: null, intro: null },
];

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

function menuText() {
  return [
    "Hi there, welcome to Refurbish! 👋",
    "We connect donated furniture with families and community organisations in need.",
    "",
    "What would you like to do? Reply with a number:",
    ...MENU.map((option) => `${option.key}. ${option.label}`),
  ].join("\n");
}

function helpText() {
  const lines = ["Need a hand? We are happy to help."];
  if (HELP_WHATSAPP) lines.push("", `Chat with our team: https://wa.me/${HELP_WHATSAPP}`);
  lines.push("", `Or visit ${WEB_ORIGIN}/help`);
  return lines.join("\n");
}

// The reply to one direct message, or null to stay quiet.
function replyTo(text) {
  const trimmed = text.trim();
  const option = MENU.find((candidate) => candidate.key === trimmed);
  if (option) {
    if (!option.path) return helpText();
    return `${option.intro}\n${WEB_ORIGIN}${option.path}\n\nReply "menu" any time to see the options again.`;
  }
  const lower = trimmed.toLowerCase();
  if (DONATION_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return (
      "Thanks for wanting to donate furniture!\n\n" +
      "Please fill in this short form to list your item:\n" +
      `${DONATION_FORM_URL}\n\n` +
      "You'll be asked to create a free account first (so we can reach you about pickup), " +
      "then describe the item and add photos. Our team reviews every listing before it goes live.\n\n" +
      'Reply "menu" to see everything else we can help with.'
    );
  }
  if (/\bhelp\b/.test(lower)) return helpText();
  // Anything else (hi, hello, menu, ...) gets the welcome menu.
  return menuText();
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

      if (!text) continue;
      const reply = replyTo(text);
      if (!reply) continue;

      try {
        await sock.sendMessage(remoteJid, { text: reply });
      } catch (err) {
        console.error("Failed to send reply", err);
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

// One message to one person: the backend's notifications job (backend/app/notifications.py).
// Body: { to: "6591234567", text: "..." }.
app.post("/internal/send", requireInternalSecret, async (req, res) => {
  if (!sock) return res.status(503).json({ error: "not connected yet" });

  const { to, text } = req.body || {};
  const digits = String(to || "").replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15 || !text) {
    return res.status(400).json({ error: "to (8-15 digits) and text are required" });
  }

  try {
    await sock.sendMessage(`${digits}@s.whatsapp.net`, { text: String(text) });
    res.json({ status: "sent" });
  } catch (err) {
    console.error("Failed to send message", err);
    res.status(502).json({ error: "failed to send whatsapp message" });
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
