/**
 * Language configuration — English only.
 */
import type { KV } from '../engine/kv';

export type Lang = 'en';
export const LANGS: readonly Lang[] = ['en'];
export const LANG_KEY = 'resuscode.lang';

export const isLang = (x: unknown): x is Lang => x === 'en';
export const dirFor = (_lang: Lang = 'en'): 'ltr' => 'ltr';

export function detectLang(_languages: readonly string[] | null | undefined): Lang {
  return 'en';
}

export function readLang(_kv: KV | null, _languages: readonly string[] | null | undefined): Lang {
  return 'en';
}

export const getLang = (): Lang => 'en';

export function subscribeLang(_fn: () => void): () => void {
  return () => {};
}

export function applyDocumentLang(
  _lang: Lang = 'en',
  doc: Document | null = typeof document !== 'undefined' ? document : null,
): void {
  if (!doc?.documentElement) return;
  doc.documentElement.lang = 'en';
  doc.documentElement.dir = 'ltr';
}

export function setLang(_lang: Lang, _kv: KV | null = null): void {
  applyDocumentLang('en');
}
