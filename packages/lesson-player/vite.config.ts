import { defineConfig } from 'vite';

export default defineConfig({
  // No vinext, Next.js, Tailwind, hosting configuration or application aliases.
  css: { postcss: { plugins: [] } },
  build: {
    lib: {
      entry: {
        index: 'index.tsx',
        clock: 'clock.ts',
        runtime: 'runtime.ts',
        grammars: 'grammars/index.ts',
        board: 'board/index.tsx',
        fonts: 'font-presets.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: (id) =>
        /^(react(?:-dom)?(?:\/|$)|tegaki(?:\/|$)|@base-ui\/react(?:\/|$)|lucide-react$|@learn-anything\/lesson-schema$)/.test(
          id,
        ),
    },
  },
});
