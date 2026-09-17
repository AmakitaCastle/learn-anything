import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import {
  lessonWebSetupStatus,
  parseLessonWebCommand,
  parseLessonWebRequest,
  startLessonWebApp,
  type LessonWebDependencies,
  type LessonWebFile,
} from '../scripts/lesson-web.ts';

void test('web request keeps paid generation explicit and validates bounded lesson inputs', () => {
  assert.deepEqual(parseLessonWebRequest({ mode: 'demo' }), { mode: 'demo' });
  const request = parseLessonWebRequest({
    mode: 'generate',
    topic: '  水循环  ',
    audience: ' 初学者 ',
    segmentCount: 6,
    targetDurationSeconds: 90,
    confirmExternalRequest: true,
  });
  assert.equal(request.mode, 'generate');
  if (request.mode === 'generate') {
    assert.equal(request.topic, '水循环');
    assert.equal(request.audience, '初学者');
  }
  for (const input of [
    null,
    {},
    { mode: 'generate', topic: '水循环' },
    {
      mode: 'generate',
      topic: '水循环',
      audience: '初学者',
      segmentCount: 6,
      targetDurationSeconds: 90,
      confirmExternalRequest: false,
    },
    {
      mode: 'generate',
      topic: '水循环',
      audience: '初学者',
      segmentCount: 21,
      targetDurationSeconds: 90,
      confirmExternalRequest: true,
    },
  ])
    assert.throws(() => parseLessonWebRequest(input));
});

void test('web setup status exposes booleans but never credential values', async () => {
  const status = await lessonWebSetupStatus({
    LESSON_LLM_PROVIDER: 'openai-compatible',
    LESSON_LLM_MODEL: 'fixture-model',
    LESSON_LLM_API_KEY: 'fixture-secret',
    DOUBAO_SPEECH_API_KEY: 'fixture-speech-secret',
    DOUBAO_TTS_RESOURCE_ID: 'fixture-resource',
    DOUBAO_TTS_SPEAKER: 'fixture-speaker',
  });
  assert.equal(status.model, true);
  assert.equal(status.speech, true);
  assert.equal(typeof status.ffmpeg, 'boolean');
  assert.ok(!JSON.stringify(status).includes('fixture-secret'));
  const compatible = await lessonWebSetupStatus({
    LESSON_LLM_PROVIDER: 'openai-compatible',
    LESSON_LLM_MODEL: 'fixture-model',
    LESSON_LLM_API_KEY: 'fixture-secret',
    DOUBAO_TTS_ENDPOINT: 'http://192.168.1.20:8000/v3/tts/sse',
    DOUBAO_TTS_SPEAKER: 'fixture-speaker',
  });
  assert.equal(compatible.speech, true);
  const invalidEndpoint = await lessonWebSetupStatus({
    DOUBAO_TTS_ENDPOINT: 'file:///tmp/tts.sock',
    DOUBAO_TTS_SPEAKER: 'fixture-speaker',
  });
  assert.equal(invalidEndpoint.speech, false);
  const missing = await lessonWebSetupStatus({});
  assert.equal(missing.model, false);
  assert.equal(missing.speech, false);
  assert.equal(missing.ready, false);
});

void test('web command accepts a local port and no-open mode', () => {
  assert.deepEqual(parseLessonWebCommand([]), {
    port: 0,
    noOpen: false,
    help: false,
  });
  assert.equal(parseLessonWebCommand(['--port', '4318']).port, 4318);
  assert.equal(parseLessonWebCommand(['--no-open']).noOpen, true);
  for (const port of ['-1', '65536', '1.5'])
    assert.throws(() => parseLessonWebCommand(['--port', port]));
});

void test('local web host serves a closed app, streams progress and rejects unsafe requests', async () => {
  const files = new Map<string, LessonWebFile>([
    [
      'index.html',
      {
        bytes: Buffer.from('<!doctype html><title>fixture web</title>'),
        type: 'text/html; charset=utf-8',
      },
    ],
  ]);
  let closed = 0;
  const dependencies: LessonWebDependencies = {
    async status() {
      return { model: true, speech: true, ffmpeg: true, ready: true };
    },
    async run(input, context) {
      context.onProgress({
        phase: input.mode === 'demo' ? 'player' : 'draft',
        progress: 60,
        message: 'fixture-progress',
      });
      return {
        viewerUrl: 'http://127.0.0.1:9999/fixture/',
        output: 'outputs/runs/fixture',
        duration: 42,
        async close() {
          closed++;
        },
      };
    },
  };
  const app = await startLessonWebApp({
    files,
    dependencies,
    token: 'fixture-token',
  });
  try {
    assert.match(await (await fetch(app.url)).text(), /fixture web/);
    const status = await (await fetch(new URL('api/status', app.url))).json();
    assert.deepEqual(status, {
      model: true,
      speech: true,
      ffmpeg: true,
      ready: true,
    });
    assert.equal(
      (
        await fetch(new URL('api/jobs', app.url), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '{}',
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await fetch(new URL('api/jobs', app.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://attacker.example',
          },
          body: JSON.stringify({ mode: 'demo' }),
        })
      ).status,
      403,
    );
    const created = await fetch(new URL('api/jobs', app.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'demo' }),
    });
    assert.equal(created.status, 202);
    const { id } = (await created.json()) as { id: string };
    const events = await (
      await fetch(new URL(`api/jobs/${id}/events`, app.url))
    ).text();
    assert.match(events, /"phase":"complete"/);
    assert.match(events, /"viewerUrl":"http:\/\/127\.0\.0\.1:9999/);
    assert.ok(!events.includes('fixture-secret'));
    assert.equal(
      (await fetch(new URL('../package.json', app.url))).status,
      404,
    );
    const hostileHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const request = httpRequest(
          app.url,
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
  } finally {
    await app.close();
  }
  assert.equal(closed, 1);
});

void test('a running web job can be cancelled without deleting its output', async () => {
  const files = new Map<string, LessonWebFile>([
    [
      'index.html',
      { bytes: Buffer.from('fixture'), type: 'text/html; charset=utf-8' },
    ],
  ]);
  const dependencies: LessonWebDependencies = {
    async status() {
      return { model: true, speech: true, ffmpeg: true, ready: true };
    },
    async run(_input, context) {
      await new Promise<void>((_resolve, reject) =>
        context.signal.addEventListener('abort', () => reject(new Error()), {
          once: true,
        }),
      );
      throw new Error();
    },
  };
  const app = await startLessonWebApp({
    files,
    dependencies,
    token: 'cancel-token',
  });
  try {
    const created = await fetch(new URL('api/jobs', app.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'demo' }),
    });
    const { id } = (await created.json()) as { id: string };
    assert.equal(
      (
        await fetch(new URL(`api/jobs/${id}`, app.url), {
          method: 'DELETE',
        })
      ).status,
      202,
    );
    const events = await (
      await fetch(new URL(`api/jobs/${id}/events`, app.url))
    ).text();
    assert.match(events, /"phase":"cancelled"/);
  } finally {
    await app.close();
  }
});
