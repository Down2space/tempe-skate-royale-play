package com.yaway.tripcam;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * TRIPCAM phone app.
 * Films with the phone camera, runs the trippy effects (WebGL page in assets/tripcam),
 * and streams each rendered frame to the TRIPCAM watch app over the Wear OS Data Layer
 * (Bluetooth / the Galaxy Wearable connection). Taps and bezel turns on the watch come
 * back here as "/ctl" messages.
 */
public class PhoneActivity extends Activity implements MessageClient.OnMessageReceivedListener {

    static final String PATH_FRAME = "/tripcam/frame";
    static final String PATH_STATE = "/tripcam/state";
    static final String PATH_CTL = "/tripcam/ctl";
    private static final String PAGE = "https://appassets.androidplatform.net/assets/tripcam/index.html";

    private static volatile WeakReference<PhoneActivity> current = new WeakReference<>(null);
    static PhoneActivity current() { return current.get(); }

    private WebView web;
    private final List<String> nodes = new CopyOnWriteArrayList<>();
    private final AtomicInteger inFlight = new AtomicInteger(0);
    private volatile long lastSend = 0;
    private boolean hadWatch = false;
    private boolean loaded = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final Runnable nodePoll = new Runnable() {
        @Override public void run() {
            refreshNodes();
            handler.postDelayed(this, 3000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // the watch can start us while the phone is locked / screen off
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
        web.addJavascriptInterface(new Bridge(), "TripcamNative");

        List<String> need = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        if (need.isEmpty()) { load(); askOverlayOnce(); }
        else requestPermissions(need.toArray(new String[0]), 1);
    }

    /** "Display over other apps" lets the watch pop the camera open on the phone by itself. */
    private void askOverlayOnce() {
        if (Settings.canDrawOverlays(this)) return;
        SharedPreferences prefs = getSharedPreferences("tripcam", MODE_PRIVATE);
        if (prefs.getBoolean("askedOverlay", false)) return;
        prefs.edit().putBoolean("askedOverlay", true).apply();
        new AlertDialog.Builder(this)
                .setTitle("Let your watch start TRIPCAM")
                .setMessage("Turn on \"Display over other apps\" for TRIPCAM so opening it on your "
                        + "watch opens the camera here automatically.\n\nWithout it you'll get a "
                        + "notification to tap instead.")
                .setPositiveButton("Turn on", (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception ignored) { }
                })
                .setNegativeButton("Not now", null)
                .show();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        load(); // without camera permission the page still offers Photo/video and Demo
        askOverlayOnce();
    }

    private void load() {
        if (loaded) return;
        loaded = true;
        web.loadUrl(PAGE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        try { getSystemService(NotificationManager.class).cancel(LaunchService.NOTIFY_ID); } catch (Exception ignored) { }
        Wearable.getMessageClient(this).addListener(this);
        handler.post(nodePoll);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(nodePoll);
        Wearable.getMessageClient(this).removeListener(this);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) current = new WeakReference<>(null);
        web.destroy();
        super.onDestroy();
    }

    private void refreshNodes() {
        Wearable.getNodeClient(this).getConnectedNodes().addOnSuccessListener(list -> {
            List<String> ids = new ArrayList<>();
            for (Node n : list) ids.add(n.getId());
            nodes.clear();
            nodes.addAll(ids);
            boolean has = !ids.isEmpty();
            if (has != hadWatch) {
                hadWatch = has;
                js("window.tripcamWatch&&window.tripcamWatch(" + has + ")");
            }
        });
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    @Override
    public void onMessageReceived(MessageEvent e) {
        if (!PATH_CTL.equals(e.getPath())) return;
        String cmd = new String(e.getData(), StandardCharsets.UTF_8).replaceAll("[^a-z+\\-]", "");
        if (cmd.equals("hello")) refreshNodes();
        js("window.tripcamRemote&&window.tripcamRemote('" + cmd + "')");
    }

    private void sendAll(String path, byte[] data, boolean track) {
        for (String id : nodes) {
            if (track) inFlight.incrementAndGet();
            Wearable.getMessageClient(this).sendMessage(id, path, data)
                    .addOnCompleteListener(t -> { if (track) inFlight.decrementAndGet(); });
        }
    }

    /** Called from the effects page (JavaScript). Runs on a WebView background thread. */
    private class Bridge {
        @JavascriptInterface
        public boolean ready() {
            if (nodes.isEmpty()) return false;
            // never let a lost callback freeze the stream
            if (inFlight.get() > 0 && SystemClock.uptimeMillis() - lastSend > 1500) inFlight.set(0);
            return inFlight.get() == 0;
        }

        @JavascriptInterface
        public void sendFrame(String base64Jpeg) {
            byte[] jpeg;
            try { jpeg = Base64.decode(base64Jpeg, Base64.DEFAULT); } catch (Exception ex) { return; }
            lastSend = SystemClock.uptimeMillis();
            sendAll(PATH_FRAME, jpeg, true);
        }

        @JavascriptInterface
        public void sendState(int mode, float k, String name) {
            String msg = name + "|" + mode + "|" + k;
            sendAll(PATH_STATE, msg.getBytes(StandardCharsets.UTF_8), false);
        }
    }
}
