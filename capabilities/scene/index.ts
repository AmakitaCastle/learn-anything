import { sceneModel } from './model.ts';
// Lazy browser entry: importing the catalog from the CLI never evaluates JSX.
export const sceneCapability = {
  ...sceneModel,
  loadRenderer: async () => (await import('./renderer.tsx')).default,
};
