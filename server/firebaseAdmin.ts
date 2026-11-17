/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * INICIALIZACIÓN PRIVILEGIADA DE FIREBASE ADMIN SDK (CLOUD RUN / SERVER-ONLY)
 * - Conecta explícitamente con la base Cloud Firestore nombrada del proyecto
 *   (`ai-studio-yorcatalog-2bed9ea5-0c3f-4ed5-ba39-992a8dc979d8`).
 * - Conecta con el bucket configurado (`gen-lang-client-0383225470.firebasestorage.app`).
 * - Utiliza Application Default Credentials (ADC / Service Account IAM en Cloud Run)
 *   o `FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` en servidor local.
 * - Política Cloud-Only: nunca expone llaves privadas al navegador ni simula éxito sin credenciales.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeApp,
  getApps,
  getApp,
  applicationDefault,
  cert,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

export interface FirebaseAdminTargetConfig {
  projectId: string;
  firestoreDatabaseId: string;
  storageBucket: string;
}

export interface FirebaseAdminContext {
  configured: boolean;
  config: FirebaseAdminTargetConfig;
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
  storage: Storage | null;
  configError: string | null;
}

function loadBundledAppletConfig(): Partial<{
  projectId: string;
  firestoreDatabaseId: string;
  storageBucket: string;
}> {
  try {
    const cfgPath = resolve(process.cwd(), 'firebase-applet-config.json');
    if (existsSync(cfgPath)) {
      return JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, string>;
    }
  } catch {
    // Fallback controlado a variables de entorno de servidor
  }
  return {};
}

export function resolveAdminTargetConfig(
  env: Record<string, string | undefined> = process.env
): FirebaseAdminTargetConfig {
  const bundled = loadBundledAppletConfig();
  return {
    projectId:
      env.FIREBASE_PROJECT_ID?.trim() ||
      env.VITE_FIREBASE_PROD_PROJECT_ID?.trim() ||
      env.VITE_FIREBASE_PROJECT_ID?.trim() ||
      bundled.projectId ||
      'gen-lang-client-0383225470',
    firestoreDatabaseId:
      env.FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
      env.VITE_FIREBASE_PROD_FIRESTORE_DATABASE_ID?.trim() ||
      env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
      bundled.firestoreDatabaseId ||
      'ai-studio-yorcatalog-2bed9ea5-0c3f-4ed5-ba39-992a8dc979d8',
    storageBucket:
      env.FIREBASE_STORAGE_BUCKET?.trim() ||
      env.VITE_FIREBASE_PROD_STORAGE_BUCKET?.trim() ||
      env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ||
      bundled.storageBucket ||
      'gen-lang-client-0383225470.firebasestorage.app',
  };
}

function hasCredentialSource(env: Record<string, string | undefined>): boolean {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return true;
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim() && existsSync(env.GOOGLE_APPLICATION_CREDENTIALS.trim())) {
    return true;
  }
  if (env.K_SERVICE?.trim() || env.FUNCTION_TARGET?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim()) {
    return true;
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || env.FIRESTORE_EMULATOR_HOST?.trim()) {
    return true;
  }
  return false;
}

let cachedContext: FirebaseAdminContext | null = null;

export function getFirebaseAdminContext(forceReinit = false): FirebaseAdminContext {
  if (cachedContext && !forceReinit) {
    return cachedContext;
  }

  const env = process.env;
  const target = resolveAdminTargetConfig(env);

  if (!hasCredentialSource(env)) {
    cachedContext = {
      configured: false,
      config: target,
      app: null,
      auth: null,
      db: null,
      storage: null,
      configError:
        'Firebase Admin SDK sin credenciales de servidor. Define GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_JSON o ejecuta en Cloud Run con Service Account IAM.',
    };
    return cachedContext;
  }

  try {
    let app: App;
    if (getApps().length > 0) {
      app = getApp();
    } else if (env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) as ServiceAccount;
      app = initializeApp({
        credential: cert(parsed),
        projectId: target.projectId,
        storageBucket: target.storageBucket,
      });
    } else if (
      env.FIREBASE_AUTH_EMULATOR_HOST?.trim() ||
      env.FIRESTORE_EMULATOR_HOST?.trim()
    ) {
      app = initializeApp({
        projectId: target.projectId,
        storageBucket: target.storageBucket,
      });
    } else {
      app = initializeApp({
        credential: applicationDefault(),
        projectId: target.projectId,
        storageBucket: target.storageBucket,
      });
    }

    const auth = getAuth(app);
    // Conectar explícitamente a la base Firestore nombrada del proyecto
    const db = getFirestore(app, target.firestoreDatabaseId);
    const storage = getStorage(app);

    cachedContext = {
      configured: true,
      config: target,
      app,
      auth,
      db,
      storage,
      configError: null,
    };
    return cachedContext;
  } catch (err) {
    cachedContext = {
      configured: false,
      config: target,
      app: null,
      auth: null,
      db: null,
      storage: null,
      configError:
        err instanceof Error
          ? `No se pudo inicializar Firebase Admin SDK: ${err.message}`
          : 'No se pudo inicializar Firebase Admin SDK.',
    };
    return cachedContext;
  }
}
