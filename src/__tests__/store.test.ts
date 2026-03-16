import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { WebClient } from '@slack/web-api';

vi.mock('../store/onepassword.js', () => ({
  storeCredential: vi.fn(),
}));

const mockPostMessage = vi.fn().mockResolvedValue({ ok: true });
const mockSlackClient = {
  chat: { postMessage: mockPostMessage },
} as unknown as WebClient;

import { storeCredential } from '../store/onepassword.js';
import { createStoreRouter } from '../routes/store.js';

/** Helper: call the /store handler directly by extracting it from the router */
async function callStore(
  body: unknown,
  env: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);

  let responseStatus = 200;
  let responseBody: unknown = {};

  const req = { body } as Request;
  const res = {
    status(code: number) { responseStatus = code; return this; },
    json(data: unknown) { responseBody = data; return this; },
  } as unknown as Response;

  const router = createStoreRouter(mockSlackClient);
  // Find the /store POST handler (layer index 0)
  const layer = (router as unknown as { stack: { route?: { path: string; stack: { handle: Function }[] } }[] }).stack
    .find((l) => l.route?.path === '/store');
  const handler = layer?.route?.stack[0]?.handle;
  if (!handler) throw new Error('Could not find /store handler');

  await handler(req, res, () => {});

  Object.assign(process.env, originalEnv);
  return { status: responseStatus, body: responseBody };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SLACK_LOG_CHANNEL_ID = 'C_LOG';
});

describe('POST /store handler', () => {
  it('returns 400 if service is missing', async () => {
    const { status, body } = await callStore({ fields: { password: 'abc' }, reason: 'test' });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/service/);
  });

  it('returns 400 if fields is empty', async () => {
    const { status, body } = await callStore({ service: 'Test', fields: {}, reason: 'test' });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/fields/);
  });

  it('returns 400 if reason is missing', async () => {
    const { status, body } = await callStore({ service: 'Test', fields: { password: 'abc' } });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/reason/);
  });

  it('creates a new item and returns created', async () => {
    vi.mocked(storeCredential).mockResolvedValue('created');

    const { status, body } = await callStore({
      service: 'Amazon',
      fields: { username: 'me@example.com', password: 'secret123' },
      reason: 'new account',
    });

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'created', service: 'Amazon' });
    expect(storeCredential).toHaveBeenCalledWith('Amazon', { username: 'me@example.com', password: 'secret123' }, undefined);

    // Audit log was sent with field names but NOT values
    expect(mockPostMessage).toHaveBeenCalledOnce();
    const logText: string = mockPostMessage.mock.calls[0][0].text;
    expect(logText).toContain('Amazon');
    expect(logText).toContain('username');
    expect(logText).toContain('password');
    expect(logText).not.toContain('secret123');
    expect(logText).not.toContain('me@example.com');
  });

  it('updates an existing item and returns updated', async () => {
    vi.mocked(storeCredential).mockResolvedValue('updated');

    const { status, body } = await callStore({
      service: 'Amazon',
      fields: { password: 'newpassword' },
      reason: 'password rotation',
    });

    expect(status).toBe(200);
    expect((body as { action: string }).action).toBe('updated');
  });

  it('returns 500 if storeCredential throws', async () => {
    vi.mocked(storeCredential).mockRejectedValue(new Error('1Password unreachable'));

    const { status, body } = await callStore({
      service: 'Amazon',
      fields: { password: 'abc' },
      reason: 'test',
    });

    expect(status).toBe(500);
    expect((body as { error: string }).error).toMatch(/1Password unreachable/);
  });

  it('passes optional vault override to storeCredential', async () => {
    vi.mocked(storeCredential).mockResolvedValue('created');

    await callStore({
      service: 'Test',
      vault: 'MyVault',
      fields: { token: 'abc' },
      reason: 'test',
    });

    expect(storeCredential).toHaveBeenCalledWith('Test', { token: 'abc' }, 'MyVault');
  });

  it('skips Slack log when SLACK_LOG_CHANNEL_ID is unset', async () => {
    vi.mocked(storeCredential).mockResolvedValue('created');
    delete process.env.SLACK_LOG_CHANNEL_ID;

    await callStore({ service: 'Test', fields: { key: 'val' }, reason: 'test' });
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});
