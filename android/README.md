# ResusCode Android App

This folder contains the native Android (Capacitor) project for **ResusCode**.

## Build the APK

### Option 1: GitHub Actions (automatic)
Push to `main` (or trigger **Build Android APK** in GitHub Actions) to download `ResusCode-android-apk` (`app-debug.apk`) from the workflow run artifacts.

### Option 2: Android Studio (local)
1. Install Node.js 22 and Android Studio (with JDK 21 & Android SDK).
2. From the repository root:
   ```bash
   npm install
   npm run android:sync
   npm run android:open
   ```
3. In Android Studio, run on a connected device or choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Online Updates (OTA from new commits)
- Every push to `main` runs `.github/workflows/deploy.yml`, which publishes `version.json` and `ota-bundle.zip` to GitHub Pages.
- Inside the app, open **Settings → Online updates** and tap **Check for updates** → **Update now** to download and install the latest commit over the air without reinstalling the APK.
- Updates are locked while a code is active and can be reverted via **Restore built-in version**.
