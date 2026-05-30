import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(webDir, '../..');
const demoRoot = path.resolve(webDir, '..');
const IC_HTTP_PROXY_PREFIXES = ['/api/v2', '/api/v3', '/api/v4'] as const;

function icReplicaTargetFromEnv(mode: string): string {
  const env = loadEnv(mode, webDir, '');
  const raw = (env.VITE_IC_HOST ?? '').trim();
  if (raw.length > 0) {
    return raw.includes('://') ? raw : `http://${raw}`;
  }
  return 'http://127.0.0.1:4943';
}

function normalizeLoopbackReplicaTarget(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.toString().replace(/\/$/, '');
  } catch {
    return urlStr;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, webDir, '');
  const icTarget = normalizeLoopbackReplicaTarget(icReplicaTargetFromEnv(mode));
  const rawDemoApi = (env.VITE_DEMO_API_PROXY_TARGET ?? 'http://127.0.0.1:8787').trim();
  const demoApiTarget = rawDemoApi.includes('://') ? rawDemoApi : `http://${rawDemoApi}`;

  const icProxy = Object.fromEntries(
    IC_HTTP_PROXY_PREFIXES.map((prefix) => [
      prefix,
      { target: icTarget, changeOrigin: true },
    ])
  );

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@demo-shared': path.join(demoRoot, 'shared'),
        '@together-alone/zombiedelete-core': path.join(sdkRoot, 'zombiedelete-core/src/index.ts'),
        '@together-alone/zombiedelete': path.join(sdkRoot, 'zombiedelete/src/index.ts'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        ...icProxy,
        '/demo-api': {
          target: demoApiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/demo-api/, ''),
        },
      },
      fs: { allow: [webDir, demoRoot, sdkRoot] },
    },
    preview: {
      proxy: {
        ...icProxy,
        '/demo-api': {
          target: demoApiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/demo-api/, ''),
        },
      },
    },
  };
});
