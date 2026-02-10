import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { filmstripCache } from '@/features/timeline/services/filmstrip-cache';
import { initializeDebugUtils } from '@/lib/debug';
import { createLogger } from '@/lib/logger';
import './index.css';

const log = createLogger('App');

// Initialize debug utilities in development mode
initializeDebugUtils();

// Global error handlers
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  log.error('Uncaught error:', event.error);
});

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
