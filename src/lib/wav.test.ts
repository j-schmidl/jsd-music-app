import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function readString(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodeWav', () => {
  it('writes a valid 44-byte mono PCM header', async () => {
    const view = await bytes(encodeWav(Float32Array.of(0, 0, 0, 0), 48000));
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(readString(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readString(view, 36, 4)).toBe('data');
  });

  it('produces 44 + 2*N bytes and matching data size', async () => {
    const blob = encodeWav(new Float32Array(100), 44100);
    expect(blob.size).toBe(44 + 100 * 2);
    const view = await bytes(blob);
    expect(view.getUint32(40, true)).toBe(100 * 2); // data chunk size
  });

  it('clamps out-of-range samples to full scale', async () => {
    const view = await bytes(encodeWav(Float32Array.of(2, -2), 8000));
    expect(view.getInt16(44, true)).toBe(0x7fff); // +full scale
    expect(view.getInt16(46, true)).toBe(-0x8000); // -full scale
  });
});
