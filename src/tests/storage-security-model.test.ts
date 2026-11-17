/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS — FASE R2.3.3: MODELO DE AUTORIZACIÓN BROKER-FIRST Y DEFENSA EN PROFUNDIDAD
 *
 * Clasificación estricta:
 * - [A] Pruebas unitarias / contrato estático sobre `storage.rules`, `server/storageBroker.ts` e `imageService.ts`.
 * - [B] Pruebas contra Firebase Storage Emulator (omitidas automáticamente si
 *       `FIREBASE_STORAGE_EMULATOR_HOST` no está activo en el entorno).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPrivateAssetStoragePath,
  buildWorkspacePrivateAssetPath,
  buildPublicCatalogStoragePath,
  isManagedStoragePath,
  isPrivateManagedAsset,
  isPublicCatalogAsset,
  deleteProductImageFromStorage,
} from '../services/imageService';

describe('[A] R2.3.3 — Contrato Broker-First en storage.rules y Ausencia de Custom Claims Primarios', () => {
  const storageRulesPath = resolve(process.cwd(), 'storage.rules');
  const storageRules = readFileSync(storageRulesPath, 'utf-8');
  const storageRulesCodeOnly = storageRules.replace(/\/\/.*$/gm, '');

  it('debe bloquear todas las escrituras, listados y lecturas privadas directas desde SDK cliente (Broker-First)', () => {
    expect(storageRulesCodeOnly).toMatch(
      /match \/catalog-images\/\{workspaceId\}\/\{fileName\}[\s\S]*allow get, list: if false;\s*allow create, update, delete: if false;/
    );
    expect(storageRulesCodeOnly).toMatch(
      /match \/workspace-private\/\{workspaceId\}\/\{fileName\}[\s\S]*allow get, list: if false;\s*allow create, update, delete: if false;/
    );
  });

  it('debe permitir únicamente allow get anónimo de imágenes raster válidas en public-catalogs (sin list ni escrituras cliente)', () => {
    expect(storageRulesCodeOnly).toMatch(
      /match \/public-catalogs\/\{workspaceId\}\/\{catalogId\}\/\{fileName\}[\s\S]*allow get: if isValidSegment\(workspaceId\) &&\s*isValidSegment\(catalogId\) &&\s*isSafeImageFileName\(fileName\);\s*allow list: if false;\s*allow create, update, delete: if false;/
    );
    expect(storageRulesCodeOnly).not.toMatch(/allow\s+write:/);
    expect(storageRulesCodeOnly).not.toMatch(/allow\s+delete:[^;]*resource\.metadata\.uploadedBy/);
  });

  it('debe verificar que el Backend Broker existe en Cloud Run (server/firebaseAdmin.ts y server/storageBroker.ts) sin Custom Claims primarios', () => {
    const adminPath = resolve(process.cwd(), 'server/firebaseAdmin.ts');
    const brokerPath = resolve(process.cwd(), 'server/storageBroker.ts');
    expect(existsSync(adminPath)).toBe(true);
    expect(existsSync(brokerPath)).toBe(true);

    const brokerSrc = readFileSync(brokerPath, 'utf-8');
    expect(brokerSrc).toContain('verifyIdToken(idToken, true)');
    expect(brokerSrc).toContain('getWorkspaceMemberRole');
    expect(brokerSrc).not.toContain('setCustomUserClaims');
  });
});

describe('[A] R2.3.3 — Generación y Clasificación de Rutas Público vs Privado en imageService', () => {
  it('debe construir rutas aisladas por dominio lógico y clasificar correctamente privado vs público', () => {
    const staging = buildPrivateAssetStoragePath('ws_123', 'foto.jpg', '7701234567890');
    const privateAsset = buildWorkspacePrivateAssetPath('ws_123', 'logo.png');
    const publishedAsset = buildPublicCatalogStoragePath('ws_123', 'cat_navidad', 'promo.webp', '770999');

    expect(staging).toMatch(/^catalog-images\/ws_123\/7701234567890_[0-9]+_[a-z0-9]+\.jpg$/);
    expect(privateAsset).toMatch(/^workspace-private\/ws_123\/logo_png_[0-9]+_[a-z0-9]+\.png$/);
    expect(publishedAsset).toMatch(/^public-catalogs\/ws_123\/cat_navidad\/770999_[0-9]+_[a-z0-9]+\.webp$/);

    expect(isPrivateManagedAsset(staging)).toBe(true);
    expect(isPrivateManagedAsset(privateAsset)).toBe(true);
    expect(isPrivateManagedAsset(publishedAsset)).toBe(false);

    expect(isPublicCatalogAsset(publishedAsset)).toBe(true);
    expect(isPublicCatalogAsset(staging)).toBe(false);
  });

  it('debe validar estrictamente rutas administradas y rechazar path traversal o prefijos externos', async () => {
    expect(isManagedStoragePath('catalog-images/ws_1/img.jpg')).toBe(true);
    expect(isManagedStoragePath('workspace-private/ws_1/logo.png')).toBe(true);
    expect(isManagedStoragePath('public-catalogs/ws_1/cat_1/item.webp')).toBe(true);
    expect(isManagedStoragePath('catalog-images/../secret/img.jpg')).toBe(false);
    expect(isManagedStoragePath('untrusted/ws_1/img.jpg')).toBe(false);

    await expect(deleteProductImageFromStorage('catalog-images/../escape.png')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});

const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

describe.skipIf(!storageEmulatorHost)(
  '[B] R2.3.3 — Verificación de storage.rules en Firebase Storage Emulator',
  () => {
    const baseUrl = `http://${storageEmulatorHost}/v0/b/gen-lang-client-0383225470.firebasestorage.app/o`;

    function makeEmulatorJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.`;
    }

    it('debe bloquear escritura directa incluso de usuario autenticado hacia catalog-images/ (solo Broker Admin SDK)', async () => {
      const objName = encodeURIComponent('catalog-images/ws_emu_owner/emu_direct_blocked.png');
      const ownerToken = makeEmulatorJwt({
        sub: 'emu_owner',
        user_id: 'emu_owner',
        email: 'owner@yorcatalog.test',
        email_verified: true,
      });
      const res = await fetch(`${baseUrl}?name=${objName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'image/png',
        },
        body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
      });
      expect([401, 403]).toContain(res.status);
    });
  }
);
