/**
 * Android Capacitor integration — safe no-op on web browsers and Node tests.
 * - Styles the Android status bar to match ResusCode's night-mode background.
 * - Guards the Android hardware Back button so an active code is never exited by accident.
 */
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { ResusCodeNativeBridge } from '../vite-env';

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function getNativeBridge(): ResusCodeNativeBridge | null {
  if (typeof window === 'undefined') return null;
  return window.ResusCodeNative ?? null;
}

let initialized = false;

export function initAndroidBridge(getStatus: () => string): void {
  if (initialized || !isNativeAndroid()) return;
  initialized = true;

  void StatusBar.setBackgroundColor({ color: '#050811' }).catch(() => {});
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

  void CapApp.addListener('backButton', () => {
    // Never let an accidental back press exit or minimize during an active resuscitation.
    if (getStatus() !== 'idle') return;
    void CapApp.minimizeApp().catch(() => {});
  });
}
