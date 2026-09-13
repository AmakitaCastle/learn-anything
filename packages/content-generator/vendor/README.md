# Tegaki generator adapter

`tegaki-generator.mjs` is the official MIT-licensed Tegaki generation pipeline bundled from `packages/generator/src/commands/generate.ts` at commit `a9c895e0d045c0127dc5ab6677c0a2d7835cd012` (0.22.1): https://github.com/gkurt/tegaki/tree/a9c895e0d045c0127dc5ab6677c0a2d7835cd012/packages/generator . The generator is private, not the unrelated npm package named `tegaki-generator@0.0.1`.

No algorithm changes. The only runtime renderer import is the bundle-format constant, replaced with `bundle-version.mjs` (`BUNDLE_VERSION = 0` from upstream types.ts) to keep React and the player out of Node compilation. The OpenType namespace import is changed to a default import for Node ESM/CommonJS interop. OpenType parsing, skeletonization, tracing, stroke width and ordering remain upstream code. External dependencies are pinned in the package manifest. License: `LICENSE.tegaki`.

Reproduce from the pinned upstream checkout using esbuild:

```bash
npx esbuild /path/to/tegaki/packages/generator/src/commands/generate.ts --bundle --platform=node --format=esm --packages=external --alias:tegaki=/absolute/path/to/this/vendor/bundle-version.mjs --outfile=/absolute/path/to/this/vendor/tegaki-generator.mjs
```

The full Ma Shan Zheng source font in `../fonts` is from Google Fonts (https://github.com/google/fonts/tree/main/ofl/mashanzheng), under `OFL.txt`. It is copied once to the host's font resource path; each lesson contains only the compact animation data for its visible non-ASCII characters. Generation never downloads fonts at runtime. Path-derived strokes approximate handwriting; they do not guarantee standard Chinese stroke order.
