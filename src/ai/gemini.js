import { GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { config } from "../config/env.js";
import { SYNA_SYSTEM_PROMPT } from "./synaPrompt.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Per-user chat sessions — Gemini's Chat object tracks history internally.
// Key: Telegram user ID (number), Value: Chat session instance
const userChatSessions = new Map();

/**
 * Returns the existing chat session for a user, or creates a fresh one.
 * Each session carries the full conversation history in memory and has
 * Syna's system instructions baked in at creation time.
 *
 * @param {number} userId - Telegram user ID
 * @returns {Chat} - Gemini Chat session
 */
function getOrCreateSession(userId) {
  if (!userChatSessions.has(userId)) {
    const chat = ai.chats.create({
      model: config.geminiModel,
      config: {
        systemInstruction: SYNA_SYSTEM_PROMPT,
        // Use lowest thinking level to minimize latency for conversational use.
        thinkingConfig: {
          thinkingLevel: "low",
        },
        // Google Search grounding temporarily disabled — causes 429 on free tier.
        // tools: [{ googleSearch: {} }],
      },
    });
    userChatSessions.set(userId, chat);
  }
  return userChatSessions.get(userId);
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000]; // delay before attempt 2, then attempt 3

/**
 * Returns true for errors that are safe to retry (transient 503 / service unavailable).
 * Permanent client errors (400, 401, 403, 404) are not retried.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (!err || typeof err !== "object") return false;

  // @google/genai surfaces HTTP status on err.status (number) or err.statusCode,
  // and includes the text "503" / "unavailable" in the message.
  const status = err.status ?? err.statusCode ?? 0;
  if (status === 503) return true;

  // Fallback: check the error message string for known transient signals
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded");
}

/**
 * Sends a message to Gemini within the user's ongoing chat session.
 * Retries up to MAX_ATTEMPTS times on transient 503 errors with exponential backoff.
 * Conversation history is managed automatically by the Chat object.
 *
 * @param {number} userId - Telegram user ID (used to retrieve/create the session)
 * @param {string} userMessage - The user's latest message text
 * @returns {Promise<string>} - Syna's response text
 */
export async function getSynaResponse(userId, userMessage) {
  const chat = getOrCreateSession(userId);
  let lastError;

  console.log("[Syna] Gemini request started");
  const requestStart = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    try {
      const response = await chat.sendMessage({ message: userMessage });

      const text = response.text;
      if (!text || text.trim() === "") {
        throw new Error("Gemini returned an empty response.");
      }

      const elapsed = ((Date.now() - requestStart) / 1000).toFixed(2);
      console.log(`[Syna] Gemini response received in ${elapsed}s`);
      return text.trim();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      const attemptElapsed = ((Date.now() - attemptStart) / 1000).toFixed(2);
      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.warn(`[Syna] Gemini 503 on attempt ${attempt}/${MAX_ATTEMPTS} after ${attemptElapsed}s, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but satisfies linters
  throw lastError;
}

/**
 * Clears the chat session for a user (e.g. on /start).
 * The next message will create a fresh session.
 *
 * @param {number} userId - Telegram user ID
 */
export function clearSession(userId) {
  userChatSessions.delete(userId);
}

/**
 * Sends a message that includes a binary file (image or PDF) to Gemini.
 * The file bytes are passed as an inline base64 Part — no File API needed.
 * The text instruction is sent alongside the file in the same turn.
 *
 * Uses the same per-user chat session as getSynaResponse() so conversation
 * history is preserved across text and media turns.
 *
 * @param {number} userId - Telegram user ID
 * @param {Buffer} fileBuffer - Raw file bytes
 * @param {string} mimeType  - MIME type, e.g. "image/jpeg" or "application/pdf"
 * @param {string} instruction - Text instruction to accompany the file
 * @returns {Promise<string>} - Syna's response text
 */
export async function getSynaResponseWithMedia(userId, fileBuffer, mimeType, instruction) {
  const chat = getOrCreateSession(userId);
  let lastError;

  console.log(`[Syna] Gemini media request started (${mimeType})`);
  const requestStart = Date.now();

  // Build the Part array: inline file data + text instruction
  const filePart = createPartFromBase64(fileBuffer.toString("base64"), mimeType);
  const textPart = { text: instruction };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    try {
      const response = await chat.sendMessage({ message: [filePart, textPart] });

      const text = response.text;
      if (!text || text.trim() === "") {
        throw new Error("Gemini returned an empty response.");
      }

      const elapsed = ((Date.now() - requestStart) / 1000).toFixed(2);
      console.log(`[Syna] Gemini media response received in ${elapsed}s`);
      return text.trim();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      const attemptElapsed = ((Date.now() - attemptStart) / 1000).toFixed(2);
      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.warn(
        `[Syna] Gemini 503 on media attempt ${attempt}/${MAX_ATTEMPTS} after ${attemptElapsed}s, retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
