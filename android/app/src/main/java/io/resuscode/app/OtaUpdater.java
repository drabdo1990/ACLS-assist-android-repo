package io.resuscode.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Downloads, verifies, and extracts ResusCode OTA web bundles published from GitHub Actions
 * so the Android app can update live whenever new commits are pushed to the repository.
 */
public final class OtaUpdater {
    private static final String PREFS_NAME = "resuscode_ota";
    private static final String KEY_ACTIVE_COMMIT = "active_commit";
    private static final String KEY_ACTIVE_PATH = "active_path";
    private static final String OTA_ROOT_DIR = "ota_bundles";
    private static final long MAX_ZIP_BYTES = 50L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int MAX_REDIRECTS = 5;

    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
        "drabdo1990.github.io",
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "raw.githubusercontent.com"
    ));

    private OtaUpdater() {}

    public static String getActiveCommit(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (getSavedBasePath(context) == null) return "";
        return prefs.getString(KEY_ACTIVE_COMMIT, "");
    }

    public static boolean hasOtaUpdate(Context context) {
        return getSavedBasePath(context) != null;
    }

    public static String getSavedBasePath(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String path = prefs.getString(KEY_ACTIVE_PATH, null);
        if (path == null || path.isEmpty()) return null;
        File dir = new File(path);
        File indexHtml = new File(dir, "index.html");
        if (!dir.isDirectory() || !indexHtml.isFile()) {
            prefs.edit().remove(KEY_ACTIVE_PATH).remove(KEY_ACTIVE_COMMIT).apply();
            return null;
        }
        return dir.getAbsolutePath();
    }

    public static void clearSavedBundle(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_ACTIVE_PATH).remove(KEY_ACTIVE_COMMIT).apply();
        File root = new File(context.getFilesDir(), OTA_ROOT_DIR);
        deleteRecursively(root);
    }

    public static String downloadAndInstall(Context context, String bundleUrl, String commit) throws IOException {
        validateUrl(bundleUrl);
        String safeCommit = sanitizeCommit(commit);
        File root = new File(context.getFilesDir(), OTA_ROOT_DIR);
        if (!root.exists() && !root.mkdirs()) {
            throw new IOException("Could not create OTA directory");
        }

        File stagingDir = new File(root, "staging-" + safeCommit + "-" + System.currentTimeMillis());
        if (!stagingDir.mkdirs()) {
            throw new IOException("Could not create staging directory");
        }

        HttpURLConnection conn = null;
        try {
            conn = openValidatedConnection(bundleUrl, 0);
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("Server returned HTTP " + code);
            }

            try (InputStream raw = new BufferedInputStream(conn.getInputStream());
                 ZipInputStream zis = new ZipInputStream(raw)) {
                extractZipSafely(zis, stagingDir);
            }

            File indexHtml = new File(stagingDir, "index.html");
            if (!indexHtml.isFile() || indexHtml.length() == 0) {
                throw new IOException("Downloaded bundle is missing index.html");
            }

            File targetDir = new File(root, safeCommit);
            if (targetDir.exists()) {
                deleteRecursively(targetDir);
            }
            if (!stagingDir.renameTo(targetDir)) {
                throw new IOException("Could not activate extracted bundle");
            }

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_ACTIVE_COMMIT, safeCommit)
                .putString(KEY_ACTIVE_PATH, targetDir.getAbsolutePath())
                .apply();

            cleanupOldBundles(root, targetDir.getName());
            return targetDir.getAbsolutePath();
        } catch (IOException e) {
            deleteRecursively(stagingDir);
            throw e;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static HttpURLConnection openValidatedConnection(String urlStr, int depth) throws IOException {
        if (depth > MAX_REDIRECTS) {
            throw new IOException("Too many redirects");
        }
        validateUrl(urlStr);
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestProperty("Cache-Control", "no-cache");

        int status = conn.getResponseCode();
        if (status == HttpURLConnection.HTTP_MOVED_TEMP
            || status == HttpURLConnection.HTTP_MOVED_PERM
            || status == HttpURLConnection.HTTP_SEE_OTHER
            || status == 307
            || status == 308) {
            String next = conn.getHeaderField("Location");
            conn.disconnect();
            if (next == null || next.isEmpty()) {
                throw new IOException("Empty redirect location");
            }
            return openValidatedConnection(next, depth + 1);
        }
        return conn;
    }

    private static void validateUrl(String urlStr) throws IOException {
        if (urlStr == null || urlStr.trim().isEmpty()) {
            throw new IOException("Missing bundle URL");
        }
        try {
            URI uri = URI.create(urlStr.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equals(scheme)) {
                throw new IOException("Update URL must use HTTPS");
            }
            if (!ALLOWED_HOSTS.contains(host)) {
                throw new IOException("Untrusted update host: " + host);
            }
        } catch (IllegalArgumentException e) {
            throw new IOException("Invalid update URL", e);
        }
    }

    private static String sanitizeCommit(String commit) throws IOException {
        if (commit == null) throw new IOException("Missing commit identifier");
        String cleaned = commit.trim().replaceAll("[^a-zA-Z0-9._-]", "");
        if (cleaned.isEmpty() || cleaned.length() > 64) {
            throw new IOException("Invalid commit identifier");
        }
        return cleaned;
    }

    private static void extractZipSafely(ZipInputStream zis, File targetDir) throws IOException {
        String canonicalTarget = targetDir.getCanonicalPath() + File.separator;
        byte[] buffer = new byte[16 * 1024];
        long totalBytes = 0L;
        ZipEntry entry;
        while ((entry = zis.getNextEntry()) != null) {
            String name = entry.getName();
            if (name == null || name.isEmpty()) continue;

            File outFile = new File(targetDir, name);
            String canonicalOut = outFile.getCanonicalPath();
            if (!canonicalOut.startsWith(canonicalTarget)) {
                throw new IOException("Blocked unsafe path in bundle: " + name);
            }

            if (entry.isDirectory()) {
                if (!outFile.exists() && !outFile.mkdirs()) {
                    throw new IOException("Could not create directory: " + name);
                }
            } else {
                File parent = outFile.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new IOException("Could not create parent directory for: " + name);
                }
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    int read;
                    while ((read = zis.read(buffer)) != -1) {
                        totalBytes += read;
                        if (totalBytes > MAX_ZIP_BYTES) {
                            throw new IOException("Update bundle exceeds size limit");
                        }
                        fos.write(buffer, 0, read);
                    }
                }
            }
            zis.closeEntry();
        }
    }

    private static void cleanupOldBundles(File root, String keepName) {
        File[] children = root.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (!child.getName().equals(keepName)) {
                deleteRecursively(child);
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File c : children) {
                    deleteRecursively(c);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
