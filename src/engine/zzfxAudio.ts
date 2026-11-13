import type { ZzfxPresetName } from './types';

export type ZzfxParams = Array<number | undefined>;

export const ZZFX_PRESETS: Record<ZzfxPresetName, ZzfxParams> = {
  slash: [0.9, 0.08, 340, 0.01, 0.03, 0.09, 3, 1.4, -14, -4, 0, 0, 0, 0.8, 0, 0.1, 0, 0.65, 0.02, 0],
  hit: [1.1, 0.05, 165, 0.005, 0.02, 0.11, 2, 1.8, -10, 0, -60, 0.02, 0, 1.2, 8, 0.25, 0, 0.7, 0.02, 0],
  jump: [0.85, 0.03, 280, 0.01, 0.04, 0.12, 1, 1.2, 8.5, 0.4, 90, 0.04, 0, 0, 0, 0, 0, 0.75, 0.02, 0],
  dash: [0.8, 0.05, 520, 0.005, 0.02, 0.1, 3, 0.8, -18, 0, 0, 0, 0, 1.4, 0, 0.15, 0, 0.55, 0.02, 0],
  hurt: [1.0, 0.04, 210, 0.01, 0.06, 0.18, 2, 1.5, -11, -1.2, -70, 0.05, 0, 0.6, 6, 0.3, 0, 0.7, 0.04, 0],
  coin: [0.9, 0.02, 920, 0.01, 0.04, 0.16, 1, 1.3, 0, 0, 320, 0.05, 0, 0, 0, 0, 0, 0.8, 0.02, 0],
  powerup: [0.9, 0.02, 420, 0.02, 0.08, 0.24, 1, 1.4, 6.2, 0.6, 180, 0.07, 0.09, 0, 0, 0, 0, 0.8, 0.04, 0],
  explosion: [1.15, 0.08, 95, 0.01, 0.09, 0.36, 4, 2.1, -2.5, -0.5, 0, 0, 0, 2.2, 0, 0.45, 0.08, 0.65, 0.06, 0.05],
};

interface ZzfxModuleLike {
  zzfx: (...parameters: ZzfxParams) => AudioBufferSourceNode;
  ZZFX: {
    volume: number;
    audioContext: AudioContext;
  };
}

class ZzfxAudioBridge {
  private modPromise: Promise<ZzfxModuleLike | null> | null = null;
  private mod: ZzfxModuleLike | null = null;
  private muted = false;
  private masterVolume = 0.28;
  private lastPlayedAt = new Map<string, number>();

  private isBrowserAudioAvailable(): boolean {
    return typeof window !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  private async ensureLoaded(): Promise<ZzfxModuleLike | null> {
    if (!this.isBrowserAudioAvailable()) return null;
    if (this.mod) return this.mod;
    if (!this.modPromise) {
      this.modPromise = import('zzfx')
        .then((m) => {
          this.mod = m as ZzfxModuleLike;
          this.mod.ZZFX.volume = this.muted ? 0 : this.masterVolume;
          return this.mod;
        })
        .catch(() => null);
    }
    return this.modPromise;
  }

  public unlock() {
    if (!this.isBrowserAudioAvailable()) return;
    void this.ensureLoaded().then((m) => {
      if (m?.ZZFX?.audioContext && m.ZZFX.audioContext.state === 'suspended') {
        void m.ZZFX.audioContext.resume().catch(() => {});
      }
    });
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.mod?.ZZFX) {
      this.mod.ZZFX.volume = muted ? 0 : this.masterVolume;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.mod?.ZZFX && !this.muted) {
      this.mod.ZZFX.volume = this.masterVolume;
    }
  }

  public playRaw(params: ZzfxParams, throttleKey?: string) {
    if (this.muted || !this.isBrowserAudioAvailable()) return;
    const now = performance.now();
    if (throttleKey) {
      const prev = this.lastPlayedAt.get(throttleKey) ?? 0;
      if (now - prev < 45) return;
      this.lastPlayedAt.set(throttleKey, now);
    }

    void this.ensureLoaded().then((m) => {
      if (!m || this.muted) return;
      try {
        if (m.ZZFX.audioContext.state === 'suspended') {
          void m.ZZFX.audioContext.resume().catch(() => {});
        }
        m.ZZFX.volume = this.masterVolume;
        m.zzfx(...params);
      } catch {
        // Ignore audio errors in restricted headless contexts
      }
    });
  }

  public playPreset(name: ZzfxPresetName) {
    const preset = ZZFX_PRESETS[name];
    if (!preset) return;
    this.playRaw(preset, `preset:${name}`);
  }
}

export const zzfxBridge = new ZzfxAudioBridge();

// Compact ZzFX micro-runtime embedded into standalone exported HTML builds
export const ZZFX_MICRO_RUNTIME_JS =
  'let zzfxV=0.25,zzfxX=null;function zzfx(...t){try{if(!zzfxX)zzfxX=new(window.AudioContext||window.webkitAudioContext)();if(zzfxX.state==="suspended")zzfxX.resume();let[e=1,f=0.05,n=220,a=0,s=0,l=0.1,r=0,h=1,o=0,i=0,c=0,u=0,d=0,g=0,m=0,p=0,y=0,w=1,v=0]=t,x=Math.PI*2,M=44100,b=a*M+9|0,k=v*M|0,S=s*M|0,R=l*M|0,L=y*M|0,N=b+k+S+R+L,B=new Float32Array(N),q=0,z=0,C=0,E=0,F=0,G=0,H=1;o*=500*x/M/M;i*=500*x/M/M;c*=x/M;n*=x/M;u=u*M|0;d=d*M|0;for(let j=0;j<N;++j){if(!(++E%(p*100|0))){q=r?r>1?r>2?r>3?Math.sin((z%x)**3):Math.max(Math.min(Math.tan(z),1),-1):1-(2*z/x%2+2)%2:1-4*Math.abs(Math.round(z/x)-z/x):Math.sin(z);q=(d?1-y+y*Math.sin(x*j/d):1)*(q<0?-1:1)*Math.abs(q)**h*e*zzfxV*(j<b?j/b:j<b+k?1-(j-b)/k*(1-w):j<b+k+S?w:j<N-L?(N-j-L)/R*w:0);q=y?q/2+(y>j?0:(j<N-L?1:(N-j)/L)*B[j-L|0]/2):q;}F=(n+=o+=i)*Math.cos(m*C++);z+=F-F*g*(1-1e9*(Math.sin(j)+1)%2);if(u&&++G>u){n+=c;q+=c;u=0;}if(d&&!(j%d)){n=t[2]*x/M;z=0;G=0;}B[j]=q;}let buf=zzfxX.createBuffer(1,N,M);buf.getChannelData(0).set(B);let src=zzfxX.createBufferSource();src.buffer=buf;src.connect(zzfxX.destination);src.start();}catch{}}';
