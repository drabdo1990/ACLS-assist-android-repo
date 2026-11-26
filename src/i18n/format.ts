import { formatDuration } from '../engine/timing';
import type { Lang } from './lang';

/** Durations: "6m 45s". */
export function formatDurationFor(_lang: Lang, ms: number): string {
  return formatDuration(ms);
}

/**
 * The single date formatter: always Gregorian calendar and Western digits, whatever the
 * device locale. `base` overrides the locale tag (tests, or a regional variant).
 */
export function formatDateTime(ms: number, _lang: Lang = 'en', base?: string): string {
  const tag = `${base ?? 'en'}-u-ca-gregory-nu-latn`;
  try {
    return new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      calendar: 'gregory',
      numberingSystem: 'latn',
    }).format(ms);
  } catch {
    return new Date(ms).toISOString();
  }
}

export const LRI = '\u2066';
export const PDI = '\u2069';
export const ltr = (s: string): string => `${LRI}${s}${PDI}`;
