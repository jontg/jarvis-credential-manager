#!/bin/bash
# reseed-keychain.sh — Re-seed KeyKeeper secrets into macOS Keychain
#
# Run this when the keychain entries are missing (e.g. after OS update).
# After running, restart the service:
#   launchctl kickstart -k gui/$(id -u)/com.jarvis.credential-manager
#
# Usage:
#   SLACK_BOT_TOKEN=xoxb-... \
#   SLACK_APP_TOKEN=xapp-... \
#   OP_SERVICE_ACCOUNT_TOKEN=ops_... \
#   OP_VAULT_ID=abc123 \
#   SLACK_LOG_CHANNEL_ID=C0XXXXXX \
#   bash deploy/reseed-keychain.sh

set -e

SERVICE="jarvis-credential-manager"

# Known/stable values (pre-filled)
API_KEY="${API_KEY:-558ee2f8403a6c4aeab0d45c309648d18d83c6c92aacc6c0e755f51dca131e06}"
SLACK_CHANNEL_ID="${SLACK_CHANNEL_ID:-C0AEWM057R9}"

# Required — must be set as env vars
: "${SLACK_BOT_TOKEN:?SLACK_BOT_TOKEN is required (xoxb-...)}"
: "${SLACK_APP_TOKEN:?SLACK_APP_TOKEN is required (xapp-...)}"
: "${OP_SERVICE_ACCOUNT_TOKEN:?OP_SERVICE_ACCOUNT_TOKEN is required (ops_...)}"
: "${OP_VAULT_ID:?OP_VAULT_ID is required}"
: "${SLACK_LOG_CHANNEL_ID:?SLACK_LOG_CHANNEL_ID is required}"

seed() {
  local key="$1" val="$2"
  security add-generic-password -U -s "$SERVICE" -a "$key" -w "$val"
  echo "✅ $key"
}

echo "Seeding KeyKeeper secrets into macOS Keychain..."
seed SLACK_BOT_TOKEN          "$SLACK_BOT_TOKEN"
seed SLACK_APP_TOKEN          "$SLACK_APP_TOKEN"
seed SLACK_CHANNEL_ID         "$SLACK_CHANNEL_ID"
seed SLACK_LOG_CHANNEL_ID     "$SLACK_LOG_CHANNEL_ID"
seed API_KEY                  "$API_KEY"
seed OP_SERVICE_ACCOUNT_TOKEN "$OP_SERVICE_ACCOUNT_TOKEN"
seed OP_VAULT_ID              "$OP_VAULT_ID"

echo ""
echo "All secrets stored. Restarting service..."
launchctl kickstart -k "gui/$(id -u)/com.jarvis.credential-manager"
echo "Done. Check health: curl http://localhost:3847/health"
