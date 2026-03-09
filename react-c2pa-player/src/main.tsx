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
