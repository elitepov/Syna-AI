/**
 * Temporary diagnostic script — lists Gemini models available to the configured API key.
 * Run with: node list-models.js
 * Safe to delete after use.
 */

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

console.log("Fetching available models...\n");

const pager = await ai.models.list();

let count = 0;
for await (const model of pager) {
  console.log(`• ${model.name}`);
  count++;
}

console.log(`\nTotal: ${count} model(s)`);
