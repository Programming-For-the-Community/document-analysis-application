// Unit tests for main-process logic and the renderer's handlers/hooks. Coverage is
// written as LCOV for SonarQube Cloud (see .github/workflows/sonar_scan.yml).
//
// The coverage scope must stay in step with sonar.coverage.exclusions in
// ../sonar-project.properties: React view components (*.tsx), the preload bridge,
// the Electron entry point and the build/release CLI scripts are excluded there
// and here — everything else is expected to be unit-tested.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Electron's main-process API only exists inside an Electron runtime; tests get
    // a recording fake (ipcMain.handle → invoke(), BrowserWindow, app, dialog, shell).
    alias: { electron: path.join(root, 'tests/mocks/electron.ts') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'classes/**',
        'constants/**',
        'main/**',
        'utils/**',
        'renderer/handlers/**',
        'renderer/hooks/**',
        'scripts/sync-version.js',
      ],
      exclude: ['main/index.ts', '**/*.d.ts'],
    },
  },
});
