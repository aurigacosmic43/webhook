/**
 * SUPER WATCHDOG BOT SERVER (Final)
 * Features:
 *  ✔ /start with image + buttons
 *  ✔ Broadcast system (admin only)
 *  ✔ Auto-add all users in users.json
 *  ✔ Webhook endpoint for Telegram
 *  ✔ Watchdog loop that:
 *      - checks getWebhookInfo every 5 seconds
 *      - re-sets webhook to YOUR URL if changed
 *      - kills any external host stealing your token
 *
 * REQUIRED ENV VARIABLES:
 * BOT_TOKEN=xxxxx
 * ADMIN_ID=123456789
 * WEBHOOK_URL=https://yourapp.koyeb.app/telegram
 *
 * HOW TO RUN:
 * npm install express node-fetch
 * node bot.js
 */

import express from "express";
import fetch from "node-fetch";
import fs from "fs";

console.log("ENV BOT_TOKEN:", process.env.BOT_TOKEN);
console.log("ENV ADMIN_ID:", process.env.ADMIN_ID);
console.log("ENV WEBHOOK_URL:", process.env.WEBHOOK_URL);

if (!process.env.BOT_TOKEN || !process.env.ADMIN_ID || !process.env.WEBHOOK_URL) {
  console.log("ENV DID NOT LOAD!");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;
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

async function tg(method, data) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(data)
  });
  return res.json();
}

async function setWebhook(url) {
  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    body: new URLSearchParams({ url })
  });
  return res.json();
}

async function getWebhook() {
  return (await fetch(`${API}/getWebhookInfo`)).json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function send(chat, text, extra={}) {
  return tg("sendMessage", {
    chat_id: chat,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function sendPhoto(chat, photo, caption, extra={}) {
  return tg("sendPhoto", {
    chat_id: chat,
    photo,
    caption,
    parse_mode: "HTML",
    ...extra
  });
}

// ---------------------- BOT LOGIC -----------------------

async function handleMessage(msg) {
  const chat = msg.chat.id;
  const text = msg.text || "";

  // Track all users
  const users = getUsers();
  if (!users.includes(chat)) {
    users.push(chat);
    saveUsers(users);
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

  // BROADCAST MODE
  if (text.startsWith("/bd")) {
    if (String(chat) !== String(ADMIN)) {
      return send(chat, "❌ Only admin can broadcast.");
    }
    ADMIN_WAIT = true;
    return send(chat, "✍️ Send the message to broadcast to everyone.");
  }

  // ADMIN SENDS BROADCAST TEXT
  if (ADMIN_WAIT && String(chat) === String(ADMIN)) {
    ADMIN_WAIT = false;
    const users = getUsers();
    send(chat, `🚀 Broadcasting to ${users.length} users...`);

    for (let u of users) {
      await send(u, text).catch(()=>{});
      await sleep(50);
    }

    return send(chat, "✅ Done.");
  }

  // Normal fallback
  send(chat, "👋 Use /start.");
}

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
    await send(chat, "✍️ Send broadcast text now.");
    return tg("answerCallbackQuery", {
      callback_query_id: cb.id
    });
  }
}

// ---------------------- EXPRESS SERVER (Webhook) -----------------------

const app = express();
app.use(express.json());

let ADMIN_WAIT = false;

app.post("/telegram", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;

  try {
    if (body.message) await handleMessage(body.message);
    if (body.callback_query) await handleCallback(body.callback_query);
  } catch (e) {
    console.log("Error:", e);
  }
});

// ---------------------- WATCHDOG LOOP -----------------------

async function watchdog() {
  while (true) {
    try {
      const info = await getWebhook();
      const current = info.result?.url || "";

      if (current !== WEBHOOK_URL) {
        console.log("⚠️ Webhook stolen! Setting back to YOUR URL...");
        const r = await setWebhook(WEBHOOK_URL);
        console.log("setWebhook =>", r);
        await send(ADMIN, "⚠️ Webhook was stolen. I restored it.");
      }
    } catch (e) {
      console.log("Watchdog error:", e);
    }
    await sleep(5000); // check every 5 seconds
  }
}

// ---------------------- START SERVER -----------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("Bot running on port", PORT);

  // Set initial webhook
  console.log("Setting initial webhook:", WEBHOOK_URL);
  await setWebhook(WEBHOOK_URL);

  // start watchdog
  watchdog();
});
