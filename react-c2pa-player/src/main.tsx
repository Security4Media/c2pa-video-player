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
import videojs from 'video.js';
import './index.css';
import './styles/videojs-enhancements.css';
import './styles/c2pa-player.css';
import App from './App';

// Expose videojs globally for C2paPlayer-V2 modules
// This must be done before any Video.js players are created
// Matches the pattern from cawg_c2pa_player.html where videojs is loaded via <script> tag
if (typeof window !== 'undefined') {
  (window as any).videojs = videojs;
  console.log('[Main] Exposed videojs globally for C2PA Player V2');
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
