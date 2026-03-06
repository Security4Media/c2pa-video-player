import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/videojs-enhancements.css';
import App from './App';

const rootElement = document.getElementById('c2pa-player-root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
