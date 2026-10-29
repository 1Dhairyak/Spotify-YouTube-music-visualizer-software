package io.github.onedhairyak.lyricconstellation;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicBoolean;

/** The page's way to hear what's playing (window.Media): records a few seconds from the microphone, asks Shazam,
 *  and hands the answer to window.__heard(json). Nothing is recorded while the app isn't on screen. */
public class Media {
    static final int SECONDS = 10;   // long enough for Shazam to match through a phone mic
    private final Context ctx;
    private final WebView web;
    private final AtomicBoolean busy = new AtomicBoolean();
    volatile boolean onScreen;

    Media(Context ctx, WebView web) { this.ctx = ctx; this.web = web; }

    static boolean granted(Context ctx) {
        return ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public boolean granted() { return granted(ctx); }

    /** Height of the status-bar strip at the top, in CSS px: taps there go to Android, not to the page. */
    @JavascriptInterface
    public float topInset() {
        Activity a = (Activity) ctx;
        int px = 0;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets in = a.getWindow().getDecorView().getRootWindowInsets();
            if (in != null) px = Math.max(in.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars()).top,
                                          in.getInsetsIgnoringVisibility(WindowInsets.Type.displayCutout()).top);
        }
        if (px == 0) {
            int id = a.getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (id > 0) px = a.getResources().getDimensionPixelSize(id);
        }
        return px / a.getResources().getDisplayMetrics().density;
    }

    /** Asks for the microphone; once Android stops showing the prompt (denied before), opens the app's settings. */
    @JavascriptInterface
    public void askMic() {
        Activity a = (Activity) ctx;
        a.runOnUiThread(() -> {
            SharedPreferences prefs = a.getPreferences(Context.MODE_PRIVATE);
            if (!prefs.getBoolean("askedMic", false) || a.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) {
                prefs.edit().putBoolean("askedMic", true).apply();
                a.requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, 1);
            } else {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", a.getPackageName(), null)));
            }
        });
    }

    /** Starts one listen unless one is running; the answer arrives later in window.__heard. */
    @JavascriptInterface
    public boolean listen() {
        if (!onScreen || !granted(ctx) || !busy.compareAndSet(false, true)) return false;
        new Thread(() -> {
            JSONObject out = new JSONObject();
            try {
                long startedAt = System.currentTimeMillis();
                short[] pcm = record();
                out.put("startedAt", startedAt);
                if (pcm == null) out.put("error", "stopped");
                else if (rms(pcm) < 60) out.put("silent", true);   // ~-55 dBFS: nothing playing nearby
                else out.put("answer", new JSONObject(Shazam.recognize(Signature.uri(pcm), pcm.length * 1000 / Signature.RATE)));
            } catch (Exception e) {   // offline, Shazam refused, mic taken by another app
                try { out.put("error", String.valueOf(e.getMessage())); } catch (JSONException ignored) { }
            } finally {
                busy.set(false);
            }
            String js = "window.__heard && window.__heard(" + JSONObject.quote(out.toString()) + ")";
            web.post(() -> web.evaluateJavascript(js, null));
        }, "listen").start();
        return true;
    }

    @SuppressLint("MissingPermission")   // checked in listen()
    private short[] record() {
        File fake = new File(ctx.getFilesDir(), "test-mic.pcm");
        if ((ctx.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0 && fake.exists()) return fakeRecord(fake);
        int min = AudioRecord.getMinBufferSize(Signature.RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.MIC, Signature.RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, Math.max(min, Signature.RATE));
        short[] pcm = new short[Signature.RATE * SECONDS];
        try {
            rec.startRecording();
            for (int got = 0; got < pcm.length; ) {
                if (!onScreen) return null;   // the app went to the background: stop at once
                int n = rec.read(pcm, got, Math.min(1600, pcm.length - got));
                if (n <= 0) return null;
                got += n;
            }
            return pcm;
        } finally {
            rec.release();
        }
    }

    /** Debug builds only, for testing in the emulator (whose mic is the PC's): "hears" files/test-mic.pcm (16 kHz mono
     *  16-bit) as if it had started playing when the file was written, in real time; past its end there is silence. */
    private short[] fakeRecord(File f) {
        short[] pcm = new short[Signature.RATE * SECONDS];
        long from = (System.currentTimeMillis() - f.lastModified()) * Signature.RATE / 1000;   // samples already "played"
        try (RandomAccessFile in = new RandomAccessFile(f, "r")) {
            byte[] b = new byte[pcm.length * 2];
            if (from * 2 < in.length()) { in.seek(from * 2); in.read(b); }
            ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(pcm);
        } catch (IOException e) {
            return null;
        }
        for (long until = System.currentTimeMillis() + SECONDS * 1000L; System.currentTimeMillis() < until; ) {   // take as long as a real recording
            if (!onScreen) return null;
            SystemClock.sleep(100);
        }
        return pcm;
    }

    private static double rms(short[] pcm) {
        double sum = 0;
        for (short s : pcm) sum += (double) s * s;
        return Math.sqrt(sum / pcm.length);
    }

    /** Play/pause whatever app is playing, like the headset button: needs no permission. */
    @JavascriptInterface
    public void playPause() {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
        am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
    }
}
