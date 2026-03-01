/**
 * AudioCapture service – manages microphone input and Web Audio API context.
 *
 * Initialises an AudioContext and AnalyserNode from the user's microphone,
 * exposes raw time-domain and frequency-domain buffers, and fires a callback
 * on every animation frame so consumers can run analysis on fresh audio data.
 */

export interface AudioCaptureBuffers {
  timeDomain: Float32Array;
  frequencyDomain: Float32Array;
  sampleRate: number;
  fftSize: number;
}

export type AudioFrameCallback = (buffers: AudioCaptureBuffers) => void;

export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private timeDomainBuf: Float32Array<ArrayBuffer> = new Float32Array(0);
  private freqDomainBuf: Float32Array<ArrayBuffer> = new Float32Array(0);

  readonly fftSize: number;

  constructor(fftSize: number = 4096) {
    this.fftSize = fftSize;
  }

  /** Request microphone permission and start the audio context. */
  async start(onFrame: AudioFrameCallback): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.audioCtx = new AudioContext();

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = this.fftSize;

    this.timeDomainBuf = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    this.freqDomainBuf = new Float32Array(this.analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;

    const source = this.audioCtx.createMediaStreamSource(this.stream);
    source.connect(this.analyser);

    const tick = () => {
      if (!this.analyser || !this.audioCtx) return;
      this.analyser.getFloatTimeDomainData(this.timeDomainBuf);
      this.analyser.getFloatFrequencyData(this.freqDomainBuf);
      onFrame({
        timeDomain: this.timeDomainBuf,
        frequencyDomain: this.freqDomainBuf,
        sampleRate: this.audioCtx.sampleRate,
        fftSize: this.fftSize,
      });
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop recording and release all resources. */
  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.audioCtx) this.audioCtx.close();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.rafId = null;
  }

  get isActive(): boolean {
    return this.audioCtx !== null;
  }

  /** Returns the sample rate of the current AudioContext, or 44100 if not yet started. */
  get sampleRate(): number {
    return this.audioCtx?.sampleRate ?? 44100;
  }
}
