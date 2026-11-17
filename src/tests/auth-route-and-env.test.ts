/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: GUARDIA DE RUTAS, VERIFICACIÓN DE EMAIL, SEPARACIÓN DE ENTORNOS Y LIMPIEZA SUPABASE [A]
 * Clasificación:
 * [A] Pruebas unitarias deterministas sin emuladores ni red externa.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRouteAccessGate } from '../components/auth/ProtectedRoute';
import { resolveFirebaseRuntimeConfig } from '../services/firebaseConfig';

const PROD_VALID_CONFIG = {
  apiKey: 'AIzaProdValidKeyExample123456',
  authDomain: 'yorcatalog-prod.firebaseapp.com',
  projectId: 'yorcatalog-prod',
  storageBucket: 'yorcatalog-prod.firebasestorage.app',
  messagingSenderId: '111222333444',
  appId: '1:111222333444:web:prodabc123',
  firestoreDatabaseId: 'ai-studio-prod-db',
};

describe('[A] ProtectedRoute — Verificación de Correo, Sesión y Workspace', () => {
  it('debe bloquear el acceso si la app sigue cargando sesión (loading)', () => {
    expect(
      resolveRouteAccessGate({
        loading: true,
        connectionState: 'checking',
        user: null,
        currentWorkspace: null,
      })
    ).toBe('loading');
  });

  it('debe bloquear explícitamente con not_configured cuando Firebase no está configurado', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'not_configured',
        user: { uid: 'u1', emailVerified: true },
        currentWorkspace: null,
      })
    ).toBe('not_configured');
  });

  it('debe redirigir a /login cuando no hay usuario autenticado', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'connected',
        user: null,
        currentWorkspace: null,
      })
    ).toBe('unauthenticated');
  });

  it('debe bloquear explícitamente a usuarios autenticados con correo SIN verificar (emailVerified: false)', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'unauthorized',
        user: { uid: 'u_unverified', emailVerified: false },
        currentWorkspace: null,
      })
    ).toBe('email_unverified');
  });

  it('debe bloquear con session_expired si el token de sesión venció', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'session_expired',
        user: { uid: 'u1', emailVerified: true },
        currentWorkspace: null,
      })
    ).toBe('session_expired');
  });

  it('debe mostrar estado de invitación/creación de workspace cuando usuario verificado no tiene workspace activo', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'connected',
        user: { uid: 'u_collab', emailVerified: true },
        currentWorkspace: null,
      })
    ).toBe('no_workspace');
  });

  it('debe permitir acceso administrativo únicamente con sesión autenticada, correo verificado y workspace activo', () => {
    expect(
      resolveRouteAccessGate({
        loading: false,
        connectionState: 'connected',
        user: { uid: 'u_verified', emailVerified: true },
        currentWorkspace: {
          id: 'ws_u_verified',
          name: 'Mi Negocio',
          slug: 'mi-negocio',
          whatsappNumber: '+573001112233',
          currency: 'COP',
          language: 'es',
          theme: 'light',
        },
      })
    ).toBe('allowed');
  });
});

describe('[A] Separación de Entornos Firebase (development vs production)', () => {
  it('en desarrollo debe priorizar variables VITE_FIREBASE_DEV_* cuando están completas', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'development',
      isProdBuild: false,
      env: {
        VITE_FIREBASE_DEV_API_KEY: 'AIzaDevKey123456',
        VITE_FIREBASE_DEV_AUTH_DOMAIN: 'yorcatalog-dev.firebaseapp.com',
        VITE_FIREBASE_DEV_PROJECT_ID: 'yorcatalog-dev',
        VITE_FIREBASE_DEV_STORAGE_BUCKET: 'yorcatalog-dev.firebasestorage.app',
        VITE_FIREBASE_DEV_MESSAGING_SENDER_ID: '999888777',
        VITE_FIREBASE_DEV_APP_ID: '1:999888777:web:dev123',
        VITE_FIREBASE_DEV_FIRESTORE_DATABASE_ID: '(default)',
      },
      bundledConfig: PROD_VALID_CONFIG,
    });

    expect(res.environment).toBe('development');
    expect(res.isConfigured).toBe(true);
    expect(res.source).toBe('dev_env');
    expect(res.usingSharedAppletFallback).toBe(false);
    expect(res.config?.projectId).toBe('yorcatalog-dev');
  });

  it('en desarrollo debe rechazar configuración parcial de VITE_FIREBASE_DEV_* sin usar valores ficticios', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'development',
      isProdBuild: false,
      env: {
        VITE_FIREBASE_DEV_PROJECT_ID: 'yorcatalog-dev',
      },
      bundledConfig: PROD_VALID_CONFIG,
    });

    expect(res.isConfigured).toBe(false);
    expect(res.config).toBeNull();
    expect(res.configError).toMatch(/incompleta/i);
  });

  it('en desarrollo con VITE_FIREBASE_REQUIRE_DEV_ENV=true debe fallar si no hay variables dev aisladas', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'development',
      isProdBuild: false,
      env: {
        VITE_FIREBASE_REQUIRE_DEV_ENV: 'true',
      },
      bundledConfig: PROD_VALID_CONFIG,
    });

    expect(res.isConfigured).toBe(false);
    expect(res.config).toBeNull();
    expect(res.configError).toMatch(/VITE_FIREBASE_REQUIRE_DEV_ENV/);
  });

  it('en producción debe bloquear si el projectId coincide con VITE_FIREBASE_DEV_PROJECT_ID', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'production',
      isProdBuild: true,
      env: {
        VITE_FIREBASE_DEV_PROJECT_ID: 'yorcatalog-prod',
      },
      bundledConfig: PROD_VALID_CONFIG,
    });

    expect(res.environment).toBe('production');
    expect(res.isConfigured).toBe(false);
    expect(res.config).toBeNull();
    expect(res.configError).toMatch(/mismo projectId de desarrollo/i);
  });

  it('en producción debe bloquear si VITE_FIREBASE_TARGET_ENV apunta a development', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'production',
      isProdBuild: true,
      env: {
        VITE_FIREBASE_TARGET_ENV: 'development',
      },
      bundledConfig: PROD_VALID_CONFIG,
    });

    expect(res.isConfigured).toBe(false);
    expect(res.configError).toMatch(/Bloqueo de seguridad de entorno/i);
  });

  it('en producción debe aceptar variables VITE_FIREBASE_PROD_* cuando están completas y aisladas de dev', () => {
    const res = resolveFirebaseRuntimeConfig({
      mode: 'production',
      isProdBuild: true,
      env: {
        VITE_FIREBASE_DEV_PROJECT_ID: 'yorcatalog-dev',
        VITE_FIREBASE_PROD_API_KEY: 'AIzaProdOnlyKey777',
        VITE_FIREBASE_PROD_AUTH_DOMAIN: 'yorcatalog-prod-real.firebaseapp.com',
        VITE_FIREBASE_PROD_PROJECT_ID: 'yorcatalog-prod-real',
        VITE_FIREBASE_PROD_STORAGE_BUCKET: 'yorcatalog-prod-real.firebasestorage.app',
        VITE_FIREBASE_PROD_MESSAGING_SENDER_ID: '555666777',
        VITE_FIREBASE_PROD_APP_ID: '1:555666777:web:realprod',
        VITE_FIREBASE_PROD_FIRESTORE_DATABASE_ID: 'prod-db',
      },
      bundledConfig: null,
    });

    expect(res.environment).toBe('production');
    expect(res.isConfigured).toBe(true);
    expect(res.source).toBe('prod_env');
    expect(res.config?.projectId).toBe('yorcatalog-prod-real');
  });
});

describe('[A] Higiene del Repositorio: Cero Dependencias Heredadas de Supabase', () => {
  it('no debe existir la carpeta /supabase ni @supabase/supabase-js en package.json', () => {
    const supabaseDir = resolve(process.cwd(), 'supabase');
    const pkgPath = resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    expect(existsSync(supabaseDir)).toBe(false);
    expect(pkg.dependencies?.['@supabase/supabase-js']).toBeUndefined();
    expect(pkg.devDependencies?.['@supabase/supabase-js']).toBeUndefined();
  });
});
