import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cachedSpeech, saveSpeech } from '../lib/tts/cache.ts';
import {
  DOUBAO_TTS_ENDPOINT,
  readDoubaoConfig,
  safeLogId,
  speechCacheKey,
  speechRequest,
  synthesizeDoubao,
  readSpeechStream,
} from '../lib/tts/doubao.ts';
import { lessonNarration } from '../lib/tts/narration.ts';

const config = {
  apiKey: 'test-private-key',
  resourceId: 'seed-tts-2.0',
  speaker: 'test-speaker',
  speechRate: 0,
};
const packet = (data: Record<string, unknown>) =>
  `data: ${JSON.stringify(data)}\r\n\r\n`;
const successful =
  packet({ code: 0, data: Buffer.from('fake-audio').toString('base64') }) +
  packet({ code: 20000000 });
function stream(text: string, step = 1): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let at = 0; at < encoded.length; at += step) {
        controller.enqueue(encoded.slice(at, at + step));
      }
      controller.close();
    },
  });
}
function response(text = successful) {
  return new Response(stream(text, 3), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'x-tt-logid': 'log-123',
    },
  });
}

void test('configuration validates required credentials and speech rate without echoing secrets', () => {
  const env = {
    DOUBAO_SPEECH_API_KEY: config.apiKey,
    DOUBAO_TTS_RESOURCE_ID: config.resourceId,
    DOUBAO_TTS_SPEAKER: config.speaker,
  };
  assert.deepEqual(readDoubaoConfig(env), config);
  for (const name of Object.keys(env)) {
    assert.throws(
      () => readDoubaoConfig({ ...env, [name]: '' }),
      new RegExp(name),
    );
  }
  for (const rate of ['101', '-51', 'NaN', '0.5']) {
    assert.throws(
      () => readDoubaoConfig({ ...env, DOUBAO_TTS_SPEECH_RATE: rate }),
      /整数/,
    );
  }
  assert.throws(
    () =>
      readDoubaoConfig({ ...env, DOUBAO_SPEECH_API_KEY: 'secret\ninjected' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('injected'));
      return true;
    },
  );
  assert.deepEqual(
    readDoubaoConfig({
      DOUBAO_TTS_ENDPOINT: 'http://192.168.1.20:8000/v3/tts/sse',
      DOUBAO_TTS_SPEAKER: 'qwen-voice',
    }),
    {
      apiKey: '',
      resourceId: '',
      speaker: 'qwen-voice',
      speechRate: 0,
      endpoint: 'http://192.168.1.20:8000/v3/tts/sse',
    },
  );
  for (const endpoint of [
    'not-a-url',
    'file:///tmp/tts.sock',
    'http://user:password@tts.example/v3',
    'https://tts.example/v3#secret',
  ]) {
    assert.throws(
      () =>
        readDoubaoConfig({
          DOUBAO_TTS_ENDPOINT: endpoint,
          DOUBAO_TTS_SPEAKER: 'qwen-voice',
        }),
      /DOUBAO_TTS_ENDPOINT/,
    );
  }
});

void test('request contains MP3 parameters and no credentials; cache excludes key but includes sound settings', () => {
  const request = speechRequest('  你好  ', config);
  assert.equal(request.req_params.text, '你好');
  assert.equal(request.req_params.audio_params.format, 'mp3');
  assert.ok(!JSON.stringify(request).includes(config.apiKey));
  const key = speechCacheKey('你好', config);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(
    key,
    speechCacheKey('你好', { ...config, apiKey: 'rotated-key' }),
  );
  for (const changed of [
    { ...config, speaker: 'other' },
    { ...config, speechRate: 10 },
    { ...config, resourceId: 'seed-tts-1.0' },
    { ...config, subtitles: true },
  ]) {
    assert.notEqual(key, speechCacheKey('你好', changed));
  }
  assert.notEqual(key, speechCacheKey('再见', config));
  assert.notEqual(
    key,
    speechCacheKey('你好', {
      ...config,
      endpoint: 'http://192.168.1.20:8000/v3/tts/sse',
    }),
  );
  assert.equal(
    speechRequest('你好', { ...config, subtitles: true }).req_params
      .audio_params.enable_subtitle,
    true,
  );
  assert.throws(() => speechRequest('', config), /字符/);
  assert.throws(() => speechRequest('中'.repeat(2001), config), /字符/);
});

void test('SSE handles CRLF, arbitrary UTF-8 packet boundaries, comments, metadata and ordered audio', async () => {
  const payload =
    ': heartbeat\r\n\r\n' +
    packet({ code: 0, data: 'YWJj', sentence: { text: '二十三' } }) +
    packet({ code: 0, data: 'ZGVm' }) +
    'event: finished\n' +
    packet({ code: 20000000, usage: { characters: 3 } });
  const result = await readSpeechStream(stream(payload));
  assert.equal(result.audio.toString(), 'abcdef');
  assert.deepEqual(result.metadata, [
    { sentence: { text: '二十三' } },
    { usage: { characters: 3 } },
  ]);
  const eof = await readSpeechStream(stream('data: {"code":0,"data":"YWJj"}'));
  assert.equal(eof.audio.toString(), 'abc');
});

void test('SSE rejects business errors, empty audio, malformed tails and invalid base64', async () => {
  for (const payload of [
    packet({ code: 45000001, message: config.apiKey }),
    packet({ code: 20000000 }),
    'data: {broken}\n\n',
    packet({ code: 0, data: '%%%bad' }),
    packet({ code: 0, data: 'YWJj' }) + 'data: {truncated',
    packet({ data: 'YWJj' }),
    packet({ code: 0, data: 'YR==' }),
    successful + packet({ code: 0, data: 'YWJj' }),
  ]) {
    await assert.rejects(
      readSpeechStream(stream(payload)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(config.apiKey));
        return true;
      },
    );
  }
});

void test('SSE ignores null audio in metadata and terminal packets without losing generated audio', async () => {
  const result = await readSpeechStream(
    stream(
      packet({ code: 0, data: null, sentence: { text: '试听' } }) +
        packet({ code: 0, data: 'YWJj' }) +
        packet({ code: 20000000, data: null }),
    ),
  );
  assert.equal(result.audio.toString(), 'abc');
  assert.deepEqual(result.metadata, [{ sentence: { text: '试听' } }]);
  await assert.rejects(
    readSpeechStream(stream(packet({ code: 20000000, data: null }))),
    /没有返回音频/,
  );
});

void test('adapter calls the default official endpoint once with secret only in headers and unique request IDs', async () => {
  const ids = new Set<string>();
  let calls = 0;
  const fakeFetch: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(input, DOUBAO_TTS_ENDPOINT);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-api-key'), config.apiKey);
    assert.equal(headers.get('x-api-resource-id'), config.resourceId);
    ids.add(headers.get('x-api-request-id')!);
    assert.ok(typeof init?.body === 'string');
    assert.ok(!init.body.includes(config.apiKey));
    return response();
  };
  const result = await synthesizeDoubao('你好', config, fakeFetch);
  assert.equal(result.audio.toString(), 'fake-audio');
  assert.equal(result.logId, 'log-123');
  await synthesizeDoubao('你好', config, fakeFetch);
  assert.equal(calls, 2);
  assert.equal(ids.size, 2);
});

void test('adapter calls a custom Doubao-compatible endpoint without requiring authentication headers', async () => {
  const endpoint = 'http://192.168.1.20:8000/v3/tts/sse';
  const customConfig = {
    ...config,
    apiKey: '',
    resourceId: '',
    endpoint,
  };
  let calls = 0;
  const result = await synthesizeDoubao(
    '你好',
    customConfig,
    async (input, init) => {
      calls++;
      assert.equal(input, endpoint);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('x-api-key'), null);
      assert.equal(headers.get('x-api-resource-id'), null);
      assert.match(headers.get('x-api-request-id') ?? '', /^[0-9a-f-]{36}$/);
      return response();
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.audio.toString(), 'fake-audio');
});

void test('missing config never calls fetch, HTTP/network/stream errors are sanitized and never retried', async () => {
  let calls = 0;
  const invalidFetch: typeof fetch = async () => {
    calls++;
    throw new Error(config.apiKey);
  };
  await assert.rejects(
    synthesizeDoubao('你好', { ...config, apiKey: '' }, invalidFetch),
    /DOUBAO_SPEECH_API_KEY/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    synthesizeDoubao('你好', config, invalidFetch),
    /不会自动重试/,
  );
  assert.equal(calls, 1);
  for (const fakeResponse of [
    new Response(config.apiKey, { status: 403 }),
    new Response(config.apiKey, {
      headers: { 'content-type': 'application/json' },
    }),
    response(packet({ code: 45000001, message: config.apiKey })),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('语音' + config.apiKey));
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  ]) {
    await assert.rejects(
      synthesizeDoubao('你好', config, async () => fakeResponse),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes(config.apiKey));
        return true;
      },
    );
  }
  assert.equal(safeLogId('secret\nprivate'), null);
});

void test('narration preview preserves text, extracts first three cues and labels old timing only as reference', () => {
  const source = {
    narration: Array.from({ length: 5 }, (_, at) => ({
      at,
      text: `旁白${at}`,
    })),
  };
  const preview = lessonNarration(source, 'preview');
  assert.equal(preview.cues.length, 3);
  assert.equal(preview.text, '旁白0\n旁白1\n旁白2');
  assert.deepEqual(preview.cues[1], { originalAt: 1, text: '旁白1' });
  assert.equal(lessonNarration(source, 'lesson').cues.length, 5);
  for (const input of [
    null,
    {},
    { narration: [] },
    { narration: [{ at: 0, text: '' }] },
  ]) {
    assert.throws(() => lessonNarration(input, 'lesson'));
  }
});

void test('cache saves atomically, verifies audio integrity, rejects damaged/partial caches and path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'learn-anything-tts-test-'));
  const key = speechCacheKey('你好', config);
  try {
    assert.equal(await cachedSpeech(root, key), null);
    const audio = Buffer.from('fake-audio');
    const path = await saveSpeech(root, key, audio, {
      alignmentStatus: 'pending',
    });
    assert.equal(await cachedSpeech(root, key), path);
    assert.deepEqual(await readFile(path), audio);
    assert.equal(
      JSON.parse(await readFile(join(root, key, 'manifest.json'), 'utf8'))
        .alignmentStatus,
      'pending',
    );
    await assert.rejects(saveSpeech(root, key, Buffer.from('other'), {}));
    assert.deepEqual(await readFile(path), audio);
    await writeFile(path, 'damaged');
    await assert.rejects(cachedSpeech(root, key), /不可用/);
    const partialKey = 'a'.repeat(64);
    await mkdir(join(root, partialKey));
    await assert.rejects(cachedSpeech(root, partialKey), /不可用/);
    await assert.rejects(cachedSpeech(root, '../escape'), /无效/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('CLI defaults to non-billable preflight even without configuration', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=learn-anything-source',
      '--experimental-strip-types',
      'scripts/generate-doubao-tts.ts',
      '--mode',
      'preview',
    ],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /不请求接口、不消耗额度/);
  assert.match(result.stdout, /3 个原始旁白片段/);
  assert.ok(!result.stdout.includes(config.apiKey));
});
