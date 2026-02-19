# CLAUDE.md — Jarvis Credential Manager

## Project Overview

Jarvis Credential Manager is a **credential gatekeeper** for AI agents. It solves a specific problem: AI agents sometimes need credentials (API keys, passwords, tokens), but they should never have unsupervised access to a secret store.

This service sits between the AI agent (Jarvis/OpenClaw) and 1Password. Every credential request requires **explicit human approval** via Slack interactive messages. No AI is involved in the trust chain — this is an intentionally simple, dumb pipe.

**Philosophy:** Minimal surface area, fail-closed defaults, human-in-the-loop for every credential access. Inspired by [Morpheus](https://github.com/pranavprem/morpheus).

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
2. **Slack notification** — Human gets a Block Kit message with approve/deny buttons
3. **Human decides** — Approve fetches from 1Password and returns it; deny or 10-minute timeout returns 403
4. **Audit trail** — Every request/decision is logged to a dedicated Slack channel

## Architecture

```
src/
├── index.ts              # Express + Slack Bolt server (single port via ExpressReceiver)
├── routes/
│   ├── request.ts        # POST /request — credential request endpoint
│   └── health.ts         # GET /health — healthcheck
├── slack/
│   ├── notify.ts         # Send Block Kit approval request to Slack
│   └── interact.ts       # Handle approve/deny button callbacks
├── store/
│   └── onepassword.ts    # 1Password SDK integration (service account, vault lookup)
├── middleware/
│   ├── auth.ts           # Bearer token validation
│   └── rateLimit.ts      # Rate limiting (10 req/min per IP, in-memory)
├── types.ts              # Shared type definitions (CredentialRequest, CredentialResponse, PendingRequest)
└── __tests__/
    └── request.test.ts   # Vitest tests with mocked Slack and 1Password
```

**Key architectural choice:** Slack Bolt's `ExpressReceiver` is used so that both Slack interactive endpoints and our own REST API run on a single Express app/port. No separate webhook server needed.

## Stack

- **TypeScript** with strict mode
- **Express** (v4) for HTTP
- **@slack/bolt** + **@slack/web-api** for Slack interactive messages
- **@1password/sdk** for credential fetching (service account token, not CLI)
- **Vitest** for testing
- **Docker Compose** for deployment

## Key Design Decisions

These are non-negotiable principles. Do not change them without discussion.

- **No credential caching** — Fetch from 1Password on every approved request. Credentials are never stored in memory beyond the single HTTP response. This is intentional even though it's slower.
- **Auto-deny timeout** — 10 minutes (configurable via `REQUEST_TIMEOUT_MS`). If the human doesn't respond, the request is denied. **Fail closed.**
- **One-time use** — The credential is returned once in the HTTP response body. The agent must use it immediately. No token refresh, no session.
- **LAN-only** — Bind to localhost or private network. Never expose to the public internet.
- **API key auth** — Simple Bearer token. The API key lives in `.env`, not in 1Password (bootstrapping problem — you can't use the service to fetch its own auth).
- **No AI in the trust chain** — This service has zero AI/LLM dependencies. It does not process prompts, make decisions, or use any intelligence. It's a dumb relay with a human gate.
- **Single-port architecture** — Slack Bolt's ExpressReceiver shares the port with the API routes. One process, one port.

## Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Run with tsx watch (hot reload)
pnpm build            # TypeScript compile to dist/
pnpm test             # Run vitest tests
pnpm start            # Run compiled output (production)
```

### Docker

```bash
cp .env.example .env  # Configure your tokens
docker compose up     # Build and run
```

## Testing

Tests use **Vitest** with in-memory mocks for external dependencies:

- **1Password** — `vi.mock('../store/onepassword.js')` returns fake credentials
- **Slack** — `vi.mock('../slack/notify.js')` stubs out message sending

Test coverage focuses on:
- The pending request lifecycle (store → resolve → approve/deny)
- Timeout behavior (auto-deny after `REQUEST_TIMEOUT_MS`)
- Auth middleware (missing header, invalid key, valid key)

Run tests: `pnpm test`

When adding new functionality, always add corresponding tests with mocked externals. Never make real API calls in tests.

## Environment Variables

See `.env.example` for all required variables:

| Variable | Description | Default |
|---|---|---|
| `API_KEY` | Bearer token for agent authentication | (required) |
| `OP_SERVICE_ACCOUNT_TOKEN` | 1Password service account token | (required) |
| `OP_VAULT_ID` | 1Password vault ID to fetch from | (required) |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) | (required) |
| `SLACK_SIGNING_SECRET` | Slack request signing secret | (required) |
| `SLACK_CHANNEL_ID` | Channel for approval requests | (required) |
| `SLACK_LOG_CHANNEL_ID` | Channel for audit logs | (required) |
| `PORT` | Server port | `3847` |
| `REQUEST_TIMEOUT_MS` | Approval timeout in ms | `600000` (10 min) |

## Conventions

### Code Style
- Keep it simple. No ORMs, no heavy frameworks beyond Express.
- Every function should be < 50 lines. If it's longer, split it.
- Use explicit types — no `any` unless absolutely unavoidable.
- Use `.js` extensions in imports (required for NodeNext module resolution).

### Error Handling
- Error messages must be human-readable — they show up in Slack logs and API responses.
- Always catch errors at the boundary (route handlers, interaction handlers) and return structured JSON.
- Use `err instanceof Error ? err.message : 'Unknown error'` pattern for safe error extraction.
- Never let unhandled promise rejections crash the server.

### Logging
- Use `console.log` with a `[context]` prefix, e.g., `[request]`, `[slack]`.
- Log the request ID, service name, scope, and decision — **never the credential value**.
- Slack audit log channel is the primary audit trail.

### Dependencies
- No dependencies on OpenClaw or any AI library. This is a dumb pipe.
- Minimize new dependencies. Prefer built-in Node.js APIs where possible.
- Any new dependency needs a clear justification.

## Security Notes

- **Never log credential values.** Log service name, scope, requester, and decision only.
- **Never cache credentials.** Not in memory, not in a database, not in a file. Fetch from 1Password on every approved request.
- The `.env` file must never be committed. It's in `.gitignore`.
- Rate limiting is per-IP, not per-API-key (simpler, sufficient for LAN).
- Slack request signature verification is mandatory in production (handled by Bolt).
- The 1Password client is initialized lazily (singleton) — the service account token is read from env at first use.

## What NOT To Do

- **Don't cache credentials** — not "temporarily," not "for performance," not at all.
- **Don't log credential values** — not in debug mode, not in error messages, not anywhere.
- **Don't add AI/LLM dependencies** — no langchain, no openai, no inference libraries. This service must remain deterministic and auditable.
- **Don't expose to the public internet** — this is LAN-only by design.
- **Don't add automatic approval** — every credential access requires a human clicking a button.
- **Don't store state in a database** — pending requests live in an in-memory Map and are ephemeral. If the server restarts, all pending requests are lost (and that's fine — fail closed).
