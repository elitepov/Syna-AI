# Syna AI

An analytical Telegram AI assistant powered by Google Gemini.

Syna helps you understand complex information — it summarizes, extracts key facts, explains what matters, and answers follow-up questions naturally. It supports English, Russian, and Uzbek.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

```bash
copy .env.example .env
```

### 3. Add your Telegram bot token

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Run `/newbot` and follow the steps
3. Copy the token and paste it into `.env`:

```
TELEGRAM_BOT_TOKEN=your_token_here
```

### 4. Get a Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account and create a new API key (free, no billing required)
3. Paste it into `.env`:

```
GEMINI_API_KEY=your_key_here
```

### 5. Choose the model

```
GEMINI_MODEL=gemini-3.8-flash
```

Free-tier options (no credit card required):

| Model | Notes |
|---|---|
| `gemini-3.8-flash` | Current stable model — **recommended** |
| `gemini-3.6-flash` | Previous stable Flash model |
| `gemini-2.5-pro` | Most capable, lower free-tier rate limits |

### 6. Run the bot

```bash
node src/index.js
```

For development with auto-restart on file changes:

```bash
node --watch src/index.js
```

> **Note for Windows users:** If `npm run dev` fails due to PowerShell execution policy, use `node` directly as shown above.

### 7. Test it

1. Open Telegram and find your bot
2. Send `/start` — you should get a welcome message
3. Send any text — Syna will analyze and respond

---

## Project Structure

```
Syna-AI/
├── src/
│   ├── bot/
│   │   └── bot.js          # Telegram bot, command handlers, message routing
│   ├── ai/
│   │   ├── gemini.js       # Google Gemini API client + chat session management
│   │   └── synaPrompt.js   # Syna's personality and system instructions
│   ├── config/
│   │   └── env.js          # Environment variable loading and validation
│   └── index.js            # Entry point — starts the bot
├── .env.example            # Template for environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## How it works

1. User sends a message to the Telegram bot
2. grammY receives it and triggers the message handler
3. Syna sends a "typing..." indicator to Telegram
4. The message is passed to `getSynaResponse()` in `gemini.js`
5. A per-user Gemini Chat session is retrieved (or created for new users)
6. The Chat session sends the message to the Gemini API — conversation history is tracked automatically by the session object
7. Gemini returns Syna's response
8. The response is sent back to the user in Telegram

Conversation history is kept in memory per user for the lifetime of the bot process. History resets when the bot restarts, or when a user sends `/start`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `GEMINI_API_KEY` | ✅ | API key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | ✅ | Model name, e.g. `gemini-2.5-flash` |

---

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message (also resets conversation) |
| `/help` | What Syna can currently do |
| _(any text)_ | Syna analyzes and responds |

---

## Coming later

- Web search
- URL reading
- File/document analysis
- Persistent memory
