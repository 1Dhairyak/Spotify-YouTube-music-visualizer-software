package io.github.onedhairyak.lyricconstellation;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

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
