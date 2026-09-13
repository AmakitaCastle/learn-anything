import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { drawnCirclePath } from '../../packages/lesson-player/board/circle.ts';

const css = readFileSync(
  new URL('../../packages/lesson-player/styles.css', import.meta.url),
  'utf8',
).match(/\.classroom-shell \.phrase-circle path \{[^}]+\}/u)![0];

test('scaled phrase circles have no ink at zero, grow progressively and finish closed', async ({
  page,
}) => {
  // Self-contained SVG fixtures: no course server or remote content.
  await page.setContent('<body></body>');
  for (const [width, height] of [
    [240, 80],
    [360, 45],
  ]) {
    const samples: number[] = [];
    for (const progress of [0, 0.25, 0.5, 0.75, 1, 0]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="classroom-shell" width="${width}" height="${height}" viewBox="0 0 100 40" preserveAspectRatio="none"><style>${css}</style><g class="phrase-circle"><path d="${drawnCirclePath(progress)}"/></g></svg>`;
      samples.push(
        await page.evaluate(
          async ({ svg, width, height }) => {
            const image = new Image();
            image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, width, height).data;
            let ink = 0;
            for (let index = 3; index < pixels.length; index += 4)
              if (pixels[index] > 0) ink++;
            return ink;
          },
          { svg, width, height },
        ),
      );
    }
    expect(samples[0]).toBe(0);
    for (let index = 1; index < 5; index++)
      expect(samples[index]).toBeGreaterThan(samples[index - 1]);
    expect(samples[5]).toBe(0);
  }
  expect(drawnCirclePath(1)).toMatch(/51 3$/u);
});
