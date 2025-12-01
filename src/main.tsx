import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { filmstripCache } from '@/features/timeline/services/filmstrip-cache';
import './index.css';

// Cleanup filmstrip workers on page unload
window.addEventListener('beforeunload', () => {
  filmstripCache.dispose();
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
