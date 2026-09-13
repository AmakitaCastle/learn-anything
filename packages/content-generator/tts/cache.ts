import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

function cachePath(root: string, key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('无效的语音缓存标识。');
  return join(root, key);
}

export async function cachedSpeech(
  root: string,
  key: string,
): Promise<string | null> {
  const directory = cachePath(root, key);
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw new Error('已有语音缓存不可用，请手动移走对应缓存目录后重试。');
  }
  try {
    const [audio, manifest] = await Promise.all([
      readFile(join(directory, 'audio.mp3')),
      readFile(join(directory, 'manifest.json'), 'utf8'),
    ]);
    const parsed = JSON.parse(manifest);
    if (
      audio.length &&
      parsed.cacheKey === key &&
      parsed.audioSha256 === createHash('sha256').update(audio).digest('hex')
    ) {
      return join(directory, 'audio.mp3');
    }
    throw new Error('已有语音缓存损坏，请手动移走对应缓存目录后重试。');
  } catch {
    throw new Error('已有语音缓存不可用，请手动移走对应缓存目录后重试。');
  }
}

export async function saveSpeech(
  root: string,
  key: string,
  audio: Buffer,
  manifest: Record<string, unknown>,
): Promise<string> {
  const directory = cachePath(root, key);
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, '.pending-'));
  try {
    await writeFile(join(staging, 'audio.mp3'), audio, { flag: 'wx' });
    await writeFile(
      join(staging, 'manifest.json'),
      JSON.stringify(
        {
          ...manifest,
          cacheKey: key,
          audioSha256: createHash('sha256').update(audio).digest('hex'),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    await rename(staging, directory);
    return join(directory, 'audio.mp3');
  } finally {
    // Only this invocation's newly created staging directory is removed.
    await rm(staging, { recursive: true, force: true });
  }
}
