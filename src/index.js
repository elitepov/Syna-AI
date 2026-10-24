// Load and validate environment variables first — before anything else
import "./config/env.js";

import http from "http";
import { createBot } from "./bot/bot.js";

// ── Minimal HTTP server (required by Render Free Web Service) ─────────────────
// Render expects a process that binds to a port. The bot itself runs via
// Telegram long-polling; this server exists only to satisfy Render's health
// check and keep the service marked as "live".
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Syna AI is running");
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`[Syna] HTTP server listening on port ${PORT}`);
});

// ── Telegram bot (long-polling) ───────────────────────────────────────────────
const bot = createBot();

// Graceful shutdown on SIGINT / SIGTERM
process.once("SIGINT", () => {
  console.log("\n[Syna] Shutting down...");
  bot.stop();
  server.close();
});
process.once("SIGTERM", () => {
  console.log("\n[Syna] Shutting down...");
  bot.stop();
  server.close();
});

console.log("[Syna] Starting bot...");

bot.start({
  onStart: (botInfo) => {
    console.log(`[Syna] ✅ Bot is running as @${botInfo.username}`);
  },
});
