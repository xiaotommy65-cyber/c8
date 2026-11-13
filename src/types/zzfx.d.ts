declare module 'zzfx' {
  export function zzfx(...parameters: Array<number | undefined>): AudioBufferSourceNode;

  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    play: (...parameters: Array<number | undefined>) => AudioBufferSourceNode;
    playSamples: (
      sampleChannels: Float32Array[],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean,
    ) => AudioBufferSourceNode;
    buildSamples: (...parameters: Array<number | undefined>) => Float32Array;
  };
}
