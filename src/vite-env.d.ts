/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

export interface ResusCodeNativeBridge {
  setKeepScreenOn(keepOn: boolean): void;
  getActiveCommit(): string;
  hasOtaUpdate(): boolean;
  applyOtaUpdate(bundleUrl: string, commit: string): void;
  resetToBuiltIn(): void;
}

declare global {
  const __APP_VERSION__: string;
  const __BUILD_COMMIT__: string;
  const __BUILD_COMMIT_MESSAGE__: string;
  const __BUILD_TIME__: string;
  const __UPDATE_REPO__: string;
  const __UPDATE_BRANCH__: string;
  const __UPDATE_MANIFEST_URL__: string;

  interface Window {
    ResusCodeNative?: ResusCodeNativeBridge;
    __resuscodeOtaCallback?: (ok: boolean, message: string) => void;
  }
}
