import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClassroomClock,
  type AudioPort,
  type Scheduler,
} from '../packages/lesson-player/clock.ts';
class FakeAudio implements AudioPort {
  currentTime = 0;
  duration = 10;
  playbackRate = 1;
  muted = false;
  paused = true;
  readyState = 2;
  ended = false;
  listeners = new Map<string, Set<() => void>>();
  reject = false;
  pending: Promise<void> | null = null;
  async play() {
    if (this.reject) throw Error('raw private error');
    this.paused = false;
    this.emit('play');
    if (this.pending) await this.pending;
  }
  pause() {
    this.paused = true;
    this.emit('pause');
  }
  emit(name: string) {
    this.listeners.get(name)?.forEach((listener) => listener());
  }
  addEventListener(name: string, listener: () => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }
  removeEventListener(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }
}
class FakeScheduler implements Scheduler {
  next = 0;
  frames = new Map<number, () => void>();
  request(callback: () => void) {
    const id = ++this.next;
    this.frames.set(id, callback);
    return id;
  }
  cancel(id: number) {
    this.frames.delete(id);
  }
  tick() {
    const frames = [...this.frames.values()];
    this.frames.clear();
    frames.forEach((callback) => callback());
  }
}
void test('audio is the only advancing clock; pause, seek, speed, mute and restart are synchronous', async () => {
  const audio = new FakeAudio(),
    scheduler = new FakeScheduler(),
    clock = new ClassroomClock(audio, 10, scheduler);
  await clock.play();
  assert.equal(clock.getSnapshot().playing, true);
  scheduler.tick();
  assert.equal(clock.getSnapshot().time, 0, 'RAF must not invent time');
  audio.currentTime = 3.4;
  scheduler.tick();
  assert.equal(clock.getSnapshot().time, 3.4);
  clock.pause();
  scheduler.tick();
  assert.equal(clock.getSnapshot().time, 3.4);
  assert.equal(scheduler.frames.size, 0);
  clock.seek(7);
  assert.equal(audio.currentTime, 7);
  assert.equal(clock.getSnapshot().time, 7);
  clock.setSpeed(1.5);
  clock.setMuted(true);
  assert.equal(audio.playbackRate, 1.5);
  assert.equal(audio.muted, true);
  clock.restart();
  assert.equal(clock.getSnapshot().time, 0);
  assert.equal(clock.getSnapshot().playing, false);
  clock.seek(99);
  assert.equal(clock.getSnapshot().time, 10);
  clock.seek(-99);
  assert.equal(clock.getSnapshot().time, 0);
  assert.throws(() => clock.seek(NaN));
  assert.throws(() => clock.setSpeed(0));
  clock.destroy();
});
void test('play rejection is handled, duration mismatch blocks playback, and ended uses the exact lesson boundary', async () => {
  const audio = new FakeAudio(),
    scheduler = new FakeScheduler(),
    clock = new ClassroomClock(audio, 10, scheduler);
  audio.reject = true;
  await clock.play();
  assert.match(clock.getSnapshot().error!, /播放未成功/);
  assert.ok(!clock.getSnapshot().error!.includes('private'));
  clock.destroy();
  const mismatch = new FakeAudio();
  mismatch.duration = 20;
  const bad = new ClassroomClock(mismatch, 10, scheduler);
  assert.match(bad.getSnapshot().error!, /时长/);
  await bad.play();
  assert.equal(mismatch.paused, true);
  bad.destroy();
  const valid = new FakeAudio(),
    good = new ClassroomClock(valid, 10, scheduler);
  await good.play();
  valid.currentTime = 9.99;
  valid.ended = true;
  valid.paused = true;
  valid.emit('ended');
  assert.equal(good.getSnapshot().time, 10);
  assert.equal(good.getSnapshot().playing, false);
  good.destroy();
});
void test('pending play cannot revive a paused or disposed player and instances are isolated', async () => {
  let resolve!: () => void;
  const audio = new FakeAudio(),
    scheduler = new FakeScheduler();
  audio.pending = new Promise<void>((done) => {
    resolve = done;
  });
  const clock = new ClassroomClock(audio, 10, scheduler),
    other = new ClassroomClock(new FakeAudio(), 10, new FakeScheduler());
  const play = clock.play();
  clock.pause();
  resolve();
  await play;
  assert.equal(clock.getSnapshot().playing, false);
  assert.equal(scheduler.frames.size, 0);
  clock.seek(8);
  assert.equal(other.getSnapshot().time, 0);
  clock.destroy();
  assert.ok(
    [...audio.listeners.values()].every((listeners) => listeners.size === 0),
  );
  scheduler.tick();
  assert.equal(audio.paused, true);
  other.destroy();
});

void test('native microsecond rounding reaches the exact end without hiding missing audio', () => {
  const audio = new FakeAudio();
  const clock = new ClassroomClock(audio, 10.0000004, new FakeScheduler());
  clock.seek(10);
  assert.equal(clock.getSnapshot().time, 10.0000004);
  clock.seek(9.94);
  assert.equal(clock.getSnapshot().time, 9.94);
  clock.seek(0);
  assert.equal(clock.getSnapshot().time, 0);
  clock.destroy();
});
