/**
 * SUPER WATCHDOG BOT SERVER (Final Stable)
 * ---------------------------------------
 * Features:
 *  ✔ /start with image + buttons
 *  ✔ Broadcast system (admin only)
 *  ✔ Auto-save all users in users.json
 *  ✔ Webhook endpoint for Telegram
 *  ✔ Watchdog that:
 *      - checks getWebhookInfo every 5 seconds
 *      - restores YOUR webhook if stolen
 *      - blocks other hosts instantly
 *
 * REQUIRED ENV VARIABLES:
 * BOT_TOKEN=xxxxx
 * ADMIN_ID=123456789
 * WEBHOOK_URL=https://your-render-app.onrender.com/telegram
 */

import express from "express";
import fetch from "node-fetch";
import fs from "fs";

// -------------------- LOAD ENV --------------------

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN = process.env.ADMIN_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

console.log("ENV BOT_TOKEN:", BOT_TOKEN);
console.log("ENV ADMIN_ID:", ADMIN);
console.log("ENV WEBHOOK_URL:", WEBHOOK_URL);

if (!BOT_TOKEN || !ADMIN || !WEBHOOK_URL) {
  console.log("❌ ENV DID NOT LOAD!");
  process.exit(1);
}

// Telegram API base
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// -------------------- USER STORAGE --------------------

const USERS = "./users.json";

function getUsers() {
  if (!fs.existsSync(USERS)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS, "utf8"));
  } catch {
    return [];
  }
}

function saveUsers(arr) {
  fs.writeFileSync(USERS, JSON.stringify(arr, null, 2));
}

// -------------------- TELEGRAM HELPERS --------------------

async function tg(method, data) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function send(chat, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chat,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function sendPhoto(chat, photo, caption, extra = {}) {
  return tg("sendPhoto", {
    chat_id: chat,
    photo,
    caption,
    parse_mode: "HTML",
    ...extra
  });
}

async function setWebhook(url) {
  return (
    await fetch(`${API}/setWebhook`, {
      method: "POST",
      body: new URLSearchParams({ url })
    })
  ).json();
}

async function getWebhook() {
  return (await fetch(`${API}/getWebhookInfo`)).json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// -------------------- BOT LOGIC --------------------

let ADMIN_WAIT = false;

async function handleMessage(msg) {
  const chat = msg.chat.id;
  const text = msg.text || "";

  // Save user
  const all = getUsers();
  if (!all.includes(chat)) {
    all.push(chat);
    saveUsers(all);
  }

  // START COMMAND
  if (text.startsWith("/start")) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🌐 Website", url: "https://example.com" }],
        [{ text: "📢 Channel", url: "https://t.me/yourchannel" }],
        [{ text: "💬 Support", url: "https://t.me/yoursupport" }],
        [{ text: "📤 Broadcast", callback_data: "BCAST" }]
      ]
    };

    await sendPhoto(
      chat,
      "https://i.ibb.co/xsGfq4t/welcome-banner.jpg",
      "<b>Welcome!</b>\nThis is your custom bot.",
      { reply_markup: keyboard }
    );
    return;
  }

  // ENABLE BROADCAST MODE
  if (text.startsWith("/bd")) {
    if (String(chat) !== String(ADMIN))
      return send(chat, "❌ Only admin can broadcast.");
    ADMIN_WAIT = true;
    return send(chat, "✍️ Send the message to broadcast.");
  }

  // BROADCAST MESSAGE
  if (ADMIN_WAIT && String(chat) === String(ADMIN)) {
    ADMIN_WAIT = false;

    const all = getUsers();
    await send(chat, `🚀 Broadcasting to ${all.length} users...`);

    for (let u of all) {
      await send(u, text).catch(() => {});
      await sleep(100);
    }

    return send(chat, "✅ Broadcast sent.");
  }

  return send(chat, "👋 Use /start.");
}

// Callback handler for inline buttons
async function handleCallback(cb) {
  const chat = cb.from.id;

  if (cb.data === "BCAST") {
    if (String(chat) !== String(ADMIN)) {
      return tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "❌ Admin only",
        show_alert: true
      });
    }

    ADMIN_WAIT = true;
    await send(chat, "✍️ Send your broadcast message now.");

    return tg("answerCallbackQuery", { callback_query_id: cb.id });
  }
}

// -------------------- EXPRESS (WEBHOOK SERVER) --------------------

const app = express();
app.use(express.json());

app.post("/telegram", async (req, res) => {
  res.sendStatus(200);

  try {
    if (req.body.message) await handleMessage(req.body.message);
    if (req.body.callback_query) await handleCallback(req.body.callback_query);
  } catch (e) {
    console.log("Message Error:", e);
  }
});

// -------------------- WATCHDOG --------------------

async function watchdog() {
  while (true) {
    try {
      const info = await getWebhook();
      const current = info.result?.url || "";

      if (current !== WEBHOOK_URL) {
        console.log("⚠️ Webhook stolen! Restoring...");
        await setWebhook(WEBHOOK_URL);
        await send(ADMIN, "⚠️ Web
