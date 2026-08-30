# WhatsApp bot

Unofficial WhatsApp bot (via [Baileys](https://github.com/WhiskeySockets/Baileys)) that:

- Replies in DM with the donation form link when someone messages the bot's number about donating furniture.
- Posts an announcement into a WhatsApp group/announcement channel when the Flask backend tells it a
  furniture listing was approved (`POST /internal/announce`).

This logs in as a real WhatsApp account (use a spare/burner number, not a personal one) rather than
using Meta's official Business API, because the official API cannot send or receive messages in
groups or channels at all. That also means it runs against WhatsApp's terms of service — the number
can in theory be banned, so don't use a number you care about.

## Setup

1. `cp .env.example .env` and fill in `INTERNAL_SECRET` (any random string — must match the backend's
   `WHATSAPP_BOT_SECRET`).
2. `npm install`
3. `npm start`
4. Scan the printed QR code with the bot's WhatsApp number: **Linked Devices > Link a device**.
5. Once connected, add that number to your WhatsApp group (or as an admin of your announcement
   channel), then fetch its JID:
   ```
   curl -H "X-Internal-Secret: <your secret>" http://localhost:4001/internal/groups
   ```
6. Copy the matching `jid` into `.env` as `GROUP_JID`, then restart (`npm start`).

The login session persists in `auth_state/` (gitignored) so you don't need to rescan the QR code on
every restart, unless the number gets logged out remotely.

## Backend integration

The Flask backend calls `POST /internal/announce` (with header `X-Internal-Secret`) when an admin
approves a furniture listing. See `backend/app/whatsapp.py`.
