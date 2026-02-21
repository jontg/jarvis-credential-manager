# Jarvis Credential Manager

A lightweight credential gatekeeper for AI agents. Inspired by [Morpheus](https://github.com/pranavprem/morpheus).

## How It Works

```
┌─────────┐     ┌────────────┐     ┌───────┐     ┌───────┐
│ Jarvis  │────▶│ Gatekeeper │────▶│ Slack │────▶│  Jón  │
│ (Agent) │     │   (API)    │     │  Bot  │     │(Human)│
└─────────┘     └────────────┘     └───────┘     └───────┘
                      │                              │
                      ▼                         ✅ / ❌
                ┌────────────┐
                │ 1Password  │
                │  (Service  │
                │  Account)  │
                └────────────┘
```

1. **Agent requests a credential** — `POST /request` with service name, scope, and reason
2. **Slack notification** — Human gets a message with approve/deny buttons
3. **Human decides** — Approve sends the credential back; deny or 10-minute timeout returns 403
4. **Audit trail** — Every request logged to a Slack channel

## Design Principles

- **No AI in the trust chain** — The gatekeeper is intentionally dumb. No LLM, no prompt processing.
- **Human-in-the-loop** — Every credential access requires explicit human approval.
- **Minimal surface area** — API key auth, rate limiting, auto-deny on timeout.
- **LAN-only** — Never exposed to the public internet.

## Stack

- **Runtime:** Node.js + Express
- **Credential Store:** 1Password (via service account token)
- **Notifications:** Slack (interactive messages with buttons)
- **Deployment:** Docker Compose on local machine

## Setup

### Prerequisites

- 1Password service account with access to a dedicated vault
- Slack workspace where you can install apps
- Docker & Docker Compose

### Configuring the Slack App

KeyKeeper uses Slack's **Socket Mode** — the bot connects outbound via WebSocket, so no public URL or tunnel is needed. Perfect for LAN-only setups.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From a manifest**
3. Select your workspace
4. Paste the contents of [`slack-manifest.json`](slack-manifest.json) (switch to JSON mode if needed)
5. Review the permissions and click **Create**
6. **Generate an App-Level Token:**
   - Go to **Basic Information** → **App-Level Tokens**
   - Click **Generate Token and Scopes**, name it (e.g., `socket-mode`), and add the `connections:write` scope
   - Copy the token (`xapp-...`) → set as `SLACK_APP_TOKEN` in `.env`
7. Go to **OAuth & Permissions**, click **Install to Workspace**, and authorize
8. Copy the **Bot User OAuth Token** (`xoxb-...`) → set as `SLACK_BOT_TOKEN` in `.env`

#### Required Slack Channels

Create two channels and invite the KeyKeeper bot to both:

- **Approval channel** — where approval request messages are posted (set `SLACK_CHANNEL_ID`)
- **Audit log channel** — where all request decisions are logged (set `SLACK_LOG_CHANNEL_ID`)

### Quick Start

```bash
cp .env.example .env
# Edit .env with your tokens (see Slack setup above)
docker compose up
```

## API

### Request a Credential

```
POST /request
Authorization: Bearer <api-key>

{
  "service": "greenlight",
  "scope": "card-number",
  "reason": "Buying a book about mushroom taxonomy"
}
```

### Response (on approval)

```json
{
  "status": "approved",
  "credential": {
    "value": "****",
    "fields": {}
  },
  "expiresIn": 60
}
```

The credential is returned once and not cached. The agent must use it immediately.

## License

MIT
