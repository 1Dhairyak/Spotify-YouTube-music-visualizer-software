package io.github.onedhairyak.lyricconstellation;

import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** What the phone is playing, for the page (window.Media). Needs notification access to see other apps' sessions. */
public class Media {
    private final Context ctx;

    Media(Context ctx) { this.ctx = ctx; }

    static boolean granted(Context ctx) {
        String on = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(ctx, MediaListener.class).flattenToString());
    }

    /** The playing session, else the first one, else null. */
    private MediaController current() {
        if (!granted(ctx)) return null;
        MediaSessionManager msm = (MediaSessionManager) ctx.getSystemService(Context.MEDIA_SESSION_SERVICE);
        List<MediaController> all = msm.getActiveSessions(new ComponentName(ctx, MediaListener.class));
        for (MediaController c : all) {
            PlaybackState s = c.getPlaybackState();
            if (s != null && s.getState() == PlaybackState.STATE_PLAYING) return c;
        }
        return all.isEmpty() ? null : all.get(0);
    }

    /** {granted, app, title, artist, playing, pos (s, -1 if unknown), dur (s, 0 if unknown)} as JSON. */
    @JavascriptInterface
    public String state() {
        JSONObject o = new JSONObject();
        try {
            o.put("granted", granted(ctx));
            MediaController c = current();
            MediaMetadata m = c == null ? null : c.getMetadata();
            if (m != null) {
                PlaybackState s = c.getPlaybackState();
                boolean playing = s != null && s.getState() == PlaybackState.STATE_PLAYING;
                double pos = -1;
                if (s != null && s.getPosition() >= 0) {
                    long ms = s.getPosition();
                    if (playing) ms += (long) ((SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime()) * s.getPlaybackSpeed());
                    pos = ms / 1000.0;
                }
                o.put("app", c.getPackageName());
                o.put("title", m.getString(MediaMetadata.METADATA_KEY_TITLE));
                o.put("artist", m.getString(MediaMetadata.METADATA_KEY_ARTIST));
                o.put("playing", playing);
                o.put("pos", pos);
                o.put("dur", Math.max(0, m.getLong(MediaMetadata.METADATA_KEY_DURATION)) / 1000.0);
            }
        } catch (JSONException | SecurityException ignored) {
            // a session closing mid-read or access just revoked: report what we have
        }
        return o.toString();
    }

    /** The player's own cover as a data: URL (used when iTunes has no match), or null. */
    @JavascriptInterface
    public String art() {
        MediaController c = current();
        MediaMetadata m = c == null ? null : c.getMetadata();
        Bitmap b = m == null ? null : m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (b == null && m != null) b = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (b == null) return null;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 90, out);
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    @JavascriptInterface
    public void playPause() {
        MediaController c = current();
        if (c == null) return;
        PlaybackState s = c.getPlaybackState();
        if (s != null && s.getState() == PlaybackState.STATE_PLAYING) c.getTransportControls().pause();
        else c.getTransportControls().play();
    }
}
