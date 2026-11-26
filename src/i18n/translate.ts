import { EN, type MessageKey } from './en';
import { interpolate, type Params } from './interpolate';
import { formatDurationFor } from './format';
import type { Lang } from './lang';

export type { Params } from './interpolate';

export function hasKey(key: unknown): key is MessageKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(EN, key);
}

/** Never throws: unknown key → the key itself. */
export function translate(_lang: Lang, key: MessageKey, params?: Params): string {
  try {
    const template = (hasKey(key) && EN[key]) || String(key);
    return interpolate(
      template,
      params,
      (k) => (hasKey(k) ? translate('en', k) : k),
      (ms) => formatDurationFor('en', ms),
    );
  } catch {
    return String(key);
  }
}

/**
 * True when the key, every `@key` param and every `{placeholder}` of its template are covered, so a
 * full translation is possible. Otherwise callers show the stored English rather than a raw "{n}".
 */
export function canTranslate(key: unknown, params?: Params): boolean {
  if (!hasKey(key)) return false;
  for (const m of EN[key].matchAll(/\{(\w+)\}/g)) {
    if (params?.[m[1]] === undefined) return false;
  }
  if (!params) return true;
  return Object.values(params).every((v) => typeof v !== 'string' || !v.startsWith('@') || hasKey(v.slice(1)));
}
