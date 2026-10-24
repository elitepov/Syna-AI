/**
 * format.js
 * Converts Gemini's Markdown output to Telegram-compatible HTML.
 *
 * Rules:
 *  - Escape raw HTML characters first so Gemini text can't inject tags.
 *  - Preserve fenced code blocks verbatim (``` ... ```).
 *  - Convert **bold**, *italic*, `inline code`, and # headings.
 *  - Leave bullet/numbered lists as-is (they read fine as plain text).
 *  - Return the HTML string, or the original plain text if conversion fails.
 */

// Characters Telegram's HTML parser treats as markup — must be escaped first.
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Converts a Markdown string to Telegram HTML.
 *
 * @param {string} text - Raw Markdown from Gemini
 * @returns {string} - Telegram-safe HTML string
 */
export function mdToHtml(text) {
  if (!text) return "";

  // ── Step 1: Extract fenced code blocks, replace with placeholders ──────────
  // This prevents any Markdown processing from touching code block contents.
  const codeBlocks = [];
  const withCodePlaceholders = text.replace(
    /```(?:\w+)?\n?([\s\S]*?)```/g,
    (_, code) => {
      const index = codeBlocks.push(escapeHtml(code.trimEnd())) - 1;
      return `\x00CODE${index}\x00`;
    }
  );

  // ── Step 2: Escape HTML in the remaining (non-code) text ───────────────────
  let result = escapeHtml(withCodePlaceholders);

  // ── Step 3: Inline code (`code`) ──────────────────────────────────────────
  // Must come before bold/italic so backticks aren't misread as asterisks.
  result = result.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);

  // ── Step 4: Bold (**text** or __text__) ────────────────────────────────────
  // Use a non-greedy match and require at least one non-space char inside.
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");

  // ── Step 5: Italic (*text* or _text_) ─────────────────────────────────────
  // Only match single * or _ that aren't part of ** or __ (already consumed).
  result = result.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  result = result.replace(/_([^_\n]+)_/g, "<i>$1</i>");

  // ── Step 6: Headings (# Heading → <b>Heading</b>) ─────────────────────────
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // ── Step 7: Restore fenced code blocks as <pre><code>...</code></pre> ──────
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    return `<pre><code>${codeBlocks[parseInt(i, 10)]}</code></pre>`;
  });

  return result;
}

/**
 * Safely sends a Telegram reply using HTML parse mode.
 * Falls back to plain text if Telegram rejects the HTML.
 *
 * @param {import("grammy").Context} ctx - grammY context
 * @param {string} text - Raw Markdown text from Gemini
 * @param {object} [extra={}] - Additional ctx.reply options (e.g. reply_markup)
 */
export async function safeReply(ctx, text, extra = {}) {
  const html = mdToHtml(text);

  try {
    await ctx.reply(html, { parse_mode: "HTML", ...extra });
  } catch (err) {
    // If Telegram rejects the HTML (malformed entity), fall back to plain text.
    const isParseError =
      err?.description?.includes("can't parse") ||
      err?.message?.includes("can't parse");

    if (isParseError) {
      console.warn("[Syna] HTML parse error from Telegram, falling back to plain text.");
      await ctx.reply(text, extra);
    } else {
      throw err;
    }
  }
}
