import "dotenv/config";

const REQUIRED_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "WEBHOOK_URL",
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("\n❌ Missing required environment variables:\n");
    missing.forEach((key) => console.error(`   • ${key}`));
    console.error(
      "\n👉 Copy .env.example to .env and fill in the missing values.\n"
    );
    process.exit(1);
  }
}

validateEnv();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  webhookUrl: process.env.WEBHOOK_URL,
};
