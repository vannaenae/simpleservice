import {it,expect} from 'vitest';
import {encodeWav} from './local-audio';
it('resamples capture to a valid 16 kHz mono PCM WAV',()=>{const wav=encodeWav(new Float32Array(48000).fill(.5),48000);const v=new DataView(wav);expect(v.getUint32(24,true)).toBe(16000);expect(v.getUint32(40,true)).toBe(32000);expect(v.getInt16(44,true)).toBe(16384);expect(wav.byteLength).toBe(32044);});
it('clamps clipped microphone samples',()=>{const v=new DataView(encodeWav(new Float32Array([2,-2]),16000));expect(v.getInt16(44,true)).toBe(32767);expect(v.getInt16(46,true)).toBe(-32768);});
