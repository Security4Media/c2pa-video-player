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

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts rather than extending it: that
// config carries the dev server, its /mp4s proxy and the React plugin, none of
// which a node-side unit run needs, and its `@` alias is written Vite-style
// (root-relative '/src/'), which does not resolve outside a dev server.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Validation logic is pure: verdicts, intervals, view models. Anything
    // needing a real engine or a real video element belongs in the browser
    // suite instead (see VALIDATION_TESTING_PLAN.md).
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
