#!/bin/bash
# launch.sh — Wrapper script for launchd
# Pulls secrets from macOS Keychain and starts the credential manager.
#
# To store a secret in Keychain:
#   security add-generic-password -s "jarvis-credential-manager" -a "KEY_NAME" -w "secret-value"
#
# To update an existing secret, add -U:
#   security add-generic-password -U -s "jarvis-credential-manager" -a "KEY_NAME" -w "new-value"

SERVICE="jarvis-credential-manager"

kc() {
  security find-generic-password -s "$SERVICE" -a "$1" -w 2>/dev/null
}

export OP_SERVICE_ACCOUNT_TOKEN=$(kc OP_SERVICE_ACCOUNT_TOKEN)
export SLACK_BOT_TOKEN=$(kc SLACK_BOT_TOKEN)
export SLACK_APP_TOKEN=$(kc SLACK_APP_TOKEN)
export SLACK_CHANNEL_ID=$(kc SLACK_CHANNEL_ID)
export SLACK_LOG_CHANNEL_ID=$(kc SLACK_LOG_CHANNEL_ID)
export API_KEY=$(kc API_KEY)
export OP_VAULT_ID=$(kc OP_VAULT_ID)

cd "$(dirname "$0")/.." || exit 1
exec /usr/local/bin/node dist/index.js
