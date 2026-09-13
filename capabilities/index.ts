import {
  builtinCapabilities,
  createCapabilityRegistry,
  type VisualCapability,
} from '@learn-anything/lesson-schema';
import type { ComponentType } from 'react';
import { sceneCapability } from './scene/index.ts';

export type CapabilityPack = VisualCapability & {
  loadRenderer: () => Promise<
    ComponentType<{ config: unknown; state: unknown; time: number }>
  >;
};
function registerPack<C, S>(
  pack: VisualCapability & {
    loadRenderer: () => Promise<
      ComponentType<{ config: C; state: S; time: number }>
    >;
  },
): CapabilityPack {
  return pack as unknown as CapabilityPack;
}
// Single host registration point for generation, compilation and both viewers.
// New packs keep their model, guidance, timing and renderer in their own folder.
const builtinPacks = [...builtinCapabilities.values()].map((capability) => ({
  ...capability,
  async loadRenderer() {
    const { defaultVisualRegistry } =
      await import('@learn-anything/lesson-player/grammars');
    return defaultVisualRegistry.get(capability.id)!.Renderer;
  },
}));
export const capabilityPacks: CapabilityPack[] = [
  ...builtinPacks,
  registerPack(sceneCapability),
];
export const lessonCapabilities = createCapabilityRegistry(capabilityPacks);
