import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// ResusCode build config.
// - No external runtime assets: fonts are a system stack, audio is synthesized (Web Audio API),
//   icons are generated PNGs served from /icons. Everything is precached by Workbox for offline use.
//
// `base` is configurable so the same source deploys to a GitHub Pages *project* site
// (https://<user>.github.io/<repo>/) and builds cleanly with '/' for the Capacitor Android APK.
const base = process.env.VITE_BASE ?? '/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string };
const appVersion = pkg.version ?? '0.2.0';

function readGit(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildCommit = (process.env.GITHUB_SHA ?? '').trim() || readGit('git rev-parse HEAD', 'local');
const buildCommitMessage =
  (process.env.GITHUB_COMMIT_MESSAGE ?? '').trim() || readGit('git log -1 --pretty=%s', '');
const buildTime = new Date().toISOString();
const updateRepo = (process.env.VITE_UPDATE_REPO ?? 'drabdo1990/ACLS-assist').trim();
const updateBranch = (process.env.VITE_UPDATE_BRANCH ?? 'main').trim();
const pagesOrigin = `https://${updateRepo.split('/')[0]}.github.io/${updateRepo.split('/')[1] ?? 'ACLS-assist'}`;
const updateManifestUrl = (process.env.VITE_UPDATE_MANIFEST_URL ?? `${pagesOrigin}/version.json`).trim();
const updateBundleUrl = (process.env.VITE_UPDATE_BUNDLE_URL ?? `${pagesOrigin}/ota-bundle.zip`).trim();

/** Emits version.json into dist/ so both PWA and Android OTA clients can detect new commits. */
function emitVersionManifest(): Plugin {
  return {
    name: 'resuscode-version-manifest',
    generateBundle() {
      const payload = {
        version: appVersion,
        commit: buildCommit,
        shortCommit: buildCommit === 'local' ? 'local' : buildCommit.slice(0, 7),
        commitMessage: buildCommitMessage,
        builtAt: buildTime,
        repo: updateRepo,
        branch: updateBranch,
        bundleUrl: updateBundleUrl,
      };
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(payload, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_COMMIT_MESSAGE__: JSON.stringify(buildCommitMessage),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __UPDATE_REPO__: JSON.stringify(updateRepo),
    __UPDATE_BRANCH__: JSON.stringify(updateBranch),
    __UPDATE_MANIFEST_URL__: JSON.stringify(updateManifestUrl),
  },
  plugins: [
    react(),
    tailwindcss(),
    emitVersionManifest(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'ResusCode — Adult ACLS Code Blue Command',
        short_name: 'ResusCode',
        description:
          'Universal adult ACLS Code Blue command HUD: CPR cycle timer, interventions, H’s & T’s, post-ROSC and SBAR export. PHI-free and offline-first, with optional anonymous statistics upload when your unit enrolls the device.',
        theme_color: '#06080e',
        background_color: '#06080e',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'any',
        start_url: base,
        scope: base,
        categories: ['medical', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
