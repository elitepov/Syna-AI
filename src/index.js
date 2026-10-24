// Load and validate environment variables first — before anything else
import "./config/env.js";

import { createBot } from "./bot/bot.js";

const bot = createBot();

// Graceful shutdown on SIGINT / SIGTERM
process.once("SIGINT", () => {
  console.log("\n[Syna] Shutting down...");
  bot.stop();
});
process.once("SIGTERM", () => {
  console.log("\n[Syna] Shutting down...");
  bot.stop();
});

console.log("[Syna] Starting bot...");

bot.start({
  onStart: (botInfo) => {
    console.log(`[Syna] ✅ Bot is running as @${botInfo.username}`);
  },
});
