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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Video.js's own stylesheet is imported here, first, rather than beside the
// component that creates the player. Vite emits CSS in module-graph order, so
// importing it from a component two levels down put the vendor base *after*
// our overrides, and every rule of ours at equal specificity lost. That is
// what the `!important` declarations in the sheets below were compensating
// for. Vendor base first, our overrides after, in one place that can be read.
import 'video.js/dist/video-js.css';
import './index.css';
import '../lib/styles/videojs-enhancements.css';
import '../lib/styles/c2pa-player.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
