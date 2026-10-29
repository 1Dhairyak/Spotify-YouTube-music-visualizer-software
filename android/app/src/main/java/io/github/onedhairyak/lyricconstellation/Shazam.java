/*
 * Asks Shazam which song a signature (see Signature) belongs to. Same request as SongRec and shazamio:
 * an unofficial endpoint of Shazam's own apps, so it may change or stop answering. Plain Java, testable on a desktop JVM.
 * GPL-3.0-or-later, like the rest of the Android app (see android/LICENSE).
 */
package io.github.onedhairyak.lyricconstellation;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;
import java.util.UUID;

public final class Shazam {
    private static final String URL_FMT = "https://amp.shazam.com/discovery/v5/en/US/android/-/tag/%s/%s"
            + "?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&video=v3";

    private Shazam() {}

    /** Shazam's JSON answer (track title/subtitle/images, matches[0].offset in seconds) for a signature data: URI. */
    public static String recognize(String sigUri, int sampleMs) throws IOException {
        String body = "{\"timezone\":\"" + TimeZone.getDefault().getID() + "\",\"signature\":{\"uri\":\"" + sigUri
                + "\",\"samplems\":" + sampleMs + "},\"timestamp\":" + System.currentTimeMillis()
                + ",\"context\":{},\"geolocation\":{}}";
        HttpURLConnection c = (HttpURLConnection) new URL(String.format(URL_FMT,
                UUID.randomUUID().toString().toUpperCase(), UUID.randomUUID().toString().toUpperCase())).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("X-Shazam-Platform", "IPHONE");
        c.setRequestProperty("X-Shazam-AppVersion", "14.1.0");
        c.setRequestProperty("User-Agent", "Dalvik/2.1.0 (Linux; U; Android 6.0.1; SM-G920F Build/MMB29K)");
        try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        try (InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; in != null && (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            if (code >= 400) throw new IOException("Shazam answered " + code);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
