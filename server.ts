/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVIDOR FULL-STACK CLOUD RUN (EXPRESS + VITE MIDDLEWARE EN DEV / DIST EN PROD)
 * Expone el Storage Broker bajo `/api/storage/*` en el mismo origen que la PWA.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createStorageBrokerRouter } from './server/storageBroker.ts';
import { getFirebaseAdminContext } from './server/firebaseAdmin.ts';

export function createAppServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const adminCtx = getFirebaseAdminContext();
    res.status(200).json({
      ok: true,
      service: 'yorcatalog-storage-broker',
      runtime: 'cloud-run-express',
      adminConfigured: adminCtx.configured,
      projectId: adminCtx.config.projectId,
      firestoreDatabaseId: adminCtx.config.firestoreDatabaseId,
      storageBucket: adminCtx.config.storageBucket,
    });
  });

  app.use('/api/storage', createStorageBrokerRouter());

  return app;
}

async function startServer() {
  const app = createAppServer();
  const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT || 3000);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[YorCatalog] Servidor Express + Storage Broker escuchando en http://0.0.0.0:${port}`);
  });
}

// Evitar levantar listener HTTP cuando se importa desde Vitest
if (!process.env.VITEST) {
  void startServer();
}
