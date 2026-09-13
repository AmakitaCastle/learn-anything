import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PCM_SAMPLE_RATE = 24000;
export const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * 2;
export interface LessonAudioProcessor {
  prepare?(): Promise<void>;
  decodeMp3(audio: Buffer): Promise<Buffer>;
  encodeMp3(pcm: Buffer): Promise<{ audio: Buffer; duration: number }>;
}

function run(command: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { encoding: 'buffer', maxBuffer: 400 * 1024 * 1024, timeout: 60_000 },
      (error, stdout) =>
        error
          ? reject(
              new Error('本地音频处理失败，请检查 FFmpeg/FFprobe 和音频文件。'),
            )
          : resolve(stdout),
    );
    // Do not echo stderr or command paths into provider-facing errors.
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);
  });
}
export function pcmWav(pcm: Buffer): Buffer {
  if (!pcm.length || pcm.length % 2 || pcm.length > PCM_BYTES_PER_SECOND * 7200)
    throw new Error('PCM 数据为空、采样不完整或超过两小时。');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Optional runtime adapter. Building/using injected audio adapters needs no FFmpeg.
export function createFfmpegAudioProcessor(
  options: { ffmpeg?: string; ffprobe?: string } = {},
): LessonAudioProcessor {
  const ffmpeg = options.ffmpeg ?? 'ffmpeg',
    ffprobe = options.ffprobe ?? 'ffprobe';
  return {
    async prepare() {
      await run(ffmpeg, ['-version']);
      await run(ffprobe, ['-version']);
    },
    async decodeMp3(audio) {
      return run(
        ffmpeg,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'pipe',
          '-f',
          'mp3',
          '-i',
          'pipe:0',
          '-ar',
          '24000',
          '-ac',
          '1',
          '-f',
          's16le',
          'pipe:1',
        ],
        audio,
      );
    },
    async encodeMp3(pcm) {
      const wav = pcmWav(pcm);
      const directory = await mkdtemp(join(tmpdir(), 'learn-anything-audio-'));
      try {
        const target = join(directory, 'audio.mp3');
        await run(
          ffmpeg,
          [
            '-n',
            '-v',
            'error',
            '-i',
            'pipe:0',
            '-codec:a',
            'libmp3lame',
            '-b:a',
            '128k',
            target,
          ],
          wav,
        );
        const duration = Number(
          (
            await run(ffprobe, [
              '-v',
              'error',
              '-show_entries',
              'format=duration',
              '-of',
              'default=noprint_wrappers=1:nokey=1',
              target,
            ])
          )
            .toString()
            .trim(),
        );
        await run(ffmpeg, ['-v', 'error', '-i', target, '-f', 'null', '-']);
        if (
          !Number.isFinite(duration) ||
          duration <= 0 ||
          Math.abs(duration - pcm.length / PCM_BYTES_PER_SECOND) > 0.1
        )
          throw new Error('编码后的音频时长与实测采样不一致。');
        return { audio: await readFile(target), duration };
      } finally {
        // Only this invocation's newly allocated directory is removed.
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
