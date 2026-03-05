import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadRules, matchRule, type AutoApproveRule } from '../autoApprove.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve } from 'path';

describe('loadRules', () => {
  const testConfigPath = resolve(__dirname, '../../config/test-auto-approve.json');

  afterEach(() => {
    try {
      unlinkSync(testConfigPath);
    } catch {}
  });

  it('should load valid rules from JSON file', () => {
    const rules: AutoApproveRule[] = [
      {
        id: 'test-rule',
        description: 'Test rule',
        service: 'TestService',
        scope: '*',
        enabled: true,
      },
    ];

    writeFileSync(testConfigPath, JSON.stringify(rules));
    const loaded = loadRules(testConfigPath);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('test-rule');
    expect(loaded[0].service).toBe('TestService');
  });

  it('should return empty array for missing file', () => {
    const rules = loadRules('/nonexistent/path/config.json');
    expect(rules).toEqual([]);
  });

  it('should return empty array for invalid JSON', () => {
    writeFileSync(testConfigPath, 'invalid json {]');
    const rules = loadRules(testConfigPath);
    expect(rules).toEqual([]);
  });
});

describe('matchRule', () => {
  it('should match rule when all conditions pass', () => {
    vi.useFakeTimers();
    // Set to Friday, 10:00 AM PST (dayOfWeek: 5, hour: 10)
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'Greenlight',
      scope: 'card',
      reason: 'Random shopper cron job',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('shopper-friday');

    vi.useRealTimers();
  });

  it('should NOT match rule for wrong service', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'WrongService',
      scope: 'card',
      reason: 'Random shopper cron job',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should NOT match rule for wrong day of week', () => {
    vi.useFakeTimers();
    // Set to Monday (dayOfWeek: 1)
    vi.setSystemTime(new Date('2026-03-02T18:00:00Z')); // Monday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'Greenlight',
      scope: 'card',
      reason: 'Random shopper cron job',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should NOT match rule outside hour range', () => {
    vi.useFakeTimers();
    // Set to Friday, 5:00 AM PST (before start time)
    vi.setSystemTime(new Date('2026-03-06T13:00:00Z')); // Friday 5:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'Greenlight',
      scope: 'card',
      reason: 'Random shopper cron job',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should NOT match rule for wrong reason substring', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'Greenlight',
      scope: 'card',
      reason: 'Manual deployment task',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should NOT match disabled rule', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'shopper-friday',
        description: 'Auto-approve on Fridays',
        service: 'Greenlight',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'shopper',
        },
        enabled: false,
      },
    ];

    const request = {
      service: 'Greenlight',
      scope: 'card',
      reason: 'Random shopper cron job',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should match rule with wildcard scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'wildcard-scope',
        description: 'Match any scope',
        service: 'TestService',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'TestService',
      scope: 'anything',
      reason: 'Test reason',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('wildcard-scope');

    vi.useRealTimers();
  });

  it('should match rule with specific scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'specific-scope',
        description: 'Match specific scope',
        service: 'TestService',
        scope: 'readonly',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'TestService',
      scope: 'readonly',
      reason: 'Test reason',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('specific-scope');

    vi.useRealTimers();
  });

  it('should NOT match rule with wrong specific scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'specific-scope',
        description: 'Match specific scope',
        service: 'TestService',
        scope: 'readonly',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'TestService',
      scope: 'admin',
      reason: 'Test reason',
    };

    const matched = matchRule(request, rules);
    expect(matched).toBeNull();

    vi.useRealTimers();
  });

  it('should match rule with no conditions (always passes)', () => {
    const rules: AutoApproveRule[] = [
      {
        id: 'no-conditions',
        description: 'Always match',
        service: 'AlwaysService',
        scope: '*',
        enabled: true,
      },
    ];

    const request = {
      service: 'AlwaysService',
      scope: 'any',
      reason: 'Any reason',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('no-conditions');
  });

  it('should be case-insensitive for service and scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'case-test',
        description: 'Case insensitive',
        service: 'MyService',
        scope: 'ReadOnly',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'myservice',
      scope: 'readonly',
      reason: 'Test',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('case-test');

    vi.useRealTimers();
  });

  it('should be case-insensitive for reasonContains', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T18:00:00Z')); // Friday 10:00 AM PST

    const rules: AutoApproveRule[] = [
      {
        id: 'reason-case',
        description: 'Case insensitive reason',
        service: 'TestService',
        scope: '*',
        conditions: {
          dayOfWeek: [5],
          hourRange: { start: 6, end: 20 },
          reasonContains: 'SHOPPER',
        },
        enabled: true,
      },
    ];

    const request = {
      service: 'TestService',
      scope: 'any',
      reason: 'random shopper cron',
    };

    const matched = matchRule(request, rules);
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('reason-case');

    vi.useRealTimers();
  });
});
