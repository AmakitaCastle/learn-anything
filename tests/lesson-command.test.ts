import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLessonDraftProvider } from '@learn-anything/lesson-draft-generator';
import { createFfmpegAudioProcessor } from '@learn-anything/content-generator';
import { spokenText, parseLesson } from '@learn-anything/lesson-schema';
import { parseLessonCommand } from '../scripts/lesson.ts';
import {
  runLessonWorkflow,
  topicBrief,
  type LessonWorkflowDependencies,
} from '../scripts/lesson-workflow.ts';
import { startLessonViewer } from '../scripts/lesson-viewer.ts';
import { formatLessonTaskError } from '../scripts/lesson-errors.ts';

const root = new URL('../', import.meta.url);
const rawDraft = JSON.parse(
  await readFile(
    new URL(
      '../packages/content-generator/examples/temperature.draft.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
rawDraft.boardMode = 'full-narration';
rawDraft.segments.forEach((segment: { visualId?: string }) => {
  segment.visualId = rawDraft.visuals[0].id;
});
const brief = topicBrief('温度变化', { id: rawDraft.id, segmentCount: 2 });
const secret = 'fixture-workflow-secret';
void test('terminal shows known speech/alignment errors without exposing arbitrary exceptions', () => {
  for (const message of [
    '词时间戳超出音频或无效。',
    '时间戳与讲稿不一致。',
    '语音请求失败（HTTP 403），请检查语音密钥与服务权限。',
    '语音合成失败（错误码 45000001），请检查语音权限、额度和音色版本。',
    '数字不在允许范围内。',
    '课程音频时长与实测片段总长不一致。',
    '本地音频处理失败，请检查 FFmpeg/FFprobe 和音频文件。',
  ])
    assert.ok(formatLessonTaskError(new Error(message)).includes(message));
  for (const message of [
    secret,
    `词时间戳无效。${secret}`,
    `数字不在允许范围内。${secret}`,
  ])
    assert.ok(!formatLessonTaskError(new Error(message)).includes(secret));
});
const fakeDependencies = (): LessonWorkflowDependencies => ({
  provider: createLessonDraftProvider(
    { protocol: 'openai-compatible', model: 'fixture', apiKey: secret },
    {
      fetch: async () =>
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(rawDraft) },
            },
          ],
        }),
    },
  ),
  handwriting: false,
  speech: {
    async synthesize(segment) {
      return {
        audio: Buffer.from('fixture'),
        logId: null,
        metadata: [
          {
            sentence: {
              words: Array.from(spokenText(segment.text), (word, index) => ({
                word,
                startTime: index * 0.1,
                endTime: (index + 1) * 0.1,
              })),
            },
          },
        ],
      };
    },
  },
  audio: {
    async decodeMp3() {
      return Buffer.alloc(5 * 48000);
    },
    async encodeMp3(pcm) {
      return {
        audio: Buffer.from('mp3-fixture'),
        duration: pcm.length / 48000,
      };
    },
  },
});

void test('one terminal entry supports topic, brief, manual, replay and offline defaults', () => {
  assert.ok(parseLessonCommand(['水循环']).checkOnly);
  assert.ok(!parseLessonCommand(['水循环', '--generate']).checkOnly);
  assert.equal(
    parseLessonCommand(['--topic', '水循环', '--generate']).topic,
    '水循环',
  );
  assert.ok(
    parseLessonCommand(['--draft', 'draft.json', '--cached']).values.cached,
  );
  assert.equal(parseLessonCommand(['--play', 'output']).values.play, 'output');
  assert.ok(!parseLessonCommand(['--demo']).checkOnly);
  for (const args of [
    [],
    ['a', 'b'],
    ['a', '--topic', 'b'],
    ['a', '--brief', 'b'],
    ['a', '--cached'],
    ['a', '--cached', '--generate'],
    ['--play', 'x', '--generate'],
    ['--demo', '--generate'],
    ['--demo', '--cached'],
    ['--demo', '--play', 'x'],
    ['--demo', '水循环'],
    ['a', '--port', '-1'],
    ['a', '--repair-attempts', '3'],
    ['--draft', 'x', '--generate', '--repair-attempts', '1'],
    ['--brief', 'x', '--audience', 'y'],
  ])
    assert.throws(() => parseLessonCommand(args));
});

void test('token budget is omitted by default and accepts an explicit positive integer', () => {
  assert.equal(parseLessonCommand(['Redis']).maxOutputTokens, undefined);
  assert.equal(
    parseLessonCommand(['Redis', '--max-output-tokens', '131072'])
      .maxOutputTokens,
    131072,
  );
  for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', ''])
    assert.throws(() =>
      parseLessonCommand(['Redis', '--max-output-tokens', value]),
    );
});

void test('topic defaults are deterministic and constrained by the shared brief', () => {
  const generated = topicBrief('水循环');
  assert.equal(generated.id, topicBrief('水循环').id);
  assert.equal(generated.segmentCount, 6);
  assert.equal(generated.targetDurationSeconds, 90);
  assert.throws(() => topicBrief('水循环', { segmentCount: 21 }));
  assert.throws(() => topicBrief('水循环', { id: '../bad' }));
});

void test('LLM → compiler persists all artifacts without changing business module boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learn-anything-command-'));
  try {
    const stages: string[] = [];
    const result = await runLessonWorkflow(
      { brief },
      { outputRoot: directory },
      { ...fakeDependencies(), onStage: (stage) => stages.push(stage) },
    );
    assert.deepEqual(stages, ['prepare', 'draft', 'compile', 'saved']);
    assert.deepEqual((await readdir(result.directory)).sort(), [
      'alignment.json',
      'captions.vtt',
      'generation.json',
      'lesson.draft.json',
      'lesson.json',
      'narration.mp3',
    ]);
    const lesson = parseLesson(
      JSON.parse(await readFile(join(result.directory, 'lesson.json'), 'utf8')),
    );
    assert.equal(lesson.audio, '/lesson-assets/narration.mp3');
    assert.equal(lesson.captions, '/lesson-assets/captions.vtt');
    assert.equal(lesson.id, rawDraft.id);
    assert.equal(result.duration, lesson.duration);
    assert.ok(
      !(
        await readFile(join(result.directory, 'generation.json'), 'utf8')
      ).includes(secret),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('missing tools and existing outputs fail before requesting a model or speech', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-command-preflight-'),
  );
  try {
    let calls = 0;
    const dependencies = fakeDependencies();
    dependencies.provider = {
      id: 'fixture',
      model: 'fixture',
      async generate() {
        calls++;
        return { text: '{}' };
      },
    };
    dependencies.audio.prepare = async () => {
      throw new Error('missing-tool');
    };
    await assert.rejects(
      runLessonWorkflow({ brief }, { outputRoot: directory }, dependencies),
    );
    assert.equal(calls, 0);
    assert.deepEqual(await readdir(directory), []);
    dependencies.audio.prepare = async () => {};
    await assert.rejects(
      runLessonWorkflow(
        { brief },
        { outputRoot: directory, output: directory },
        dependencies,
      ),
    );
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('compiler failure retains validated material and never marks the run playable', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-command-failure-'),
  );
  try {
    const output = join(directory, 'run');
    const dependencies = fakeDependencies();
    dependencies.speech.synthesize = async () => {
      throw new Error('speech-failure');
    };
    await assert.rejects(
      runLessonWorkflow(
        { brief },
        { outputRoot: directory, output },
        dependencies,
      ),
    );
    assert.deepEqual((await readdir(output)).sort(), [
      'generation.json',
      'lesson.draft.json',
    ]);
    await assert.rejects(startLessonViewer(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('manual material never invokes an LLM and cancelled runs do not start requests', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-command-manual-'),
  );
  try {
    const dependencies = fakeDependencies();
    dependencies.provider!.generate = async () => {
      throw new Error('LLM must not be called');
    };
    const result = await runLessonWorkflow(
      { draft: rawDraft },
      { outputRoot: directory },
      dependencies,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(result.directory, 'generation.json'), 'utf8'),
      ).source,
      'manual',
    );
    await assert.rejects(
      runLessonWorkflow(
        { brief },
        { outputRoot: directory },
        { ...dependencies, signal: AbortSignal.abort(secret) },
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('standalone viewer serves only course/bundle files and supports audio ranges', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-command-viewer-'),
  );
  let viewer: Awaited<ReturnType<typeof startLessonViewer>> | undefined;
  try {
    const result = await runLessonWorkflow(
      { brief },
      { outputRoot: directory },
      fakeDependencies(),
    );
    viewer = await startLessonViewer(result.directory);
    const html = await (await fetch(viewer.url)).text();
    assert.match(html, /assets\//);
    const response = await fetch(new URL('lesson.json', viewer.url));
    const lesson = parseLesson(await response.json());
    assert.equal(lesson.audio, new URL('narration.mp3', viewer.url).pathname);
    const ranged = await fetch(new URL('narration.mp3', viewer.url), {
      headers: { Range: 'bytes=0-2' },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('content-range'), 'bytes 0-2/11');
    assert.equal(await ranged.text(), 'mp3');
    const suffix = await fetch(new URL('narration.mp3', viewer.url), {
      headers: { Range: 'bytes=-3' },
    });
    assert.equal(await suffix.text(), 'ure');
    assert.equal(
      (
        await fetch(new URL('narration.mp3', viewer.url), {
          headers: { Range: 'bytes=999-' },
        })
      ).status,
      416,
    );
    assert.equal(
      (
        await fetch(new URL('narration.mp3', viewer.url), { method: 'HEAD' })
      ).headers.get('content-length'),
      '11',
    );
    for (const path of [
      '.env.local',
      'lesson.draft.json',
      'generation.json',
      '../lesson.json',
      '/@fs/.env.local',
      '/lesson-assets/narration.mp3',
      '/package.json',
    ])
      assert.equal((await fetch(new URL(path, viewer.url))).status, 404);
    const hostileHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const request = httpRequest(
          viewer!.url,
          { headers: { Host: 'attacker.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
        request.end();
      },
    );
    assert.equal(hostileHost, 403);
    assert.equal((await fetch(viewer.url, { method: 'POST' })).status, 405);
    const script = /src="([^"]+\.js)"/.exec(html)!;
    assert.ok(script);
    const js = await (await fetch(new URL(script[1], viewer.url))).text();
    assert.ok(
      !js.includes(secret) &&
        !js.includes('LESSON_LLM_API_KEY') &&
        !js.includes('DOUBAO_SPEECH_API_KEY'),
    );
  } finally {
    await viewer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

void test(
  'real MP3 pipeline artifacts can be replayed by one CLI process and SIGTERM closes it',
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'learn-anything-command-replay-'),
    );
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const audio = createFfmpegAudioProcessor();
      const fixture = await audio.encodeMp3(Buffer.alloc(5 * 48000));
      const dependencies = fakeDependencies();
      dependencies.audio = audio;
      const original = dependencies.speech.synthesize.bind(dependencies.speech);
      dependencies.speech.synthesize = async (segment) => ({
        ...(await original(segment)),
        audio: fixture.audio,
      });
      const result = await runLessonWorkflow(
        { brief },
        { outputRoot: directory },
        dependencies,
      );
      child = spawn(
        process.execPath,
        [
          '--conditions=learn-anything-source',
          '--experimental-strip-types',
          'scripts/lesson.ts',
          '--play',
          result.directory,
          '--no-open',
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            LESSON_LLM_API_KEY: '',
            DOUBAO_SPEECH_API_KEY: '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const task = child;
      const url = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        const timer = setTimeout(
          () => reject(new Error('viewer did not start')),
          20000,
        );
        task.stdout!.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
          const match = /播放器：(http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+\/)/.exec(
            stdout,
          );
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        task.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('viewer exited before readiness'));
        });
      });
      const lesson = parseLesson(
        await (await fetch(new URL('lesson.json', url))).json(),
      );
      assert.equal(lesson.id, rawDraft.id);
      assert.equal(
        (await fetch(new URL(lesson.audio, url))).headers.get('content-type'),
        'audio/mpeg',
      );
      const exited = once(task, 'exit');
      task.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0);
      await assert.rejects(fetch(url));
      assert.ok(
        (await readFile(join(result.directory, 'narration.mp3'))).length,
      );
      child = undefined;
    } finally {
      child?.kill('SIGKILL');
      await rm(directory, { recursive: true, force: true });
    }
  },
);

void test('unified CLI prints safe HTTP diagnostics instead of hiding the actual failure', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-cli-diagnostic-'),
  );
  try {
    const bootstrap = `import {resolve} from 'node:path';
globalThis.fetch = async () => new Response('${secret}', {status: 401});
process.argv = [process.execPath, resolve('scripts/lesson.ts'), 'Redis', '--segments', '6', '--generate', '--output', ${JSON.stringify(join(directory, 'run'))}];
await import('./scripts/lesson.ts');`;
    const result = spawnSync(
      process.execPath,
      [
        '--conditions=learn-anything-source',
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        bootstrap,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: '',
          LESSON_LLM_PROVIDER: 'openai-compatible',
          LESSON_LLM_MODEL: 'fixture',
          LESSON_LLM_API_KEY: secret,
          LESSON_LLM_BASE_URL: 'https://fixture.example/v1',
          DOUBAO_SPEECH_API_KEY: secret,
          DOUBAO_TTS_RESOURCE_ID: 'fixture',
          DOUBAO_TTS_SPEAKER: 'fixture',
          DOUBAO_TTS_SPEECH_RATE: '0',
        },
        timeout: 20000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HTTP 401/);
    assert.match(result.stderr, /检查 API Key 是否有效/);
    assert.ok(
      !result.stderr.includes(secret) && !result.stdout.includes(secret),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('CLI help and topic preflight work with no service configuration and no files written', () => {
  const args = [
    '--conditions=learn-anything-source',
    '--experimental-strip-types',
    'scripts/lesson.ts',
  ];
  const options = {
    cwd: root,
    encoding: 'utf8' as const,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      LESSON_LLM_API_KEY: '',
      DOUBAO_SPEECH_API_KEY: '',
    },
  };
  assert.match(
    execFileSync(process.execPath, [...args, '--help'], options),
    /一条命令/,
  );
  assert.match(
    execFileSync(process.execPath, [...args, '水循环'], options),
    /仅离线预检/,
  );
});
