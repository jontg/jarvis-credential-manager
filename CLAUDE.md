# CLAUDE.md — Jarvis Credential Manager

## What This Is

A credential gatekeeper API that mediates between an AI agent (Jarvis/OpenClaw) and a secret store (1Password). Every credential access requires human approval via Slack interactive messages. No AI in the trust chain — this service is intentionally simple.

## Architecture

```
src/
├── index.ts          # Socket Mode Slack app + standalone Express server
├── routes/
│   ├── request.ts    # POST /request — credential request endpoint
│   └── health.ts     # GET /health — healthcheck
├── slack/
│   ├── notify.ts     # Send approval request to Slack
│   └── interact.ts   # Handle Slack interactive message callbacks (via Socket Mode)
├── store/
│   └── onepassword.ts # 1Password service account integration
├── middleware/
│   ├── auth.ts       # API key validation
│   └── rateLimit.ts  # Rate limiting (10 req/min per IP)
├── types.ts          # Shared type definitions
└── ...
deploy/
├── launch.sh                          # Wrapper script (pulls secrets from Keychain)
└── com.jarvis.credential-manager.plist # launchd plist for ~/Library/LaunchAgents/
```

## Stack

- **TypeScript** with strict mode
- **Express** for HTTP REST API (credential requests, health check)
- **@slack/bolt** in **Socket Mode** for Slack interactions (approve/deny buttons)
- **@1password/sdk** for credential fetching (service account token, not CLI)

### Socket Mode Architecture

Slack interactions (approve/deny button clicks) use **Socket Mode** — an outbound WebSocket from this service to Slack's servers. This means:

- **No public internet exposure needed.** The service only makes outbound connections.
- **No ngrok, no tunnels, no public URLs.** Runs entirely on the LAN.
- **No request signature verification** for Slack interactions (Socket Mode handles auth over the WebSocket). `SLACK_SIGNING_SECRET` is only needed if you add direct HTTP webhook endpoints.

The REST API (POST `/request`, GET `/health`) runs on a separate standalone Express server on the configured port. This is what the AI agent calls to request credentials.

## Deployment

### launchd (macOS)

The service runs as a **launchd user agent** — starts on login, restarts on crash.

**Setup:**

1. Build the project: `pnpm build`

2. Store all secrets in macOS Keychain:
   ```bash
   security add-generic-password -s "jarvis-credential-manager" -a "OP_SERVICE_ACCOUNT_TOKEN" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "SLACK_BOT_TOKEN" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "SLACK_APP_TOKEN" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "SLACK_SIGNING_SECRET" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "SLACK_CHANNEL_ID" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "SLACK_LOG_CHANNEL_ID" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "API_TOKEN" -w "<value>"
   security add-generic-password -s "jarvis-credential-manager" -a "OP_VAULT_ID" -w "<value>"
   ```
   To update an existing secret, add `-U` flag.

3. Install the plist:
   ```bash
   cp deploy/com.jarvis.credential-manager.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.jarvis.credential-manager.plist
   ```

4. Check logs:
   ```bash
   tail -f ~/Library/Logs/jarvis-credential-manager.log
   ```

5. Manage:
   ```bash
   launchctl stop com.jarvis.credential-manager
   launchctl start com.jarvis.credential-manager
   launchctl unload ~/Library/LaunchAgents/com.jarvis.credential-manager.plist
   ```

> **Note:** The `deploy/launch.sh` wrapper pulls all secrets from Keychain at launch time. Non-secret config (PORT, REQUEST_TIMEOUT_MS) is set in the plist's EnvironmentVariables dict.

## Key Design Decisions

- **No credential caching** — Fetch from 1Password on every approved request. Credentials are never stored in memory beyond the response.
- **Auto-deny timeout** — 10 minutes. If the human doesn't respond, the request is denied. Fail closed.
- **One-time use** — Credential is returned once in the HTTP response. Agent must use it immediately.
- **LAN-only** — Bind to localhost or private network. Never expose publicly.
- **API key auth** — Simple bearer token for the REST API.

## Development

```bash
pnpm install
pnpm dev          # Run with tsx watch
pnpm build        # TypeScript compile
pnpm test         # Run tests
```

## Environment Variables

See `.env.example` for all required variables:

| Variable | Description |
|---|---|
| `API_KEY` | Bearer token for agent authentication |
| `OP_SERVICE_ACCOUNT_TOKEN` | 1Password service account token |
| `OP_VAULT_ID` | 1Password vault ID to fetch from |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-...`). Generate in Slack app settings → Basic Information → App-Level Tokens with `connections:write` scope. |
| `SLACK_SIGNING_SECRET` | Slack request signing secret. **Not used by Socket Mode** — only needed if you add direct HTTP webhook endpoints. |
| `SLACK_CHANNEL_ID` | Channel for approval requests |
| `SLACK_LOG_CHANNEL_ID` | Channel for audit logs |
| `PORT` | REST API server port (default: 3847) |
| `REQUEST_TIMEOUT_MS` | Approval timeout (default: 600000 = 10 min) |

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
- Secrets are stored in macOS Keychain, not in files or environment config.
