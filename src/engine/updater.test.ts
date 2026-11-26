import { describe, expect, it } from 'vitest';
import { checkForUpdates, shortSha, type InstalledBuildInfo } from './updater';

const baseInfo: InstalledBuildInfo = {
  version: '0.2.0',
  commit: '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  shortCommit: '1111111',
  builtAt: '2026-11-26T00:00:00.000Z',
  repo: 'drabdo1990/ACLS-assist',
  branch: 'main',
  manifestUrl: 'https://drabdo1990.github.io/ACLS-assist/version.json',
  isNativeAndroid: false,
  isOtaActive: false,
};

function mockFetch(responses: Record<string, unknown | null>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const matchKey = Object.keys(responses).find((k) => url.includes(k));
    const body = matchKey ? responses[matchKey] : null;
    if (body == null) {
      return new Response(null, { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('online updater', () => {
  it('returns offline immediately when not online', async () => {
    const res = await checkForUpdates({ online: false, info: baseInfo });
    expect(res).toEqual({ status: 'offline' });
  });

  it('reports up_to_date when manifest and GitHub commit match installed commit', async () => {
    const fetchImpl = mockFetch({
      'version.json': {
        version: '0.2.0',
        commit: baseInfo.commit,
        commitMessage: 'Initial release',
        bundleUrl: 'https://drabdo1990.github.io/ACLS-assist/ota-bundle.zip',
      },
      'api.github.com': {
        sha: baseInfo.commit,
        commit: { message: 'Initial release', committer: { date: '2026-11-26T00:00:00Z' } },
      },
    });
    const res = await checkForUpdates({ online: true, info: baseInfo, fetchImpl });
    expect(res.status).toBe('up_to_date');
    if (res.status === 'up_to_date') {
      expect(res.shortCommit).toBe('1111111');
    }
  });

  it('reports update_available when published manifest has a newer commit', async () => {
    const nextSha = '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const fetchImpl = mockFetch({
      'version.json': {
        version: '0.2.1',
        commit: nextSha,
        commitMessage: 'Add pediatric updates',
        bundleUrl: 'https://drabdo1990.github.io/ACLS-assist/ota-bundle.zip',
      },
      'api.github.com': {
        sha: nextSha,
        commit: { message: 'Add pediatric updates\n\ndetails', committer: { date: '2026-11-26T12:00:00Z' } },
      },
    });
    const res = await checkForUpdates({ online: true, info: baseInfo, fetchImpl });
    expect(res.status).toBe('update_available');
    if (res.status === 'update_available') {
      expect(res.shortCommit).toBe('2222222');
      expect(res.commitMessage).toBe('Add pediatric updates');
      expect(res.bundleUrl).toBe('https://drabdo1990.github.io/ACLS-assist/ota-bundle.zip');
    }
  });

  it('reports building when GitHub has a newer commit not yet published to version.json', async () => {
    const nextSha = '3333333ccccccccccccccccccccccccccccccccc';
    const fetchImpl = mockFetch({
      'version.json': {
        version: '0.2.0',
        commit: baseInfo.commit,
      },
      'api.github.com': {
        sha: nextSha,
        commit: { message: 'Fix dosing timer', committer: { date: '2026-11-26T13:00:00Z' } },
      },
    });
    const res = await checkForUpdates({ online: true, info: baseInfo, fetchImpl });
    expect(res.status).toBe('building');
    if (res.status === 'building') {
      expect(res.shortCommit).toBe('3333333');
      expect(res.commitMessage).toBe('Fix dosing timer');
    }
  });

  it('returns error when both endpoints fail', async () => {
    const fetchImpl = mockFetch({});
    const res = await checkForUpdates({ online: true, info: baseInfo, fetchImpl });
    expect(res).toEqual({ status: 'error' });
  });

  it('formats short commit hashes safely', () => {
    expect(shortSha('abcdef1234567890')).toBe('abcdef1');
    expect(shortSha('local')).toBe('local');
  });
});
