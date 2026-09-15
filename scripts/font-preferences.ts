import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_FONTS,
  parseFontSelection,
  type FontSelection,
} from '@learn-anything/lesson-schema';
export const fontPreferencePath = () =>
  join(homedir(), '.config', 'learn-anything', 'fonts.json');
export async function readFontPreferences(
  path = fontPreferencePath(),
): Promise<FontSelection> {
  try {
    return parseFontSelection(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return { ...DEFAULT_FONTS };
  }
}
export async function writeFontPreferences(
  fonts: FontSelection,
  path = fontPreferencePath(),
) {
  const checked = parseFontSelection(fonts);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(checked), {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
