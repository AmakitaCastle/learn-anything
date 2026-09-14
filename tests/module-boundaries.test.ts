import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createLessonArtifacts } from '../packages/content-generator/artifacts.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['dist', 'node_modules'].includes(entry.name)) return [];
    const name = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sources(name)
      : /\.tsx?$/.test(entry.name)
        ? [name]
        : [];
  });
}

void test('business projects never import the application or each other', () => {
  for (const name of [
    'lesson-player',
    'content-generator',
    'lesson-draft-generator',
  ]) {
    const directory = resolve(root, 'packages', name);
    for (const file of sources(directory)) {
      const code = readFileSync(file, 'utf8');
      const imports = [
        ...code.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g),
      ].map((match) => match[1]);
      for (const dependency of imports) {
        if (dependency.startsWith('.')) {
          const target = relative(
            directory,
            resolve(dirname(file), dependency),
          );
          assert.ok(
            !target.startsWith('..'),
            `${file} escapes its project: ${dependency}`,
          );
        } else {
          assert.ok(
            !dependency.startsWith('@/'),
            'application aliases are forbidden',
          );
          assert.ok(
            !dependency.startsWith('@learn-anything/') ||
              dependency === '@learn-anything/lesson-schema',
            'only the data schema is shared',
          );
          if (name === 'lesson-player')
            assert.ok(
              !dependency.startsWith('node:'),
              'player cannot include Node providers',
            );
          if (name !== 'lesson-player')
            assert.ok(
              !/^(react|react-dom|tegaki|@base-ui\/|lucide-react)/.test(
                dependency,
              ),
              'content project cannot depend on rendering',
            );
        }
      }
    }
    const manifest = JSON.parse(
      readFileSync(resolve(directory, 'package.json'), 'utf8'),
    );
    assert.ok(
      manifest.scripts.build &&
        manifest.scripts.typecheck &&
        manifest.exports['.'],
    );
  }
});

void test('the independent player owns identical Chinese font and stroke assets', () => {
  for (const file of ['glyphData.json', 'ma-shan-zheng-0a5055c7.ttf']) {
    assert.deepEqual(
      readFileSync(resolve(root, 'packages/lesson-player/fonts', file)),
      readFileSync(resolve(root, 'lib/tegaki-font', file)),
    );
  }
  const css = readFileSync(
    resolve(root, 'packages/lesson-player/styles.css'),
    'utf8',
  );
  assert.ok(css.includes('.classroom-shell .player-dock'));
  assert.ok(css.includes('will-change: transform, opacity'));
  assert.match(
    css,
    /\.grammar-node \{[^}]*border: 2px solid var\(--classroom-rule, #4f4b52\)/,
  );
  assert.ok(!css.includes('@import') && !css.includes('@apply'));
});

void test('content hand-off reproduces the actual current lesson and captions without a provider call', () => {
  const lessonJson = readFileSync(
    resolve(root, 'public/lessons/water-cycle.json'),
    'utf8',
  );
  const artifacts = createLessonArtifacts(JSON.parse(lessonJson));
  assert.equal(artifacts.lessonJson, lessonJson);
  assert.equal(
    artifacts.captionsVtt,
    readFileSync(resolve(root, 'public/lessons/water-cycle-zh.vtt'), 'utf8'),
  );
  assert.deepEqual(artifacts.resources, {
    audio: '/audio/water-cycle-zh.mp3',
    captions: '/lessons/water-cycle-zh.vtt',
  });
  const invalid = JSON.parse(lessonJson);
  invalid.narration[1].at = invalid.narration[0].at;
  assert.throws(() => createLessonArtifacts(invalid), /字幕片段/);
  const plainText = JSON.parse(lessonJson);
  plainText.narration[0].text = '数值 < 8\n\n00:00:00.000 --> 00:00:01.000';
  const escaped = createLessonArtifacts(plainText).captionsVtt;
  assert.ok(escaped.includes('数值 &lt; 8 00:00:00.000 --&gt; 00:00:01.000'));
});
