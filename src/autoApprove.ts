import { readFileSync } from 'fs';

export interface AutoApproveConditions {
  dayOfWeek?: number[];
  hourRange?: { start: number; end: number };
  reasonContains?: string;
}

export interface AutoApproveRule {
  id: string;
  description: string;
  service: string;
  scope: string;
  conditions?: AutoApproveConditions;
  enabled: boolean;
}

export function loadRules(configPath: string): AutoApproveRule[] {
  try {
    const data = readFileSync(configPath, 'utf-8');
    const rules = JSON.parse(data) as AutoApproveRule[];
    return rules;
  } catch (err) {
    console.error(`[autoApprove] Failed to load rules from ${configPath}:`, err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
}

function getCurrentDayAndHour(): { day: number; hour: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'narrow',
    hour: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekdayPart = parts.find(p => p.type === 'weekday');
  const hourPart = parts.find(p => p.type === 'hour');

  const weekdayMap: Record<string, number> = { S: 0, M: 1, T: 2, W: 3, R: 4, F: 5, A: 6 };
  const day = weekdayPart ? weekdayMap[weekdayPart.value] ?? 0 : 0;
  const hour = hourPart ? parseInt(hourPart.value, 10) : 0;

  return { day, hour };
}

export function matchRule(
  request: { service: string; scope: string; reason: string },
  rules: AutoApproveRule[],
): AutoApproveRule | null {
  const { day, hour } = getCurrentDayAndHour();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.service.toLowerCase() !== request.service.toLowerCase()) continue;

    if (rule.scope !== '*' && rule.scope.toLowerCase() !== request.scope.toLowerCase()) continue;

    if (rule.conditions) {
      if (rule.conditions.dayOfWeek && !rule.conditions.dayOfWeek.includes(day)) continue;

      if (rule.conditions.hourRange) {
        const { start, end } = rule.conditions.hourRange;
        if (hour < start || hour >= end) continue;
      }

      if (rule.conditions.reasonContains) {
        const reasonLower = request.reason.toLowerCase();
        const searchTerm = rule.conditions.reasonContains.toLowerCase();
        if (!reasonLower.includes(searchTerm)) continue;
      }
    }

    return rule;
  }

  return null;
}
