package io.resuscode.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final int NIGHT_BG = Color.parseColor("#050811");
    private final ExecutorService otaExecutor = Executors.newSingleThreadExecutor();

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(NIGHT_BG);
            window.setNavigationBarColor(NIGHT_BG);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            webView.setBackgroundColor(NIGHT_BG);
            webView.addJavascriptInterface(new ResusCodeNativeBridge(), "ResusCodeNative");

            String savedPath = OtaUpdater.getSavedBasePath(this);
            if (savedPath != null) {
                this.bridge.setServerBasePath(savedPath);
            }
        }
    }

    @Override
    public void onDestroy() {
        otaExecutor.shutdownNow();
        super.onDestroy();
    }

    private void notifyOtaResult(boolean ok, String message) {
        runOnUiThread(() -> {
            if (bridge == null || bridge.getWebView() == null) return;
            String js = "if (window.__resuscodeOtaCallback) { window.__resuscodeOtaCallback("
                + ok + ", " + JSONObject.quote(message == null ? "" : message) + "); }";
            bridge.getWebView().evaluateJavascript(js, null);
        });
    }

    private final class ResusCodeNativeBridge {
        @JavascriptInterface
        public void setKeepScreenOn(boolean keepOn) {
            runOnUiThread(() -> {
                Window window = getWindow();
                if (window == null) return;
                if (keepOn) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public String getActiveCommit() {
            return OtaUpdater.getActiveCommit(MainActivity.this);
        }

        @JavascriptInterface
        public boolean hasOtaUpdate() {
            return OtaUpdater.hasOtaUpdate(MainActivity.this);
        }

        @JavascriptInterface
        public void applyOtaUpdate(String bundleUrl, String commit) {
            otaExecutor.execute(() -> {
                try {
                    String installedPath = OtaUpdater.downloadAndInstall(MainActivity.this, bundleUrl, commit);
                    runOnUiThread(() -> {
                        notifyOtaResult(true, "Installed " + commit);
                        if (bridge != null) {
                            bridge.setServerBasePath(installedPath);
                        }
                    });
                } catch (Exception e) {
                    String msg = e.getMessage() != null ? e.getMessage() : "Update failed";
                    notifyOtaResult(false, msg);
                }
            });
        }

        @JavascriptInterface
        public void resetToBuiltIn() {
            otaExecutor.execute(() -> {
                OtaUpdater.clearSavedBundle(MainActivity.this);
                runOnUiThread(() -> {
                    if (bridge != null) {
                        bridge.setServerAssetPath("public");
                    }
                });
            });
        }
    }
}
