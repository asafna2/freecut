/**
 * Application configuration from environment variables
 *
 * All environment variables must be prefixed with VITE_ to be exposed to the client.
 * See: https://vite.dev/guide/env-and-mode.html
 *
 * Usage:
 *   import { config } from '@/lib/config';
 *   const url = config.api.baseUrl;
 */

interface AppConfig {
  api: {
    baseUrl: string;
    socketUrl: string;
  };
  isDev: boolean;
  isProd: boolean;
}

function getEnvVar(key: string, defaultValue: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value : defaultValue;
}

export const config: AppConfig = {
  api: {
    baseUrl: getEnvVar('VITE_API_BASE_URL', 'http://localhost:3001/api'),
    socketUrl: getEnvVar('VITE_SOCKET_URL', 'http://localhost:3001'),
  },
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
};
