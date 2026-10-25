// Load and validate environment variables first — before anything else
import "./config/env.js";

import http from "http";
import { webhookCallback } from "grammy";
import { createBot } from "./bot/bot.js";
import { config } from "./config/env.js";

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = "/telegram-webhook";
const WEBHOOK_URL = config.webhookUrl; // e.g. https://syna-ai.onrender.com

const bot = createBot();

// Tell Telegram where to send updates.
// This is idempotent — safe to call on every startup.
await bot.api.setWebhook(`${WEBHOOK_URL}${WEBHOOK_PATH}`);
console.log(`[Syna] Webhook registered: ${WEBHOOK_URL}${WEBHOOK_PATH}`);

// grammY's built-in Node http adapter turns an incoming POST body into a
// handled update. No Express or extra packages needed.
const handleUpdate = webhookCallback(bot, "http");

const server = http.createServer(async (req, res) => {
  // ── Telegram webhook endpoint ─────────────────────────────────────────────
  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    await handleUpdate(req, res);
    return;
  }

  // ── Health check (Render pings GET / to keep the service alive) ───────────
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Syna AI is running");
    return;
  }

  // ── Everything else ───────────────────────────────────────────────────────
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[Syna] ✅ HTTP server listening on port ${PORT}`);
  console.log(`[Syna] Bot is ready — receiving updates via webhook`);
});

// Graceful shutdown
async function shutdown() {
  console.log("\n[Syna] Shutting down...");
  await bot.api.deleteWebhook();
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
