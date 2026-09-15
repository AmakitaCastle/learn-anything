import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseLessonDraft } from '@learn-anything/lesson-schema';
import { startLessonReview } from '../scripts/lesson-review.ts';

const fixture = parseLessonDraft(
  JSON.parse(
    await readFile(
      new URL(
        '../packages/content-generator/examples/temperature.draft.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

void test('human edits readable material, invalid anchors cannot be approved, and raw JSON is not shown', async () => {
  const reviewer = await startLessonReview(fixture);
  try {
    const html = await (await fetch(reviewer.url)).text();
    assert.match(html, /审核课程材料|讲解材料/);
    assert.ok(!html.includes('"draftVersion":"0.1.0"'));
    const original = (await (
      await fetch(new URL('material', reviewer.url))
    ).json()) as typeof fixture;
    const changed = structuredClone(original);
    changed.segments[0].text = '温度从二十度开始，随后升到五十度。';
    let response = await fetch(new URL('approve', reviewer.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
    });
    assert.equal(response.status, 422);
    changed.segments[0].text =
      '温度从二十度开始，随后升到四十度。这个过程值得观察。';
    changed.title = '人工修改后的温度课';
    response = await fetch(new URL('approve', reviewer.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
    });
    assert.equal(response.status, 200);
    const revised = await reviewer.result;
    assert.equal(revised.title, changed.title);
    assert.equal(revised.segments[0].text, changed.segments[0].text);
    assert.equal((await fetch(new URL('material', reviewer.url))).status, 200);
    assert.equal(
      (await fetch(new URL('.env.local', reviewer.url))).status,
      404,
    );
  } finally {
    await reviewer.close();
  }
});

void test('cancelling review rejects approval without starting compilation', async () => {
  const reviewer = await startLessonReview(fixture);
  try {
    const response = await fetch(new URL('cancel', reviewer.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    await assert.rejects(reviewer.result, /已取消/);
  } finally {
    await reviewer.close();
  }
});
