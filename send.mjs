import fs from "node:fs/promises";

const CHAT_ID = "-1002168116733";
const slot = process.argv[2];
const validSlots = new Set(["09-00", "15-00", "19-00", "19-20", "19-30", "20-00"]);
const allowLateSlots = new Set(["09-00", "15-00", "19-20"]);
const eveningLateLimitMs = 10 * 60 * 1000;

if (!validSlots.has(slot)) throw new Error(`Unknown slot: ${slot}`);
if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN");

if (process.env.WAIT_FOR_SLOT === "true") {
  const [hour, minute] = slot.split("-").map(Number);
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const targetUtcMs = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    hour - 9,
    minute,
  );
  const waitMs = targetUtcMs - now.getTime();
  if (waitMs > 0 && waitMs <= 4 * 60 * 60 * 1000) {
    console.log(`Waiting ${Math.ceil(waitMs / 1000)} seconds for ${slot} KST`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  if (!allowLateSlots.has(slot) && waitMs < -eveningLateLimitMs) {
    throw new Error(`Skipped ${slot}: scheduled run started too late`);
  }

  if (allowLateSlots.has(slot) && waitMs < 0) {
    console.log(`Sending late ${slot} slot immediately (${Math.ceil(-waitMs / 1000)} seconds late)`);
  }
}

const api = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const caption = (await fs.readFile(new URL(`./messages/${slot}.txt`, import.meta.url), "utf8")).trim();
const imageUrl = new URL(`./images/${slot}.png`, import.meta.url);
let messageId;

try {
  const image = await fs.readFile(imageUrl);
  const form = new FormData();
  form.set("chat_id", CHAT_ID);
  form.set("caption", caption);
  form.set("photo", new Blob([image], { type: "image/png" }), `${slot}.png`);
  const response = await fetch(`${api}/sendPhoto`, { method: "POST", body: form });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || "sendPhoto failed");
  messageId = result.result.message_id;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  const response = await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: caption }),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || "sendMessage failed");
  messageId = result.result.message_id;
}

if (slot === "09-00") {
  const response = await fetch(`${api}/pinChatMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, message_id: messageId, disable_notification: true }),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || "pinChatMessage failed");
}

console.log(JSON.stringify({ ok: true, slot, messageId }));
