// Downsample an audio buffer to per-bucket peak amplitudes for waveform drawing.
// Pure so it can be unit tested; the canvas component just maps peaks to pixels.

/**
 * Reduce `buf` to `buckets` peak values (max absolute amplitude per bucket).
 * Returns a Float32Array of length `buckets`. When the buffer is shorter than
 * the bucket count, empty buckets are 0.
 */
export function computePeaks(buf: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(Math.max(0, buckets));
  if (buckets <= 0 || buf.length === 0) return out;
  const per = buf.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(buf.length, Math.floor((b + 1) * per));
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    out[b] = peak;
  }
  return out;
}
