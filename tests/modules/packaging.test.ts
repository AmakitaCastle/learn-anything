import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
void test(
  'packed production projects work in a separate React host with no app aliases or framework',
  { timeout: 120_000 },
  () => {
    const fixture = mkdtempSync(
      join(tmpdir(), 'learn-anything-module-consumer-'),
    );
    const run = (command: string, args: string[], cwd = fixture) =>
      execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
        // Production exports only; never select workspace source code.
        env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    try {
      const dependencies: Record<string, string> = {
        react: '19.2.6',
        'react-dom': '19.2.6',
        vite: '8.0.13',
        typescript: '5.9.3',
        '@types/react': '19.2.14',
        '@types/react-dom': '19.2.3',
        '@types/node': '22.19.19',
      };
      for (const project of [
        'lesson-schema',
        'lesson-player',
        'content-generator',
        'lesson-draft-generator',
      ]) {
        const packed = JSON.parse(
          run(
            'npm',
            [
              'pack',
              '--json',
              '--ignore-scripts',
              '--pack-destination',
              fixture,
              '-w',
              `@learn-anything/${project}`,
            ],
            root,
          ),
        )[0];
        assert.ok(
          packed.files.every(
            (file: { path: string }) =>
              !/^(app|lib|public|examples)\//.test(file.path),
          ),
        );
        dependencies[`@learn-anything/${project}`] =
          `file:./${packed.filename}`;
      }
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }),
      );
      // Pin from the existing lockfile so verification never needs new versions.
      const lock = JSON.parse(
        readFileSync(join(root, 'package-lock.json'), 'utf8'),
      );
      const overrides = Object.fromEntries(
        Object.entries(lock.packages)
          .filter(
            ([name, value]) =>
              name.startsWith('node_modules/') &&
              name.split('node_modules/').length === 2 &&
              (value as { version?: string }).version,
          )
          .map(([name, value]) => [
            name.slice('node_modules/'.length),
            (value as { version: string }).version,
          ]),
      );
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({
          private: true,
          type: 'module',
          dependencies,
          overrides,
        }),
      );
      run('npm', [
        'install',
        // npm ci caches tarballs without necessarily caching registry metadata.
        // Keep exact lockfile overrides, but permit metadata on a cold runner.
        '--prefer-offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--include=dev',
      ]);
      const lesson = readFileSync(
        join(root, 'public/lessons/water-cycle.json'),
        'utf8',
      );
      writeFileSync(join(fixture, 'lesson.json'), lesson);
      writeFileSync(
        join(fixture, 'draft.json'),
        readFileSync(
          join(
            root,
            'packages/content-generator/examples/water-cycle.draft.json',
          ),
          'utf8',
        ),
      );
      writeFileSync(
        join(fixture, 'index.html'),
        '<div id="root"></div><script type="module" src="/main.tsx"></script>',
      );
      writeFileSync(
        join(fixture, 'main.tsx'),
        `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ClassroomPlayer, type LessonSpec } from '@learn-anything/lesson-player';
import '@learn-anything/lesson-player/styles.css';
import lesson from './lesson.json';
createRoot(document.getElementById('root')!).render(createElement(ClassroomPlayer, { lesson: lesson as LessonSpec }));
`,
      );
      writeFileSync(
        join(fixture, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2023',
            lib: ['ES2023', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            moduleResolution: 'Bundler',
            jsx: 'react-jsx',
            strict: true,
            resolveJsonModule: true,
            noEmit: true,
            skipLibCheck: false,
            types: ['react', 'react-dom'],
          },
          include: ['main.tsx'],
        }),
      );
      run(process.execPath, [
        join(fixture, 'node_modules/typescript/bin/tsc'),
        '-p',
        'tsconfig.json',
      ]);
      writeFileSync(
        join(fixture, 'compiler-types.mts'),
        `import { compileLessonDraft, parseLessonDraft, createDoubaoSpeechProvider, createFfmpegAudioProcessor, type LessonDraft, type CompiledLesson } from '@learn-anything/content-generator';
import { type LessonAnchor } from '@learn-anything/lesson-schema';
import { generateLessonDraft, createLessonDraftProvider, type LessonDraftProvider, type LessonBrief } from '@learn-anything/lesson-draft-generator';
import data from '@learn-anything/content-generator/examples/water-cycle.draft.json' with { type: 'json' };
const anchor: LessonAnchor = { segment: 'question' };
const config: LessonDraft['visuals'][number]['config'] = { nodes: [{ id: 'node', label: 'Node', at: { $time: anchor } }], edges: [] };
const draft: LessonDraft = parseLessonDraft(data);
const result: Promise<CompiledLesson> = compileLessonDraft(draft, {
  speech: createDoubaoSpeechProvider({ config: {apiKey: 'typecheck-only', resourceId: 'test', speaker: 'test', speechRate: 0}, cacheRoot: '/tmp/typecheck-only' }),
  audio: createFfmpegAudioProcessor(),
});
void result; void config;
const brief: LessonBrief = {id: 'test', topic: 'water', audience: 'students'};
const provider: LessonDraftProvider = createLessonDraftProvider({protocol: 'anthropic', model: 'typecheck-only', apiKey: 'typecheck-only'});
const generated: Promise<LessonDraft> = generateLessonDraft(brief, {provider}).then(result => result.draft);
void generated;
`,
      );
      writeFileSync(
        join(fixture, 'tsconfig-compiler.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2023',
            lib: ['ES2023'],
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            resolveJsonModule: true,
            noEmit: true,
            skipLibCheck: false,
            types: ['node'],
          },
          include: ['compiler-types.mts'],
        }),
      );
      run(process.execPath, [
        join(fixture, 'node_modules/typescript/bin/tsc'),
        '-p',
        'tsconfig-compiler.json',
      ]);
      run(process.execPath, [
        join(fixture, 'node_modules/vite/bin/vite.js'),
        'build',
      ]);
      writeFileSync(
        join(fixture, 'verify.mjs'),
        `import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClassroomPlayer, prepareLesson, classroomAt } from '@learn-anything/lesson-player';
import { defaultVisualRegistry } from '@learn-anything/lesson-player/grammars';
import { createLessonArtifacts, compileLessonDraft, parseLessonDraft } from '@learn-anything/content-generator';
import { spokenText } from '@learn-anything/lesson-schema';
import { generateLessonDraft, createLessonDraftProvider } from '@learn-anything/lesson-draft-generator';
import draftData from '@learn-anything/content-generator/examples/water-cycle.draft.json' with { type: 'json' };
const artifacts = createLessonArtifacts(JSON.parse(fs.readFileSync('./lesson.json', 'utf8')));
assert.ok(artifacts.captionsVtt.startsWith('WEBVTT'));
assert.equal(classroomAt(prepareLesson(artifacts.lesson, defaultVisualRegistry), 60).board.length, 8);
assert.ok(renderToStaticMarkup(createElement(ClassroomPlayer, {lesson: artifacts.lesson})).includes('data-lesson-id="water-cycle"'));
const fullDraft = {...draftData, boardMode: 'full-narration', segments: draftData.segments.map(segment => ({...segment, visualId: draftData.visuals[0].id}))};
const generated = await generateLessonDraft({id: draftData.id, topic: 'water cycle', audience: 'students', segmentCount: draftData.segments.length, allowedGrammars: ['flow']}, {
  provider: createLessonDraftProvider({protocol: 'openai-compatible', model: 'fixture', apiKey: 'fixture-only'}, {fetch: async () => Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(fullDraft)}}]})}),
});
assert.equal(generated.report.humanReview, 'pending');
const draft = parseLessonDraft(generated.draft);
const compiled = await compileLessonDraft(draft, {
  speech: { async synthesize(segment) {
    return { audio: Buffer.from('mp3-fixture'), logId: null, metadata: [{ sentence: { words: Array.from(spokenText(segment.text), (word, index) => ({word, startTime: index * 0.1, endTime: (index + 1) * 0.1})) } }] };
  } },
  audio: { async decodeMp3() { return Buffer.alloc(15 * 48000); }, async encodeMp3(pcm) { return { audio: Buffer.from('joined-fixture'), duration: pcm.length / 48000 }; } },
});
assert.equal(compiled.audio.toString(), 'joined-fixture');
assert.equal(classroomAt(prepareLesson(compiled.lesson, defaultVisualRegistry), compiled.lesson.duration).board.length, 8);
console.log('independent consumer verified');
`,
      );
      assert.ok(
        run(process.execPath, ['verify.mjs']).includes(
          'independent consumer verified',
        ),
      );
      writeFileSync(
        join(fixture, 'verify-dev.mjs'),
        `import assert from 'node:assert/strict';
process.env.NODE_ENV = 'development';
const { createServer } = await import('vite');
const server = await createServer({ configFile: false, optimizeDeps: { exclude: ['@learn-anything/lesson-player'] }, server: { middlewareMode: true, hmr: false } });
try {
  const resolved = await server.environments.client.pluginContainer.resolveId('@learn-anything/lesson-player');
  assert.ok(resolved.id.split('?')[0].endsWith('/dist/index.js'), resolved.id);
  const library = await server.ssrLoadModule('@learn-anything/lesson-player');
  assert.ok(library.ClassroomPlayer);
  const css = await server.transformRequest('/node_modules/@learn-anything/lesson-player/styles.css');
  assert.ok(css.code.includes('classroom-shell'));
  console.log('independent dev consumer verified');
} finally { await server.close(); }
`,
      );
      assert.ok(
        run(process.execPath, ['verify-dev.mjs']).includes(
          'independent dev consumer verified',
        ),
      );
    } finally {
      // Only this test-owned, freshly allocated directory is removed.
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);
