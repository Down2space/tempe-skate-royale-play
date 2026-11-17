package com.yaway.tripcam;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TRIPCAM watch app (Wear OS / Galaxy Watch).
 * Shows the trippy video the phone app streams over Bluetooth.
 * Tap = next effect, long-press = previous effect, rotate bezel = intensity.
 */
public class MainActivity extends Activity implements MessageClient.OnMessageReceivedListener {

    static final String PATH_FRAME = "/tripcam/frame";
    static final String PATH_STATE = "/tripcam/state";
    static final String PATH_CTL = "/tripcam/ctl";

    private ImageView image;
    private TextView label, status;
    private ArcView arc;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private final List<String> phones = new CopyOnWriteArrayList<>();
    private volatile boolean decoding = false;
    private volatile long lastFrame = 0;
    private long lastTick = 0;

    private final Runnable hideLabel = () -> label.animate().alpha(0f).setDuration(500);
    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            boolean live = SystemClock.uptimeMillis() - lastFrame < 3000;
            status.setVisibility(live ? View.GONE : View.VISIBLE);
            if (!live) { findPhones(); send("hello"); }
            handler.postDelayed(this, 2000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(image, new FrameLayout.LayoutParams(-1, -1));

        arc = new ArcView(this);
        root.addView(arc, new FrameLayout.LayoutParams(-1, -1));

        label = new TextView(this);
        label.setTextColor(Color.WHITE);
        label.setTextSize(15);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setLetterSpacing(0.2f);
        label.setShadowLayer(8, 0, 0, Color.BLACK);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setAlpha(0f);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        lp.topMargin = (int) (getResources().getDisplayMetrics().heightPixels * 0.13f);
        root.addView(label, lp);

        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setTextSize(14);
        status.setGravity(Gravity.CENTER);
        status.setShadowLayer(6, 0, 0, Color.BLACK);
        status.setText("TRIPCAM\n\nOpen TRIPCAM on your phone");
        int pad = (int) (getResources().getDisplayMetrics().widthPixels * 0.14f);
        status.setPadding(pad, 0, pad, 0);
        root.addView(status, new FrameLayout.LayoutParams(-1, -1));

        root.setOnClickListener(v -> send("next"));
        root.setOnLongClickListener(v -> { send("prev"); return true; });

        // Rotating bezel (Watch6 Classic) / crown → intensity
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);
        root.setOnGenericMotionListener((v, ev) -> {
            if (ev.getAction() == MotionEvent.ACTION_SCROLL
                    && ev.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
                float d = -ev.getAxisValue(MotionEvent.AXIS_SCROLL); // clockwise = positive
                if (d != 0) {
                    send(d > 0 ? "k+" : "k-");
                    tick();
                }
                return true;
            }
            return false;
        });

        setContentView(root);
        root.requestFocus();
    }

    private void tick() {
        long now = SystemClock.uptimeMillis();
        if (now - lastTick < 60) return;
        lastTick = now;
        try {
            Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null) vib.vibrate(8);
        } catch (Exception ignored) { }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Wearable.getMessageClient(this).addListener(this);
        findPhones();
        handler.post(watchdog);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(watchdog);
        Wearable.getMessageClient(this).removeListener(this);
        super.onPause();
    }

    private void findPhones() {
        Wearable.getNodeClient(this).getConnectedNodes().addOnSuccessListener(list -> {
            phones.clear();
            for (Node n : list) phones.add(n.getId());
            if (!phones.isEmpty()) sendNow("hello");
        });
    }

    private void send(String cmd) {
        if (phones.isEmpty()) { findPhones(); return; }
        sendNow(cmd);
    }

    private void sendNow(String cmd) {
        byte[] data = cmd.getBytes(StandardCharsets.UTF_8);
        for (String id : phones) Wearable.getMessageClient(this).sendMessage(id, PATH_CTL, data);
    }

    @Override
    public void onMessageReceived(MessageEvent e) {
        String path = e.getPath();
        if (PATH_FRAME.equals(path)) {
            if (decoding) return; // drop frames while busy — keeps it live, not laggy
            decoding = true;
            final byte[] jpeg = e.getData();
            decoder.execute(() -> {
                Bitmap bmp = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
                runOnUiThread(() -> {
                    if (bmp != null) {
                        image.setImageBitmap(bmp);
                        lastFrame = SystemClock.uptimeMillis();
                        status.setVisibility(View.GONE);
                    }
                    decoding = false;
                });
            });
        } else if (PATH_STATE.equals(path)) {
            String[] p = new String(e.getData(), StandardCharsets.UTF_8).split("\\|");
            if (p.length < 3) return;
            final String name = p[0];
            final float k;
            try { k = Float.parseFloat(p[2]); } catch (NumberFormatException ex) { return; }
            runOnUiThread(() -> {
                label.setText(name + "  " + Math.round(k * 100) + "%");
                label.animate().cancel();
                label.setAlpha(1f);
                handler.removeCallbacks(hideLabel);
                handler.postDelayed(hideLabel, 1500);
                arc.setLevel(k);
            });
        }
    }

    /** Thin glowing ring around the round screen showing intensity. */
    static class ArcView extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint level = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float k = 0f;

        ArcView(Context c) {
            super(c);
            track.setStyle(Paint.Style.STROKE);
            track.setColor(0x33FFFFFF);
            level.setStyle(Paint.Style.STROKE);
            level.setStrokeCap(Paint.Cap.ROUND);
        }

        void setLevel(float v) { k = Math.max(0f, Math.min(1f, v)); invalidate(); }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            float sw = w * 0.018f;
            track.setStrokeWidth(sw);
            level.setStrokeWidth(sw * 1.3f);
            box.set(sw * 1.2f, sw * 1.2f, w - sw * 1.2f, h - sw * 1.2f);
            level.setShader(new SweepGradient(w / 2f, h / 2f,
                    new int[]{0xFF00FFD0, 0xFFFF3CAC, 0xFFFFE53C, 0xFF00FFD0}, null));
        }

        @Override protected void onDraw(Canvas c) {
            c.drawArc(box, 0, 360, false, track);
            if (k > 0.001f) {
                c.save();
                c.rotate(-90, getWidth() / 2f, getHeight() / 2f);
                c.drawArc(box, 0, 360 * k, false, level);
                c.restore();
            }
        }
    }
}
