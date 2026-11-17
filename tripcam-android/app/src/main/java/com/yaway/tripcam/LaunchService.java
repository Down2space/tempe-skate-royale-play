package com.yaway.tripcam;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Runs on the PHONE in the background. When TRIPCAM is opened on the watch, the watch sends
 * "start" and this opens the camera screen on the phone; closing it on the watch sends "stop".
 */
public class LaunchService extends WearableListenerService {

    static final String PATH_START = "/tripcam-launch/start";
    static final String PATH_STOP = "/tripcam-launch/stop";
    static final int NOTIFY_ID = 7;
    private static final String CHANNEL = "tripcam_start";

    @Override
    public void onMessageReceived(MessageEvent e) {
        final String path = e.getPath();
        final Context app = getApplicationContext();
        final Handler main = new Handler(Looper.getMainLooper());

        if (PATH_STOP.equals(path)) {
            main.post(() -> {
                PhoneActivity a = PhoneActivity.current();
                if (a != null) a.finish();
                try { app.getSystemService(NotificationManager.class).cancel(NOTIFY_ID); } catch (Exception ignored) { }
            });
            return;
        }
        if (!PATH_START.equals(path)) return;

        main.post(() -> {
            if (PhoneActivity.current() != null) return; // already filming
            Intent open = new Intent(app, PhoneActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            // 1) Best case: "Display over other apps" is allowed → open the camera right away.
            //    (Android 15+ also wants a visible overlay window, so show a 1px one briefly.)
            if (Settings.canDrawOverlays(app)) {
                try {
                    final WindowManager wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
                    final View dot = new View(app);
                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(1, 1,
                            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                            PixelFormat.TRANSLUCENT);
                    wm.addView(dot, lp);
                    main.postDelayed(() -> { try { wm.removeView(dot); } catch (Exception ignored) { } }, 3000);
                } catch (Exception ignored) { }
                try { app.startActivity(open); } catch (Exception ignored) { }
            } else {
                try { app.startActivity(open); } catch (Exception ignored) { } // may be blocked by Android
            }

            // 2) If Android blocked it, fall back to a "tap to start" notification.
            main.postDelayed(() -> {
                if (PhoneActivity.current() == null) notifyStart(app, open);
            }, 1500);
        });
    }

    private static void notifyStart(Context c, Intent open) {
        try {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Start from watch",
                    NotificationManager.IMPORTANCE_HIGH));
            PendingIntent pi = PendingIntent.getActivity(c, 0, open,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new Notification.Builder(c, CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_menu_camera)
                    .setContentTitle("TRIPCAM")
                    .setContentText("Your watch is ready — tap to start the camera")
                    .setContentIntent(pi)
                    .setFullScreenIntent(pi, true)
                    .setAutoCancel(true)
                    .build();
            nm.notify(NOTIFY_ID, n);
        } catch (Exception ignored) { }
    }
}
