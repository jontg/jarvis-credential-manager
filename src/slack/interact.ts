import type { App } from '@slack/bolt';
import type { PendingRequest } from '../types.js';
import { fetchCredential } from '../store/onepassword.js';

export function registerInteractions(app: App, pendingRequests: Map<string, PendingRequest>): void {
  app.action('approve_credential', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const requestId = action.value ?? '';
    const pending = pendingRequests.get(requestId);

    if (!pending) {
      const channelId = 'channel' in body && body.channel ? body.channel.id : undefined;
      if (channelId) {
        await client.chat.postMessage({ channel: channelId, text: '⚠️ Request not found or already expired.' });
      }
      return;
    }

    try {
      const { credential, fields } = await fetchCredential(pending.service, pending.scope);
      pendingRequests.delete(requestId);
      pending.resolve({ approved: true, credential, fields, expiresIn: 60 });

      if ('message' in body && body.channel?.id && body.message?.ts) {
        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts,
          text: `✅ Approved: ${pending.service} (${pending.scope})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *Approved* by <@${body.user.id}>\n\n*Service:* \`${pending.service}\`\n*Scope:* \`${pending.scope}\`\n*Reason:* ${pending.reason}`,
              },
            },
          ],
        });
      }

      const logChannel = process.env.SLACK_LOG_CHANNEL_ID;
      if (logChannel) {
        await client.chat.postMessage({
          channel: logChannel,
          text: `📋 Credential approved: ${pending.service} (${pending.scope}) by <@${body.user.id}>. Reason: ${pending.reason}`,
        });
      }
    } catch (err) {
      pendingRequests.delete(requestId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      pending.resolve({ approved: false, error: `Failed to fetch credential: ${msg}` });
    }
  });

  app.action('deny_credential', async ({ action, ack, client, body }) => {
    await ack();
    if (action.type !== 'button') return;

    const requestId = action.value ?? '';
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    pendingRequests.delete(requestId);
    pending.resolve({ approved: false, error: 'Request denied by human' });

    if ('message' in body && body.channel?.id && body.message?.ts) {
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: `❌ Denied: ${pending.service} (${pending.scope})`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ *Denied* by <@${body.user.id}>\n\n*Service:* \`${pending.service}\`\n*Scope:* \`${pending.scope}\`\n*Reason:* ${pending.reason}`,
            },
          },
        ],
      });
    }

    const logChannel = process.env.SLACK_LOG_CHANNEL_ID;
    if (logChannel) {
      await client.chat.postMessage({
        channel: logChannel,
        text: `📋 Credential denied: ${pending.service} (${pending.scope}) by <@${body.user.id}>. Reason: ${pending.reason}`,
      });
    }
  });
}
