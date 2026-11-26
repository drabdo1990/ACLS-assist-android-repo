/**
 * Online Update Engine — checks GitHub (`drabdo1990/ACLS-assist`) for new commits and
 * applies live updates on both Android (native Capacitor OTA bundle) and Web/PWA.
 *
 * Clinical safety rule: an update is NEVER applied while a code is running (`status !== 'idle'`).
 */
import { getNativeBridge, isNativeAndroid } from './android';

export interface InstalledBuildInfo {
  version: string;
  commit: string;
  shortCommit: string;
  builtAt: string;
  repo: string;
  branch: string;
  manifestUrl: string;
  isNativeAndroid: boolean;
  isOtaActive: boolean;
}

export interface RemoteVersionManifest {
  version?: string;
  commit: string;
  shortCommit?: string;
  commitMessage?: string;
  builtAt?: string;
  bundleUrl?: string;
}

export type UpdateCheckResult =
  | { status: 'offline' }
  | { status: 'error' }
  | { status: 'up_to_date'; commit: string; shortCommit: string; commitMessage?: string }
  | {
      status: 'building';
      commit: string;
      shortCommit: string;
      commitMessage?: string;
      builtAt?: string;
    }
  | {
      status: 'update_available';
      commit: string;
      shortCommit: string;
      commitMessage?: string;
      builtAt?: string;
      version?: string;
      bundleUrl: string;
    };

export type ApplyUpdateResult = { ok: true } | { ok: false; reason: string };

export function shortSha(sha: string): string {
  if (!sha || sha === 'local') return 'local';
  return sha.slice(0, 7);
}

export function getInstalledBuildInfo(): InstalledBuildInfo {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.2.0';
  const builtCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'local';
  const builtAt = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
  const repo = typeof __UPDATE_REPO__ !== 'undefined' ? __UPDATE_REPO__ : 'drabdo1990/ACLS-assist';
  const branch = typeof __UPDATE_BRANCH__ !== 'undefined' ? __UPDATE_BRANCH__ : 'main';
  const manifestUrl =
    typeof __UPDATE_MANIFEST_URL__ !== 'undefined'
      ? __UPDATE_MANIFEST_URL__
      : `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1] ?? 'ACLS-assist'}/version.json`;

  const native = getNativeBridge();
  let activeCommit = builtCommit;
  let isOtaActive = false;
  if (native) {
    try {
      const otaCommit = native.getActiveCommit()?.trim();
      if (otaCommit) activeCommit = otaCommit;
      isOtaActive = Boolean(native.hasOtaUpdate());
    } catch {
      /* fallback to built-in metadata */
    }
  }

  return {
    version,
    commit: activeCommit,
    shortCommit: shortSha(activeCommit),
    builtAt,
    repo,
    branch,
    manifestUrl,
    isNativeAndroid: isNativeAndroid(),
    isOtaActive,
  };
}

export interface CheckUpdateOptions {
  fetchImpl?: typeof fetch;
  online?: boolean;
  info?: InstalledBuildInfo;
  timeoutMs?: number;
}

async function fetchJsonWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<unknown | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      cache: 'no-store',
      headers,
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseManifest(raw: unknown): RemoteVersionManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.commit !== 'string' || !r.commit.trim()) return null;
  return {
    version: typeof r.version === 'string' ? r.version : undefined,
    commit: r.commit.trim(),
    shortCommit: typeof r.shortCommit === 'string' ? r.shortCommit.trim() : shortSha(r.commit.trim()),
    commitMessage: typeof r.commitMessage === 'string' ? r.commitMessage.trim() : undefined,
    builtAt: typeof r.builtAt === 'string' ? r.builtAt : undefined,
    bundleUrl: typeof r.bundleUrl === 'string' ? r.bundleUrl.trim() : undefined,
  };
}

interface GithubCommitInfo {
  sha: string;
  message?: string;
  date?: string;
}

function parseGithubCommit(raw: unknown): GithubCommitInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sha !== 'string' || !r.sha.trim()) return null;
  const commitObj = (r.commit && typeof r.commit === 'object' ? r.commit : null) as Record<string, unknown> | null;
  const rawMessage = typeof commitObj?.message === 'string' ? commitObj.message : '';
  const firstLine = rawMessage.split('\n')[0]?.trim() || undefined;
  const committer = (commitObj?.committer && typeof commitObj.committer === 'object'
    ? commitObj.committer
    : null) as Record<string, unknown> | null;
  const date = typeof committer?.date === 'string' ? committer.date : undefined;
  return { sha: r.sha.trim(), message: firstLine, date };
}

function defaultBundleUrl(manifestUrl: string): string {
  return manifestUrl.replace(/\/version\.json(?:\?.*)?$/i, '/ota-bundle.zip');
}

function sameCommit(a: string, b: string): boolean {
  if (!a || !b) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al === bl || al.startsWith(bl) || bl.startsWith(al);
}

/**
 * Checks both the published GitHub Pages `version.json` manifest (which includes the ready
 * `ota-bundle.zip`) and the live GitHub commits API for `main` so newly pushed commits are
 * detected immediately.
 */
export async function checkForUpdates(opts: CheckUpdateOptions = {}): Promise<UpdateCheckResult> {
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (!online) return { status: 'offline' };

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { status: 'error' };

  const info = opts.info ?? getInstalledBuildInfo();
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const cacheBust = `t=${Date.now()}`;
  const manifestUrlWithBust = `${info.manifestUrl}${info.manifestUrl.includes('?') ? '&' : '?'}${cacheBust}`;
  const githubApiUrl = `https://api.github.com/repos/${info.repo}/commits/${encodeURIComponent(info.branch)}`;

  const [manifestRaw, ghRaw] = await Promise.all([
    fetchJsonWithTimeout(manifestUrlWithBust, fetchImpl, timeoutMs),
    fetchJsonWithTimeout(githubApiUrl, fetchImpl, timeoutMs, { Accept: 'application/vnd.github+json' }),
  ]);

  const manifest = parseManifest(manifestRaw);
  const ghCommit = parseGithubCommit(ghRaw);

  if (!manifest && !ghCommit) return { status: 'error' };

  const current = info.commit;

  // 1. A published bundle exists and is newer than the installed commit → ready to apply immediately.
  if (manifest && manifest.commit !== 'local' && !sameCommit(current, manifest.commit)) {
    const commitMessage =
      manifest.commitMessage || (ghCommit && sameCommit(ghCommit.sha, manifest.commit) ? ghCommit.message : undefined);
    return {
      status: 'update_available',
      commit: manifest.commit,
      shortCommit: shortSha(manifest.commit),
      commitMessage,
      builtAt: manifest.builtAt,
      version: manifest.version,
      bundleUrl: manifest.bundleUrl || defaultBundleUrl(info.manifestUrl),
    };
  }

  // 2. GitHub has a newer commit than what's installed, but Pages/OTA bundle hasn't finished publishing yet.
  if (ghCommit && !sameCommit(current, ghCommit.sha)) {
    return {
      status: 'building',
      commit: ghCommit.sha,
      shortCommit: shortSha(ghCommit.sha),
      commitMessage: ghCommit.message,
      builtAt: ghCommit.date,
    };
  }

  // 3. Up to date.
  const latestCommit = manifest?.commit ?? ghCommit?.sha ?? current;
  return {
    status: 'up_to_date',
    commit: latestCommit,
    shortCommit: shortSha(latestCommit),
    commitMessage: manifest?.commitMessage ?? ghCommit?.message,
  };
}

/**
 * Applies a ready online update.
 * - Native Android (Capacitor): downloads & verifies `ota-bundle.zip`, switches WebView base path, reloads.
 * - Web / PWA: refreshes Service Worker registration, clears stale caches, and reloads cleanly.
 */
export async function applyOnlineUpdate(
  update: Extract<UpdateCheckResult, { status: 'update_available' }>,
): Promise<ApplyUpdateResult> {
  const native = getNativeBridge();
  if (native && typeof window !== 'undefined') {
    return new Promise<ApplyUpdateResult>((resolve) => {
      const timeout = window.setTimeout(() => {
        delete window.__resuscodeOtaCallback;
        resolve({ ok: false, reason: 'Timed out while downloading update' });
      }, 90_000);

      window.__resuscodeOtaCallback = (ok: boolean, message: string) => {
        window.clearTimeout(timeout);
        delete window.__resuscodeOtaCallback;
        if (ok) resolve({ ok: true });
        else resolve({ ok: false, reason: message || 'Native update failed' });
      };

      try {
        native.applyOtaUpdate(update.bundleUrl, update.commit);
      } catch (err) {
        window.clearTimeout(timeout);
        delete window.__resuscodeOtaCallback;
        resolve({ ok: false, reason: err instanceof Error ? err.message : 'Native bridge error' });
      }
    });
  }

  // Web / PWA update flow: trigger SW update, clear outdated caches, and reload.
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {});
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('updated', update.shortCommit);
      window.location.replace(url.toString());
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Reload failed' };
  }
}

export function resetToBuiltInVersion(): void {
  const native = getNativeBridge();
  if (!native) return;
  native.resetToBuiltIn();
}
