import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.VITE_BASE_PATH || '/';
  const hmrHost = env.VITE_HMR_HOST;
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : undefined;
  const hmrProtocol = env.VITE_HMR_PROTOCOL || 'ws';
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];

  if (hmrHost) {
    allowedHosts.push(hmrHost);
  }

  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts,
      ...(hmrHost
        ? {
            hmr: {
              protocol: hmrProtocol,
              host: hmrHost,
              port: hmrPort || 3000,
            },
          }
        : {}),
      // Fix Content-Length mismatch issues
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      // Disable file system caching to prevent Content-Length issues
      fs: {
        strict: false,
      },
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        'Cache-Control': 'public, max-age=31536000',
      },
    },
    plugins: [react()],
    // Note: do not inject API keys into frontend code.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
