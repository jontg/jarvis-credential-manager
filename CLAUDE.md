# CLAUDE.md — Jarvis Credential Manager

## What This Is

A credential gatekeeper API that mediates between an AI agent (Jarvis/OpenClaw) and a secret store (1Password). Every credential access requires human approval via Slack interactive messages. No AI in the trust chain — this service is intentionally simple.

## Architecture

```
src/
├── index.ts          # Express server entry point
├── routes/
│   ├── request.ts    # POST /request — credential request endpoint
│   └── health.ts     # GET /health — healthcheck
├── slack/
│   ├── notify.ts     # Send approval request to Slack
│   └── interact.ts   # Handle Slack interactive message callbacks
├── store/
│   └── onepassword.ts # 1Password service account integration
├── middleware/
│   ├── auth.ts       # API key validation
│   └── rateLimit.ts  # Rate limiting (10 req/min per IP)
└── types.ts          # Shared type definitions
```

## Stack

- **TypeScript** with strict mode
- **Express** for HTTP
- **@1password/sdk** for credential fetching (service account token, not CLI)
- **@slack/web-api** + **@slack/bolt** for Slack interactive messages
- **Docker Compose** for deployment

## Key Design Decisions

- **No credential caching** — Fetch from 1Password on every approved request. Credentials are never stored in memory beyond the response.
- **Auto-deny timeout** — 10 minutes. If the human doesn't respond, the request is denied. Fail closed.
- **One-time use** — Credential is returned once in the HTTP response. Agent must use it immediately.
- **LAN-only** — Bind to localhost or private network. Never expose publicly.
- **API key auth** — Simple bearer token. The API key is stored in `.env`, not in 1Password (bootstrapping problem).

## Development

```bash
pnpm install
pnpm dev          # Run with tsx watch
pnpm build        # TypeScript compile
pnpm test         # Run tests
```

## Environment Variables

See `.env.example` for all required variables:
- `API_KEY` — Bearer token for agent authentication
- `OP_SERVICE_ACCOUNT_TOKEN` — 1Password service account token
- `OP_VAULT_ID` — 1Password vault ID to fetch from
- `SLACK_BOT_TOKEN` — Slack bot OAuth token
- `SLACK_SIGNING_SECRET` — Slack request signing secret
- `SLACK_CHANNEL_ID` — Channel for approval requests
- `SLACK_LOG_CHANNEL_ID` — Channel for audit logs
- `PORT` — Server port (default: 3847)
- `REQUEST_TIMEOUT_MS` — Approval timeout (default: 600000 = 10 min)

## Conventions

- Keep it simple. No ORMs, no frameworks beyond Express.
- Every function should be < 50 lines. If it's longer, split it.
- Error messages should be human-readable — they show up in Slack logs.
- No dependencies on OpenClaw or any AI library. This is a dumb pipe.
- Tests: use vitest with in-memory mocks for Slack and 1Password.

## Security Notes

- Never log credential values. Log service name, scope, requester, and decision only.
- The `.env` file must never be committed. It's in `.gitignore`.
- Rate limiting is per-IP, not per-API-key (simpler, sufficient for LAN).
- Slack request signature verification is mandatory in production.
