export type PlaybackSnapshot = {
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  muted: boolean;
  ready: boolean;
  error: string | null;
};
export interface AudioPort {
  currentTime: number;
  duration: number;
  playbackRate: number;
  muted: boolean;
  paused: boolean;
  readyState: number;
  ended: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(name: string, listener: () => void): void;
  removeEventListener(name: string, listener: () => void): void;
}
export type Scheduler = {
  request(callback: () => void): number;
  cancel(id: number): void;
};
export function initialPlayback(duration: number): PlaybackSnapshot {
  return {
    time: 0,
    duration,
    playing: false,
    speed: 1,
    muted: false,
    ready: false,
    error: null,
  };
}

/** The only advancing clock is audio.currentTime. No renderer owns a timer. */
export class ClassroomClock {
  private snapshot: PlaybackSnapshot;
  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
  private frame: number | null = null;
  private disposed = false;
  private epoch = 0;
  private handlers: [string, () => void][];

  private audio: AudioPort;
  private duration: number;
  private scheduler: Scheduler;
  constructor(audio: AudioPort, duration: number, scheduler: Scheduler) {
    this.audio = audio;
    this.duration = duration;
    this.scheduler = scheduler;
    this.snapshot = initialPlayback(duration);
    this.handlers = [
      ['loadedmetadata', () => this.metadata()],
      ['canplay', () => this.metadata()],
      ['timeupdate', () => this.sync()],
      ['seeking', () => this.sync()],
      ['seeked', () => this.sync()],
      [
        'play',
        () => {
          this.sync();
          this.schedule();
        },
      ],
      [
        'pause',
        () => {
          this.stop();
          this.sync();
        },
      ],
      ['ratechange', () => this.sync()],
      ['volumechange', () => this.sync()],
      [
        'ended',
        () => {
          this.stop();
          this.sync();
        },
      ],
      ['error', () => this.fail('音频无法播放，请检查课堂音频资源。')],
    ];
    this.handlers.forEach(([name, handler]) =>
      audio.addEventListener(name, handler),
    );
    if (audio.readyState >= 1) this.metadata();
  }
  getSnapshot = () => this.snapshot;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private update(patch: Partial<PlaybackSnapshot>) {
    if (this.disposed) return;
    const next = { ...this.snapshot, ...patch };
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof PlaybackSnapshot] ===
          this.snapshot[key as keyof PlaybackSnapshot],
      )
    )
      return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener(next));
  }
  private sync() {
    this.update({
      // Native media clocks round to microseconds; preserve exact end events.
      time:
        this.audio.ended || this.audio.currentTime >= this.duration - 0.000001
          ? this.duration
          : Math.max(0, Math.min(this.audio.currentTime, this.duration)),
      playing: !this.audio.paused && !this.audio.ended && !this.snapshot.error,
      speed: this.audio.playbackRate,
      muted: this.audio.muted,
    });
  }
  private metadata() {
    if (
      !Number.isFinite(this.audio.duration) ||
      Math.abs(this.audio.duration - this.duration) > 0.3
    ) {
      this.fail('音频时长与课程时间轴不一致，请重新编译课程。');
      return;
    }
    this.update({ ready: this.audio.readyState >= 2 });
    this.sync();
  }
  private fail(error: string) {
    this.epoch++;
    this.stop();
    this.audio.pause();
    this.update({ error, playing: false });
  }
  private schedule() {
    if (
      this.disposed ||
      this.frame !== null ||
      this.audio.paused ||
      this.snapshot.error
    )
      return;
    this.frame = this.scheduler.request(() => {
      this.frame = null;
      if (this.disposed) return;
      this.sync();
      this.schedule();
    });
  }
  private stop() {
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
  }
  async play() {
    if (this.disposed || this.snapshot.error) return;
    if (this.audio.currentTime >= this.duration - 0.01) this.seek(0);
    const epoch = ++this.epoch;
    try {
      await this.audio.play();
      if (this.disposed || epoch !== this.epoch) return;
      this.sync();
      this.schedule();
    } catch {
      if (!this.disposed && epoch === this.epoch) {
        this.stop();
        this.update({
          playing: false,
          error: '播放未成功，请检查音频或浏览器播放权限。',
        });
      }
    }
  }
  pause() {
    if (this.disposed) return;
    this.epoch++;
    this.audio.pause();
    this.stop();
    this.sync();
  }
  seek(seconds: number) {
    if (!Number.isFinite(seconds)) throw new Error('跳转时间必须是有限数字。');
    if (this.disposed) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.duration));
    this.sync();
  }
  restart() {
    this.pause();
    this.seek(0);
  }
  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 3)
      throw new Error('倍速范围为 0.25～3。');
    if (this.disposed) return;
    this.audio.playbackRate = speed;
    this.sync();
  }
  setMuted(muted: boolean) {
    if (this.disposed) return;
    this.audio.muted = muted;
    this.sync();
  }
  destroy() {
    this.epoch++;
    this.disposed = true;
    this.stop();
    this.handlers.forEach(([name, handler]) =>
      this.audio.removeEventListener(name, handler),
    );
    this.audio.pause();
    this.listeners.clear();
  }
}
