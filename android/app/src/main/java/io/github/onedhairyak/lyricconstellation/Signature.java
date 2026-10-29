/*
 * Shazam audio signature from 16 kHz mono PCM: a Java port of SongRec's fingerprinting
 * (src/core/fingerprinting/algorithm.rs and signature_format.rs), Copyright (C) Marin Moulinier and contributors,
 * https://github.com/marin-m/SongRec, licensed GPL-3.0-or-later. This port is licensed the same way; see
 * android/LICENSE. Plain Java (no Android classes), so it can be tested on a desktop JVM.
 */
package io.github.onedhairyak.lyricconstellation;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.zip.CRC32;

public final class Signature {
    public static final int RATE = 16000;
    private static final int N = 2048, BINS = 1025;
    private static final float[] HANNING = new float[N];
    private static final double[] COS = new double[N / 2], SIN = new double[N / 2];
    private static final int[] REV = new int[N];

    static {
        for (int i = 0; i < N; i++) HANNING[i] = (float) (0.5 * (1 - Math.cos(2 * Math.PI * (i + 1) / (N + 1))));
        for (int i = 0; i < N / 2; i++) { COS[i] = Math.cos(-2 * Math.PI * i / N); SIN[i] = Math.sin(-2 * Math.PI * i / N); }
        for (int i = 0, bits = Integer.numberOfTrailingZeros(N); i < N; i++) REV[i] = Integer.reverse(i) >>> (32 - bits);
    }

    private static final class Peak {
        final int pass, magnitude, bin;
        Peak(int pass, int magnitude, int bin) { this.pass = pass; this.magnitude = magnitude; this.bin = bin; }
    }

    private final short[] ring = new short[N];
    private int ringIndex;
    private final float[][] fftOut = new float[256][BINS], spread = new float[256][BINS];
    private int fftIndex, spreadIndex, spreadDone;
    private final List<List<Peak>> bands = new ArrayList<>();
    private final double[] re = new double[N], im = new double[N];

    private Signature() { for (int b = 0; b < 4; b++) bands.add(new ArrayList<>()); }

    /** The data: URI Shazam expects ("data:audio/vnd.shazam.sig;base64,..."), from 16 kHz mono 16-bit samples. */
    public static String uri(short[] pcm) {
        Signature s = new Signature();
        for (int at = 0; at + 128 <= pcm.length; at += 128) {
            s.doFft(pcm, at);
            s.doPeakSpreading();
            s.spreadDone++;
            if (s.spreadDone >= 46) s.doPeakRecognition();
        }
        return "data:audio/vnd.shazam.sig;base64," + Base64.getEncoder().encodeToString(s.encode(pcm.length));
    }

    private void doFft(short[] pcm, int at) {
        System.arraycopy(pcm, at, ring, ringIndex, 128);
        ringIndex = (ringIndex + 128) & (N - 1);
        for (int i = 0; i < N; i++) { re[REV[i]] = ring[(i + ringIndex) & (N - 1)] * HANNING[i]; im[REV[i]] = 0; }
        for (int size = 2; size <= N; size <<= 1) {   // iterative radix-2 FFT
            int half = size >> 1, step = N / size;
            for (int start = 0; start < N; start += size) {
                for (int k = 0; k < half; k++) {
                    double c = COS[k * step], s = SIN[k * step];
                    int a = start + k, b = a + half;
                    double tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                }
            }
        }
        float[] out = fftOut[fftIndex];
        for (int i = 0; i < BINS; i++) out[i] = (float) Math.max((re[i] * re[i] + im[i] * im[i]) / (1 << 17), 1e-10);
        fftIndex = (fftIndex + 1) & 255;
    }

    private void doPeakSpreading() {
        float[] src = fftOut[(fftIndex - 1) & 255], dst = spread[spreadIndex];
        System.arraycopy(src, 0, dst, 0, BINS);
        for (int p = 0; p <= 1022; p++) dst[p] = Math.max(dst[p], Math.max(dst[p + 1], dst[p + 2]));   // frequency domain
        float[] copy = dst.clone();
        for (int p = 0; p < BINS; p++) {   // time domain
            for (int former : new int[] {1, 3, 6}) {
                float[] f = spread[(spreadIndex - former) & 255];
                f[p] = Math.max(f[p], copy[p]);
            }
        }
        spreadIndex = (spreadIndex + 1) & 255;
    }

    private static final int[] NEAR = {-10, -7, -4, -3, 1, 2, 5, 8};
    private static final int[] OTHER = {-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249};

    private void doPeakRecognition() {
        float[] m46 = fftOut[(fftIndex - 46) & 255], s49 = spread[(spreadIndex - 49) & 255];
        for (int bin = 10; bin <= 1014; bin++) {
            float v = m46[bin];
            if (v < 1f / 64 || v < s49[bin - 1]) continue;
            float maxNear = 0;
            for (int o : NEAR) maxNear = Math.max(maxNear, s49[bin + o]);
            if (v <= maxNear) continue;
            float maxOther = maxNear;
            for (int o : OTHER) maxOther = Math.max(maxOther, spread[(spreadIndex + o) & 255][bin - 1]);
            if (v <= maxOther) continue;
            float mag = mag(v), before = mag(m46[bin - 1]), after = mag(m46[bin + 1]);
            float var1 = mag * 2 - before - after, var2 = (after - before) * 32 / var1;
            int corrected = (bin * 64 + (int) var2) & 0xFFFF;
            int hz = (int) (corrected * (16000f / 2 / 1024 / 64));   // whole Hz, as SongRec compares it
            int band = hz < 250 || hz > 5500 ? -1 : hz <= 519 ? 0 : hz <= 1449 ? 1 : hz <= 3499 ? 2 : 3;
            if (band < 0) continue;
            bands.get(band).add(new Peak(spreadDone - 46, ((int) mag) & 0xFFFF, corrected));
        }
    }

    private static float mag(float v) { return (float) Math.max(Math.log(v), 1.0 / 64) * 1477.3f + 6144f; }

    private byte[] encode(int numberSamples) {
        ByteBuffer body = ByteBuffer.allocate(1 << 20).order(ByteOrder.LITTLE_ENDIAN);
        body.putInt(0xcafe2580).putInt(0).putInt(0).putInt(0x94119c00).putInt(0).putInt(0).putInt(0)
            .putInt(3 << 27).putInt(0).putInt(0).putInt(numberSamples + (int) (RATE * 0.24f)).putInt((15 << 19) + 0x40000)
            .putInt(0x40000000).putInt(0);
        for (int b = 0; b < 4; b++) {
            List<Peak> peaks = bands.get(b);
            if (peaks.isEmpty()) continue;
            ByteArrayOutputStream raw = new ByteArrayOutputStream();
            ByteBuffer tmp = ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN);
            int pass = 0;
            for (Peak p : peaks) {
                if (p.pass - pass >= 255) {
                    raw.write(0xff);
                    tmp.clear();   // Android's clear() returns Buffer, so no chaining
                    raw.write(tmp.putInt(p.pass).array(), 0, 4);
                    pass = p.pass;
                }
                raw.write(p.pass - pass);
                tmp.clear();
                tmp.putShort((short) p.magnitude).putShort((short) p.bin);
                raw.write(tmp.array(), 0, 4);
                pass = p.pass;
            }
            byte[] bytes = raw.toByteArray();
            body.putInt(0x60030040 + b).putInt(bytes.length).put(bytes);
            for (int pad = (4 - bytes.length % 4) % 4; pad > 0; pad--) body.put((byte) 0);
        }
        int size = body.position();
        body.putInt(8, size - 48).putInt(48 + 4, size - 48);
        CRC32 crc = new CRC32();
        crc.update(body.array(), 8, size - 8);
        body.putInt(4, (int) crc.getValue());
        byte[] out = new byte[size];
        System.arraycopy(body.array(), 0, out, 0, size);
        return out;
    }
}
