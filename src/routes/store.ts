import { Router } from 'express';
import type { WebClient } from '@slack/web-api';
import { storeCredential } from '../store/onepassword.js';

export interface StoreRequest {
  service: string;
  vault?: string;
  fields: Record<string, string>;
  reason: string;
}

export function createStoreRouter(slackClient: WebClient): Router {
  const router = Router();
  const logChannelId = process.env.SLACK_LOG_CHANNEL_ID ?? '';

  router.post('/store', async (req, res) => {
    const { service, vault, fields, reason } = req.body as StoreRequest;

    if (!service || typeof service !== 'string') {
      res.status(400).json({ error: 'Missing required field: service' });
      return;
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      res.status(400).json({ error: 'Missing required field: fields (must be non-empty object)' });
      return;
    }
    if (!reason || typeof reason !== 'string') {
      res.status(400).json({ error: 'Missing required field: reason' });
      return;
    }

    const fieldNames = Object.keys(fields);
    console.log(`[store] Writing to "${service}" — fields: ${fieldNames.join(', ')} — reason: ${reason}`);

    try {
      const action = await storeCredential(service, fields, vault);

      if (logChannelId) {
        const icon = action === 'created' ? '📝' : '✏️';
        await slackClient.chat.postMessage({
          channel: logChannelId,
          text: `${icon} Credential ${action}: \`${service}\` — fields: ${fieldNames.map((f) => `\`${f}\``).join(', ')} — reason: ${reason}`,
        });
      }

      res.json({ ok: true, action, service });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[store] Failed to write "${service}":`, msg);

      if (logChannelId) {
        await slackClient.chat.postMessage({
          channel: logChannelId,
          text: `❌ Credential store failed: \`${service}\` — ${msg}`,
        }).catch(() => {/* best-effort */});
      }

      res.status(500).json({ error: `Failed to store credential: ${msg}` });
    }
  });

  return router;
}
