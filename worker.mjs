import message0900 from "./messages/09-00.txt";
import message1500 from "./messages/15-00.txt";
import message1900 from "./messages/19-00.txt";
import message1920 from "./messages/19-20.txt";
import message1930 from "./messages/19-30.txt";
import message2000 from "./messages/20-00.txt";

const CHAT_ID = "-1002168116733";
const SLOTS = new Map([
  ["09:00", { name: "09-00", text: message0900, image: true, pin: true }],
  ["15:00", { name: "15-00", text: message1500, image: true }],
  ["19:00", { name: "19-00", text: message1900, image: true }],
  ["19:20", { name: "19-20", text: message1920, image: false }],
  ["19:30", { name: "19-30", text: message1930, image: true }],
  ["20:00", { name: "20-00", text: message2000, image: true }],
]);

const kstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getKstParts(date) {
  return Object.fromEntries(
    kstFormatter.formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

async function telegram(env, method, init) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
        init,
      );
      const result = await response.json();
      if (!result.ok) throw new Error(result.description || `${method} failed`);
      return result.result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function sendSlot(env, slot, dateKey) {
  const stateKey = `${dateKey}:${slot.name}`;
  if (await env.SEND_STATE.get(stateKey)) {
    console.log(JSON.stringify({ ok: true, skipped: "already-sent", slot: slot.name, dateKey }));
    return;
  }

  let sent;
  if (slot.image) {
    const assetResponse = await env.ASSETS.fetch(`https://assets.local/${slot.name}.png`);
    if (!assetResponse.ok) throw new Error(`Missing image for ${slot.name}`);
    const form = new FormData();
    form.set("chat_id", CHAT_ID);
    form.set("caption", slot.text.trim());
    form.set("photo", new Blob([await assetResponse.arrayBuffer()], { type: "image/png" }), `${slot.name}.png`);
    sent = await telegram(env, "sendPhoto", { method: "POST", body: form });
  } else {
    sent = await telegram(env, "sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: slot.text.trim() }),
    });
  }

  if (slot.pin) {
    await telegram(env, "pinChatMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, message_id: sent.message_id, disable_notification: true }),
    });
  }

  await env.SEND_STATE.put(stateKey, String(sent.message_id), { expirationTtl: 60 * 60 * 24 * 14 });
  console.log(JSON.stringify({ ok: true, slot: slot.name, dateKey, messageId: sent.message_id }));
}

async function runSchedule(env, scheduledTime) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN secret");
  const parts = getKstParts(new Date(scheduledTime));
  const timeKey = `${parts.hour}:${parts.minute}`;
  const slot = SLOTS.get(timeKey);
  if (!slot) return;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  await sendSlot(env, slot, dateKey);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSchedule(env, controller.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, scheduler: "cloudflare-workers", timezone: "Asia/Seoul" });
    }
    return new Response("Not found", { status: 404 });
  },
};
