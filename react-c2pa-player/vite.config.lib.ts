/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Library build for the published @security4media/c2pa-player package.
// Separate from vite.config.ts (the app build): that config targets
// index.html/src/demo and bundles every dependency into one SPA; this one
// targets src/lib/index.ts only and externalizes every non-relative import,
// so the published package doesn't ship a second copy of react, video.js,
// dash.js, or the c2pa/WASM runtimes the consumer already installs.
//
// ESM only, deliberately: localTrustMaterialProvider.ts imports the C2PA
// WASM binary as `@contentauth/c2pa-web/resources/c2pa.wasm?url`, a Vite
// asset-URL import. That import stays external (see below) so consumers get
// their own installed copy of the WASM, but the `?url` suffix is Vite-only
// syntax - plain Node `require()` (and non-Vite ESM resolution) can't follow
// it regardless of module format, so a CJS output would just be a second,
// equally Vite-dependent artifact. Consumers of this package need a
// Vite-based build.
export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: 'src/lib',
      // vite-env.d.ts lives one level up (it's ambient, shared by both the
      // demo and the library), but declaration generation needs it in scope
      // too, or the vite/client ?url module wildcard it references isn't
      // visible and every trust-material/WASM asset import fails to type.
      include: ['src/lib', 'src/vite-env.d.ts'],
      outDir: 'dist-lib',
      rollupTypes: false,
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // The app's public/ (test-fixture MP4s, HLS fixtures) has nothing to do
  // with the library build and would otherwise be copied into dist-lib
  // verbatim, growing the published package by several hundred MB.
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/lib/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Rollup checks `external` against the raw import specifier before
      // Vite's alias plugin ever sees it, so the `@/...` alias used
      // throughout src/lib (e.g. `@/lib/validation`) must be recognised as
      // internal here too - otherwise it reads exactly like a bare package
      // import (`@scope/name`) and gets left as a dangling, unresolvable
      // import in the published bundle instead of being alias-resolved.
      external: (id) => !(id.startsWith('.') || id.startsWith('/') || id.startsWith('@/')),
      output: {
        // style.css at the package root, matching the "./style.css" export
        // in package.json; other assets (trust PEMs, icon SVGs) keep a
        // hashed name under assets/ since consumers never import those by
        // path directly.
        assetFileNames: (asset) =>
          asset.name === 'style.css' ? 'style.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
