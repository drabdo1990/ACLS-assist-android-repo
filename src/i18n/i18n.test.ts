import { describe, it, expect } from 'vitest';
import { EN, type MessageKey } from './en';
import { translate, hasKey } from './translate';
import { enText } from './enText';
import { formatDateTime, formatDurationFor, ltr } from './format';
import { applyDocumentLang, detectLang, getLang, LANG_KEY, readLang } from './lang';
import { memoryKV } from '../engine/testing/memoryKV';

describe('dictionaries', () => {
  it('generates clinical content keys from the content data', () => {
    expect(Object.keys(EN).length).toBeGreaterThan(10);
    expect(EN['cause.hypoxia.label']).toBe('Hypoxia');
    expect(EN['pocus.effusion.label']).toBe('Pericardial effusion');
    expect(EN['postRosc.ecg']).toBe('12-lead ECG — STEMI → Cath Lab; decides ICU vs CCU');
  });
});

describe('translate', () => {
  it('interpolates params and resolves @ keys in English', () => {
    expect(translate('en', 'cause.hypoxia.label')).toBe('Hypoxia');
    expect(hasKey('cause.hypoxia.label')).toBe(true);
    expect(hasKey('nope.never')).toBe(false);
  });

  it('never throws: unknown key falls back to the key', () => {
    expect(translate('en', 'nope.never' as MessageKey)).toBe('nope.never');
    expect(translate('xx' as never, 'cause.hypoxia.label')).toBe('Hypoxia');
    expect(() => translate('en', 'cause.hypoxia.label', { x: undefined as never })).not.toThrow();
  });

  it('formats *Ms params as English durations', () => {
    expect(formatDurationFor('en', 405_000)).toBe('6m 45s');
  });

  it('enText renders English with @ keys resolved', () => {
    expect(enText('cause.toxins.label')).toBe('Toxins');
  });
});

describe('dates', () => {
  const ts = Date.UTC(2026, 9, 16, 12, 0, 0);
  it('uses Gregorian calendar and Western digits regardless of locale', () => {
    expect(formatDateTime(ts, 'en')).toContain('2026');
    expect(formatDateTime(ts, 'en', 'en-US')).toContain('2026');
  });
  it('ltr wraps in LRI…PDI', () => {
    expect(ltr('[01:00]')).toBe('\u2066[01:00]\u2069');
  });
});

describe('language state (English-only)', () => {
  it('always resolves to English and LTR', () => {
    expect(detectLang(['ar-SA', 'en'])).toBe('en');
    expect(detectLang(['en-US'])).toBe('en');
    expect(detectLang([])).toBe('en');
    expect(detectLang(undefined)).toBe('en');
    expect(readLang(memoryKV({ [LANG_KEY]: 'ar' }), ['ar-SA'])).toBe('en');
    expect(readLang(null, ['en'])).toBe('en');
    expect(getLang()).toBe('en');
  });

  it('applyDocumentLang always sets en and ltr', () => {
    const doc = { documentElement: { lang: '', dir: '' } } as unknown as Document;
    applyDocumentLang('en', doc);
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.documentElement.dir).toBe('ltr');
  });
});
