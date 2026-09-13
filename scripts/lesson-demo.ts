import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLesson } from '@learn-anything/lesson-schema';

// Stage the shipped course in the same format as a saved CLI run. Playback
// needs neither service configuration nor FFmpeg or a local synthesis cache.
export async function prepareDemoLesson() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const lesson = parseLesson(
    JSON.parse(
      await readFile(
        join(root, 'public/lessons/heating-full-board.json'),
        'utf8',
      ),
    ),
  );
  const directory = await mkdtemp(join(tmpdir(), 'learn-anything-demo-'));
  const close = () => rm(directory, { recursive: true, force: true });
  try {
    await copyFile(
      join(root, 'public/audio/heating-full-board.mp3'),
      join(directory, 'narration.mp3'),
    );
    await copyFile(
      join(root, 'public/lessons/heating-full-board.vtt'),
      join(directory, 'captions.vtt'),
    );
    if (lesson.handwriting) {
      // Use only the bundled font, never an arbitrary course-provided path.
      await copyFile(
        join(root, 'public/fonts/handwriting-6d2546bb189c732a.ttf'),
        join(directory, 'handwriting.ttf'),
      );
    }
    await writeFile(join(directory, 'lesson.json'), JSON.stringify(lesson));
    return { directory, close };
  } catch (error) {
    await close();
    throw error;
  }
}
