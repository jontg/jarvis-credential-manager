import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WebClient } from '@slack/web-api';
import type { PendingRequest, CredentialRequest, CredentialResponse } from '../types.js';
import { sendApprovalRequest } from '../slack/notify.js';
import { loadRules, matchRule } from '../autoApprove.js';
import { fetchCredential } from '../store/onepassword.js';

export function createRequestRouter(
  slackClient: WebClient,
  pendingRequests: Map<string, PendingRequest>,
): Router {
  const router = Router();
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS ?? '600000', 10);
  const channelId = process.env.SLACK_CHANNEL_ID ?? '';
  const logChannelId = process.env.SLACK_LOG_CHANNEL_ID ?? '';

  router.post('/request', async (req, res) => {
    const { service, scope, reason } = req.body as CredentialRequest;

    if (!service || !scope || !reason) {
      res.status(400).json({ error: 'Missing required fields: service, scope, reason' });
      return;
    }

    const requestId = uuidv4();
    console.log(`[request] ${requestId} — ${service} (${scope}): ${reason}`);

    // Auto-approval pre-check
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(__dirname, '../../config/auto-approve.json');
    const rules = loadRules(configPath);
    const matchedRule = matchRule({ service, scope, reason }, rules);

    if (matchedRule) {
      console.log(`[request] ${requestId} — auto-approved by rule: ${matchedRule.id}`);
      try {
        const { credential, fields } = await fetchCredential(service, scope);

        if (logChannelId) {
          await slackClient.chat.postMessage({
            channel: logChannelId,
            text: `🤖 Auto-approved: \`${service}\` (\`${scope}\`) — rule: ${matchedRule.id}. Reason: ${reason}`,
          });
        }

        res.json({ approved: true, credential, fields, expiresIn: 60 });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[request] ${requestId} — auto-approval failed:`, msg);
        res.status(500).json({ error: `Auto-approval failed: ${msg}` });
        return;
      }
    }

    const responsePromise = new Promise<CredentialResponse>((resolve, reject) => {
      const pending: PendingRequest = {
        id: requestId,
        service,
        scope,
        reason,
        createdAt: Date.now(),
        resolve,
        reject,
      };
      pendingRequests.set(requestId, pending);

      // Auto-deny on timeout
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({ approved: false, error: 'Request timed out (no response)' });
        }
      }, timeoutMs);
    });

    try {
      await sendApprovalRequest(slackClient, channelId, requestId, service, scope, reason);
    } catch (err) {
      pendingRequests.delete(requestId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: `Failed to send Slack notification: ${msg}` });
      return;
    }

    const response = await responsePromise;

    if (response.approved) {
      res.json(response);
    } else {
      res.status(403).json(response);
    }
  });

  return router;
}
