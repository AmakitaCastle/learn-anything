import {
  createVisualRegistry,
  registerGrammar,
  type VisualRegistry,
} from '@learn-anything/lesson-player/runtime';
import { capabilityPacks } from './index.ts';
export async function loadLessonVisualRegistry(
  grammarIds?: Iterable<string>,
): Promise<VisualRegistry> {
  const required = grammarIds === undefined ? null : new Set(grammarIds);
  if (
    required &&
    [...required].some((id) => !capabilityPacks.some((pack) => pack.id === id))
  )
    throw new Error('课程引用未注册的绘制能力。');
  const packs = required
    ? capabilityPacks.filter((pack) => required.has(pack.id))
    : capabilityPacks;
  return createVisualRegistry(
    await Promise.all(
      packs.map(async (pack) =>
        registerGrammar({ ...pack, Renderer: await pack.loadRenderer() }),
      ),
    ),
  );
}
