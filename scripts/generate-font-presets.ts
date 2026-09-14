// Developer-only asset generation. Runtime viewers generate course-specific
// paths lazily; the React package ships coverage for the bundled examples.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHandwritingCharacters } from '@learn-anything/content-generator';
import {
  lessonFontCharacters,
  builtinChineseFontPath,
} from './lesson-fonts.ts';
import type { LessonSpec } from '@learn-anything/lesson-schema';
const root = fileURLToPath(new URL('../', import.meta.url));
const characters = new Set<string>();
for (const name of await readdir(join(root, 'public/lessons'))) {
  if (!name.endsWith('.json')) continue;
  const data = JSON.parse(
    await readFile(join(root, 'public/lessons', name), 'utf8'),
  );
  lessonFontCharacters(data as LessonSpec).forEach((char) =>
    characters.add(char),
  );
}
const target = join(root, 'packages/lesson-player/fonts/choices');
await mkdir(target, { recursive: true });
await writeFile(
  join(root, 'assets/fonts/preset-characters.txt'),
  [...characters].sort().join(''),
);
for (const id of ['xiaolai', 'wenkai'] as const) {
  const { bundle, missing } = await generateHandwritingCharacters(
    [...characters],
    {
      fontPath: builtinChineseFontPath(id),
      cacheRoot: join(root, 'outputs/handwriting'),
      fontUrl: `/fonts/${id}.ttf`,
    },
  );
  // Subset files are created from the same source with unchanged units/metrics.
  await writeFile(join(target, `${id}.json`), JSON.stringify(bundle));
  await writeFile(
    join(target, `${id}.ts`),
    `import fontUrl from './${id}.ttf?url';\nimport data from './${id}.json' with { type: 'json' };\nimport { parseHandwritingBundle } from '@learn-anything/lesson-schema';\nconst bundle = { ...parseHandwritingBundle(data), fontUrl };\nexport default bundle;\n`,
  );
  console.log(
    `${id}: ${Object.keys(bundle.glyphData).length} glyphs, ${missing.length} missing`,
  );
}
