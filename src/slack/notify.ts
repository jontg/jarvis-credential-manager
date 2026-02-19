import type { WebClient } from '@slack/web-api';

export async function sendApprovalRequest(
  slackClient: WebClient,
  channelId: string,
  requestId: string,
  service: string,
  scope: string,
  reason: string,
): Promise<string | undefined> {
  const result = await slackClient.chat.postMessage({
    channel: channelId,
    text: `Credential request: ${service} (${scope})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔐 *Credential Request*\n\n*Service:* \`${service}\`\n*Scope:* \`${scope}\`\n*Reason:* ${reason}`,
        },
      },
      {
        type: 'actions',
        block_id: `credential_request_${requestId}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary',
            action_id: 'approve_credential',
            value: requestId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Deny' },
            style: 'danger',
            action_id: 'deny_credential',
            value: requestId,
          },
        ],
      },
    ],
  });

  return result.ts;
}
