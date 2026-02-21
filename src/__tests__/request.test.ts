import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { PendingRequest, CredentialResponse } from '../types.js';

// Mock 1Password
vi.mock('../store/onepassword.js', () => ({
  fetchCredential: vi.fn().mockResolvedValue({
    credential: 'mock-secret-value',
    fields: { api_key: 'mock-field' },
  }),
}));

// Mock Slack notify
vi.mock('../slack/notify.js', () => ({
  sendApprovalRequest: vi.fn().mockResolvedValue('mock-ts'),
}));

describe('PendingRequest Map', () => {
  let pendingRequests: Map<string, PendingRequest>;

  beforeEach(() => {
    pendingRequests = new Map();
  });

  it('should store and retrieve a pending request', () => {
    const id = uuidv4();
    const pending: PendingRequest = {
      id,
      service: 'github',
      scope: 'repo',
      reason: 'Deploy fix',
      createdAt: Date.now(),
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    pendingRequests.set(id, pending);
    expect(pendingRequests.has(id)).toBe(true);
    expect(pendingRequests.get(id)?.service).toBe('github');
  });

  it('should resolve a pending request on approval', async () => {
    const id = uuidv4();
    let capturedResponse: CredentialResponse | undefined;

    const responsePromise = new Promise<CredentialResponse>((resolve) => {
      pendingRequests.set(id, {
        id,
        service: 'github',
        scope: 'repo',
        reason: 'Test',
        createdAt: Date.now(),
        resolve,
        reject: vi.fn(),
      });
    });

    // Simulate approval
    const pending = pendingRequests.get(id)!;
    pendingRequests.delete(id);
    pending.resolve({ approved: true, credential: 'secret', expiresIn: 60 });

    capturedResponse = await responsePromise;
    expect(capturedResponse.approved).toBe(true);
    expect(capturedResponse.credential).toBe('secret');
    expect(capturedResponse.expiresIn).toBe(60);
  });

  it('should resolve with denied on rejection', async () => {
    const id = uuidv4();

    const responsePromise = new Promise<CredentialResponse>((resolve) => {
      pendingRequests.set(id, {
        id,
        service: 'aws',
        scope: 'readonly',
        reason: 'Audit',
        createdAt: Date.now(),
        resolve,
        reject: vi.fn(),
      });
    });

    const pending = pendingRequests.get(id)!;
    pendingRequests.delete(id);
    pending.resolve({ approved: false, error: 'Request denied by human' });

    const response = await responsePromise;
    expect(response.approved).toBe(false);
    expect(response.error).toBe('Request denied by human');
  });

  it('should timeout and auto-deny', async () => {
    vi.useFakeTimers();
    const id = uuidv4();

    const responsePromise = new Promise<CredentialResponse>((resolve) => {
      pendingRequests.set(id, {
        id,
        service: 'slack',
        scope: 'token',
        reason: 'Refresh',
        createdAt: Date.now(),
        resolve,
        reject: vi.fn(),
      });

      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          resolve({ approved: false, error: 'Request timed out' });
        }
      }, 600_000);
    });

    vi.advanceTimersByTime(600_000);

    const response = await responsePromise;
    expect(response.approved).toBe(false);
    expect(response.error).toContain('timed out');
    expect(pendingRequests.has(id)).toBe(false);

    vi.useRealTimers();
  });
});

describe('Auth middleware', () => {
  it('should reject missing auth header', async () => {
    const { authMiddleware } = await import('../middleware/auth.js');
    const req = { headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    process.env.API_KEY = 'test-key';
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass valid auth', async () => {
    const { authMiddleware } = await import('../middleware/auth.js');
    const req = { headers: { authorization: 'Bearer test-key' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    process.env.API_KEY = 'test-key';
    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
