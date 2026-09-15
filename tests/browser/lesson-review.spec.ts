import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { parseLessonDraft } from '@learn-anything/lesson-schema';
import { startLessonReview } from '../../scripts/lesson-review.ts';

const fixture = parseLessonDraft(
  JSON.parse(
    await readFile(
      new URL(
        '../../packages/content-generator/examples/temperature.draft.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

test('review page edits original teaching material before approval', async ({
  page,
}) => {
  const reviewer = await startLessonReview(fixture);
  try {
    await page.goto(reviewer.url);
    await expect(
      page.getByRole('heading', { name: '审核课程材料' }),
    ).toBeVisible();
    await expect(page.getByLabel('课程标题')).toHaveValue(fixture.title);
    await page.getByLabel('课程标题').fill('审核后的温度课');
    await page
      .getByLabel('旁白／板书文字')
      .first()
      .fill(fixture.segments[0].text + '请再看一遍。');
    await page.getByRole('button', { name: '审核通过，开始编译' }).click();
    await expect(page.getByRole('status')).toContainText('审核完成');
    const revised = await reviewer.result;
    expect(revised.title).toBe('审核后的温度课');
    expect(revised.segments[0].text).toContain('请再看一遍');
  } finally {
    await reviewer.close();
  }
});
