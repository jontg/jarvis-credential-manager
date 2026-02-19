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

See [docs/setup.md](docs/setup.md) for full setup instructions.

### Quick Start

```bash
cp .env.example .env
# Edit .env with your tokens
docker compose up
```

### Prerequisites

- 1Password service account with access to a dedicated vault
- Slack app with interactive messages enabled
- Docker & Docker Compose

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
