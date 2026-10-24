import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { config } from "../config/env.js";
import { getSynaResponse, getSynaResponseWithMedia, clearSession } from "../ai/gemini.js";
import { safeReply } from "./format.js";

const MAX_MESSAGE_LENGTH = 4000; // Telegram practical limit is ~4096 chars
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — Telegram bot API download limit

// ── Action definitions ───────────────────────────────────────────────────────
const ACTIONS = {
  analyze: {
    prompt: "Sure! Send me the text, situation, idea, image, or information you want analyzed.",
    prefix:
      "Analyze the following in depth. Identify the key facts, assumptions, problems, root causes, implications, and conclusions where relevant. Be structured but not mechanical.",
  },
  explain: {
    prompt: "Of course! Send me what you'd like explained and I'll break it down clearly.",
    prefix:
      "Explain the following clearly and simply. Don't oversimplify — preserve important nuance — but make it accessible. Use plain language and examples where helpful.",
  },
  compare: {
    prompt: "Got it! Send me the two or more things you want compared.",
    prefix:
      "Compare the following. Focus on the meaningful differences, trade-offs, advantages, and disadvantages of each. End with a clear takeaway or recommendation.",
  },
  summarize: {
    prompt: "Ready! Send me the text or information you want summarized.",
    prefix:
      "Summarize the following. Keep all important information and remove unnecessary detail. Be concise but complete — don't lose key facts.",
  },
  evaluate: {
    prompt: "Sure! Send me the idea, decision, argument, or situation you want evaluated.",
    prefix:
      "Evaluate the following objectively. Cover strengths, weaknesses, risks, and opportunities where relevant. End with a clear overall conclusion.",
  },
};

// ── Per-user pending action state ────────────────────────────────────────────
const pendingActions = new Map();

// ── Inline keyboard ───────────────────────────────────────────────────────────
function buildActionKeyboard() {
  return new InlineKeyboard()
    .text("🔍 Analyze", "action:analyze")
    .text("💡 Explain", "action:explain")
    .row()
    .text("⚖️ Compare", "action:compare")
    .text("📝 Summarize", "action:summarize")
    .row()
    .text("🎯 Evaluate", "action:evaluate");
}

// ── Shared media handler ──────────────────────────────────────────────────────
// Used by both photo and document handlers. Downloads the file, builds the
// instruction (applying any pending action), calls Gemini, and replies.
async function handleMediaMessage(ctx, fileId, mimeType, captionText) {
  const userId = ctx.from?.id;

  await ctx.replyWithChatAction("typing");

  // Download file bytes via grammY's getFile + fetch
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

  let fileBuffer;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > MAX_FILE_BYTES) {
      await ctx.reply("⚠️ That file is too large. Please send something under 20 MB.");
      return;
    }
    fileBuffer = Buffer.from(arrayBuf);
  } catch (err) {
    console.error(`[Syna] Failed to download file for user ${userId}:`, err);
    await ctx.reply("⚠️ I couldn't download the file. Please try again.");
    return;
  }

  // Build the instruction, applying any pending action
  const pendingAction = pendingActions.get(userId) ?? null;
  let instruction = captionText || "Analyze this and respond naturally to the user.";

  if (pendingAction && ACTIONS[pendingAction]) {
    instruction = `[${ACTIONS[pendingAction].prefix}]\n\n${captionText || ""}`.trim();
    pendingActions.delete(userId);
  }

  try {
    const synaReply = await getSynaResponseWithMedia(userId, fileBuffer, mimeType, instruction);
    await safeReply(ctx, synaReply);
  } catch (err) {
    console.error(`[Syna] Error processing media from user ${userId}:`, err);
    if (userId) {
      clearSession(userId);
      pendingActions.delete(userId);
    }
    await ctx.reply("⚠️ Something went wrong processing that file. Please try again.");
  }
}

// ── Bot factory ───────────────────────────────────────────────────────────────
export function createBot() {
  const bot = new Bot(config.telegramBotToken);

  // /start
  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "there";
    const userId = ctx.from?.id;

    if (userId) {
      clearSession(userId);
      pendingActions.delete(userId);
    }

    await ctx.reply(
      `👋 Hey ${name}, I'm <b>Syna</b> — an analytical AI assistant.\n\n` +
        `Send me anything: a news article, a document, an image, or a question.\n\n` +
        `I'll help you cut through the noise and understand what actually matters.\n\n` +
        `<i>Use the buttons below or just type.</i>`,
      {
        parse_mode: "HTML",
        reply_markup: buildActionKeyboard(),
      }
    );
  });

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `<b>What Syna can do right now:</b>\n\n` +
        `📌 Summarize long or complex texts\n` +
        `📊 Explain what happened and why it matters\n` +
        `💡 Break down complicated topics in plain language\n` +
        `🔍 Separate confirmed facts from assumptions\n` +
        `🖼 Analyze images\n` +
        `📄 Read and analyze PDF documents\n` +
        `💬 Answer follow-up questions in context\n` +
        `🌐 Responds in English, Russian, or Uzbek\n\n` +
        `Tap an action button to tell Syna exactly what you need:`,
      {
        parse_mode: "HTML",
        reply_markup: buildActionKeyboard(),
      }
    );
  });

  // ── Inline button callbacks ───────────────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from?.id;

    if (!data.startsWith("action:")) {
      await ctx.answerCallbackQuery();
      return;
    }

    const actionKey = data.slice("action:".length);
    const action = ACTIONS[actionKey];

    if (!action || !userId) {
      await ctx.answerCallbackQuery({ text: "Unknown action." });
      return;
    }

    pendingActions.set(userId, actionKey);
    await ctx.answerCallbackQuery();
    await ctx.reply(action.prompt);
  });

  // ── Photos ────────────────────────────────────────────────────────────────
  bot.on("message:photo", async (ctx) => {
    // Telegram sends multiple sizes — pick the last one (highest resolution)
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];
    const caption = ctx.message.caption?.trim() ?? "";

    await handleMediaMessage(ctx, best.file_id, "image/jpeg", caption);
  });

  // ── Documents (PDF only) ──────────────────────────────────────────────────
  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    const mimeType = doc.mime_type ?? "";

    if (mimeType !== "application/pdf") {
      await ctx.reply(
        "I can currently only read PDF documents.\n\n" +
          "Send me a .pdf file and I'll analyze it. 📄"
      );
      return;
    }

    const caption = ctx.message.caption?.trim() ?? "";
    await handleMediaMessage(ctx, doc.file_id, "application/pdf", caption);
  });

  // ── Normal text messages ──────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text.trim();
    const userId = ctx.from?.id;

    if (!userMessage) return;

    if (userMessage.length > MAX_MESSAGE_LENGTH) {
      await ctx.reply(
        "⚠️ That message is a bit too long for me to handle in one go.\n\n" +
          "Try splitting it into smaller parts, or paste just the most important section."
      );
      return;
    }

    await ctx.replyWithChatAction("typing");

    const pendingAction = pendingActions.get(userId) ?? null;
    let messageToSend = userMessage;

    if (pendingAction && ACTIONS[pendingAction]) {
      messageToSend = `[${ACTIONS[pendingAction].prefix}]\n\n${userMessage}`;
      pendingActions.delete(userId);
    }

    try {
      const synaReply = await getSynaResponse(userId, messageToSend);
      await safeReply(ctx, synaReply);
    } catch (err) {
      console.error(`[Syna] Error processing message from user ${userId}:`, err);
      if (userId) {
        clearSession(userId);
        pendingActions.delete(userId);
      }
      await ctx.reply("⚠️ Something went wrong on my end. Please try again in a moment.");
    }
  });

  // ── Other message types ───────────────────────────────────────────────────
  bot.on("message", async (ctx) => {
    await ctx.reply(
      "I can handle text messages, images, and PDF files.\n\nSend me one of those and I'll get to work. 📝"
    );
  });

  // ── Global error handler ──────────────────────────────────────────────────
  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;

    if (e instanceof GrammyError) {
      console.error(
        `[Syna] Telegram API error for update ${ctx.update.update_id}:`,
        e.description
      );
    } else if (e instanceof HttpError) {
      console.error(`[Syna] HTTP error communicating with Telegram:`, e.message);
    } else {
      console.error(`[Syna] Unexpected error:`, e);
    }
  });

  return bot;
}
