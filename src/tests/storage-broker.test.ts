/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS — FASE R2.3.3: STORAGE BROKER BACKEND & CICLO DE VIDA DE ACTIVOS
 *
 * Clasificación estricta y explícita:
 * - [A] Pruebas Unitarias y de Integración HTTP reales contra el Express Router del Storage Broker
 *       (`server/storageBroker.ts`) con dependencias inyectadas (`StorageBrokerDeps` mockeadas),
 *       además de `imageService.ts` y helpers de publicación/despublicación en `firebaseDataService.ts`.
 *       NO demuestran conexión al bucket remoto (HTTP 404 pendiente de inicialización) ni reglas en GCP.
 * - [B] Pruebas de Integración contra Firebase Emulators (Auth + Firestore + Storage).
 *       Se ejecutan únicamente cuando `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`
 *       y `FIREBASE_STORAGE_EMULATOR_HOST` están activos en el entorno (en este contenedor sin Java
 *       quedan omitidas y reportadas honestamente).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  createStorageBrokerRouter,
  detectImageFormatFromMagicBytes,
  MAX_BROKER_FILE_SIZE,
  SIGN_UPLOAD_TTL_SECONDS,
  PRIVATE_ASSET_TTL_SECONDS,
  type StorageBrokerDeps,
  type BrokerWorkspaceRole,
  type InspectedStorageObject,
} from '../../server/storageBroker';
import { resolveAdminTargetConfig } from '../../server/firebaseAdmin';
import {
  clearPrivateAssetUrlCache,
  isCachedSignedUrlValid,
  resolvePrivateAssetUrl,
  uploadProductImageToStorage,
} from '../services/imageService';
import {
  collectPrivateAssetsForCatalogPromotion,
  applyPromotedPublicUrlsToCatalogSnapshot,
  hasPromotedPublicCatalogAssets,
} from '../services/firebaseDataService';
import type { Catalog } from '../types';

// Encabezados binarios válidos (>= 12 bytes) para magic bytes reales
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const SVG_BYTES = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const GARBAGE_BYTES = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]);

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

interface StoredMockObject {
  contentType: string;
  sizeBytes: number;
  headerBytes: Uint8Array;
  metadata: Record<string, string>;
}

interface HarnessContext {
  baseUrl: string;
  close: () => Promise<void>;
  tokens: Record<
    string,
    | { uid: string; email: string; email_verified: boolean; revoked?: boolean; expired?: boolean }
    | undefined
  >;
  workspaces: Record<string, { ownerId: string; members: Record<string, BrokerWorkspaceRole> }>;
  objects: Map<string, StoredMockObject>;
  verifyChecksRevokedFlags: boolean[];
  failCopyOnPath: string | null;
  lastIssuedUrls: Array<{ kind: 'upload' | 'read'; storagePath: string; expiresInSeconds: number; url: string }>;
  configured: boolean;
  fixedNowMs: number;
}

async function startBrokerHarness(): Promise<HarnessContext> {
  const tokens: HarnessContext['tokens'] = {
    'tok-owner-a': { uid: 'uid_owner_a', email: 'owner-a@yorcatalog.test', email_verified: true },
    'tok-admin-a': { uid: 'uid_admin_a', email: 'admin-a@yorcatalog.test', email_verified: true },
    'tok-member-a': { uid: 'uid_member_a', email: 'member-a@yorcatalog.test', email_verified: true },
    'tok-unverified': { uid: 'uid_unverified', email: 'unver@yorcatalog.test', email_verified: false },
    'tok-revoked': {
      uid: 'uid_admin_a',
      email: 'admin-a@yorcatalog.test',
      email_verified: true,
      revoked: true,
    },
    'tok-owner-b': { uid: 'uid_owner_b', email: 'owner-b@yorcatalog.test', email_verified: true },
  };

  const workspaces: HarnessContext['workspaces'] = {
    ws_A: {
      ownerId: 'uid_owner_a',
      members: {
        uid_owner_a: 'owner',
        uid_admin_a: 'admin',
        uid_member_a: 'member',
        uid_unverified: 'admin',
      },
    },
    ws_B: {
      ownerId: 'uid_owner_b',
      members: {
        uid_owner_b: 'owner',
      },
    },
  };

  const objects = new Map<string, StoredMockObject>();
  const verifyChecksRevokedFlags: boolean[] = [];
  const lastIssuedUrls: HarnessContext['lastIssuedUrls'] = [];

  const ctx: HarnessContext = {
    baseUrl: '',
    close: async () => {},
    tokens,
    workspaces,
    objects,
    verifyChecksRevokedFlags,
    failCopyOnPath: null,
    lastIssuedUrls,
    configured: true,
    fixedNowMs: Date.now(),
  };

  const deps: StorageBrokerDeps = {
    isConfigured: () => ctx.configured,
    getConfigError: () => (ctx.configured ? null : 'Credenciales Admin SDK no configuradas'),
    nowMs: () => ctx.fixedNowMs,
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        ctx.verifyChecksRevokedFlags.push(checkRevoked);
        const rec = ctx.tokens[token];
        if (!rec) {
          const err = new Error('Invalid token') as Error & { code?: string };
          err.code = 'auth/argument-error';
          throw err;
        }
        if (rec.revoked) {
          const err = new Error('Firebase ID token has been revoked') as Error & { code?: string };
          err.code = 'auth/id-token-revoked';
          throw err;
        }
        if (rec.expired) {
          const err = new Error('Firebase ID token has expired') as Error & { code?: string };
          err.code = 'auth/id-token-expired';
          throw err;
        }
        return {
          uid: rec.uid,
          email: rec.email,
          email_verified: rec.email_verified,
        };
      },
    },
    membershipStore: {
      getWorkspaceOwnerId: async (workspaceId: string) => ctx.workspaces[workspaceId]?.ownerId ?? null,
      getWorkspaceMemberRole: async (workspaceId: string, uid: string) =>
        ctx.workspaces[workspaceId]?.members[uid] ?? null,
    },
    storage: {
      bucketName: 'gen-lang-client-0383225470.firebasestorage.app',
      getSignedUploadUrl: async ({ storagePath, expiresInSeconds }) => {
        const expUnix = Math.floor(ctx.fixedNowMs / 1000) + expiresInSeconds;
        const url = `https://storage.googleapis.com/gen-lang-client-0383225470.firebasestorage.app/${storagePath}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=${expiresInSeconds}&X-Exp=${expUnix}`;
        ctx.lastIssuedUrls.push({ kind: 'upload', storagePath, expiresInSeconds, url });
        return url;
      },
      getSignedReadUrl: async ({ storagePath, expiresInSeconds }) => {
        const expUnix = Math.floor(ctx.fixedNowMs / 1000) + expiresInSeconds;
        const url = `https://storage.googleapis.com/gen-lang-client-0383225470.firebasestorage.app/${storagePath}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=${expiresInSeconds}&X-Exp=${expUnix}`;
        ctx.lastIssuedUrls.push({ kind: 'read', storagePath, expiresInSeconds, url });
        return url;
      },
      inspectObject: async (storagePath: string): Promise<InspectedStorageObject> => {
        const obj = ctx.objects.get(storagePath);
        if (!obj) {
          return {
            exists: false,
            sizeBytes: 0,
            contentType: '',
            headerBytes: new Uint8Array(0),
          };
        }
        return {
          exists: true,
          sizeBytes: obj.sizeBytes,
          contentType: obj.contentType,
          headerBytes: obj.headerBytes,
          metadata: obj.metadata,
        };
      },
      copyObjectToPublic: async ({ sourcePath, destinationPath, contentType, metadata }) => {
        if (ctx.failCopyOnPath === sourcePath) {
          throw new Error(`Simulated GCS copy failure for ${sourcePath}`);
        }
        const src = ctx.objects.get(sourcePath);
        if (!src) {
          throw new Error(`No such object: ${sourcePath}`);
        }
        // Nunca copiar firebaseStorageDownloadTokens
        const cleanMeta = { ...metadata };
        delete cleanMeta.firebaseStorageDownloadTokens;
        ctx.objects.set(destinationPath, {
          contentType,
          sizeBytes: src.sizeBytes,
          headerBytes: src.headerBytes,
          metadata: cleanMeta,
        });
      },
      deleteObject: async (storagePath: string) => {
        return ctx.objects.delete(storagePath);
      },
      listAndDeletePrefix: async (prefix: string) => {
        const deleted: string[] = [];
        for (const key of Array.from(ctx.objects.keys())) {
          if (key.startsWith(prefix)) {
            ctx.objects.delete(key);
            deleted.push(key);
          }
        }
        return deleted;
      },
    },
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/storage', createStorageBrokerRouter(deps));

  const server = http.createServer(app);
  await new Promise<void>((resolveReady) => {
    server.listen(0, '127.0.0.1', () => resolveReady());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  ctx.baseUrl = `http://127.0.0.1:${port}/api/storage`;
  ctx.close = async () => {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((err) => (err ? rejectClose(err) : resolveClose()));
    });
  };

  return ctx;
}

describe('[A] R2.3.3 — Storage Broker Backend: Matriz Autorización, Revocación, Magic Bytes y Ciclo de Vida', () => {
  let harness: HarnessContext;

  beforeEach(async () => {
    clearPrivateAssetUrlCache();
    harness = await startBrokerHarness();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await harness.close();
  });

  it('debe configurar explícitamente el proyecto, base Firestore nombrada y bucket requeridos en firebaseAdmin', () => {
    const cfg = resolveAdminTargetConfig({});
    expect(cfg.projectId).toBe('gen-lang-client-0383225470');
    expect(cfg.firestoreDatabaseId).toBe('ai-studio-yorcatalog-2bed9ea5-0c3f-4ed5-ba39-992a8dc979d8');
    expect(cfg.storageBucket).toBe('gen-lang-client-0383225470.firebasestorage.app');
  });

  it('debe retornar 503 broker_not_configured cuando el servidor no tiene credenciales Admin SDK', async () => {
    harness.configured = false;
    const res = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-owner-a',
      },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        filename: '7701234567890.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        fileHeaderBase64: toBase64(JPEG_HEADER),
      }),
    });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('broker_not_configured');
  });

  it('debe rechazar peticiones no autenticadas (401), con token revocado via verifyIdToken(token, true) (401) y con email sin verificar (403)', async () => {
    // 1. No autenticado
    const unauthRes = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws_A' }),
    });
    expect(unauthRes.status).toBe(401);
    expect((await unauthRes.json()).code).toBe('missing_bearer_token');

    // 2. Token revocado -> verifica que siempre se llama verifyIdToken(token, true)
    const revRes = await fetch(`${harness.baseUrl}/private-asset-url?workspaceId=ws_A&storagePath=catalog-images/ws_A/a.jpg`, {
      headers: { Authorization: 'Bearer tok-revoked' },
    });
    expect(revRes.status).toBe(401);
    expect((await revRes.json()).code).toBe('token_revoked');
    expect(harness.verifyChecksRevokedFlags).toEqual([true]);

    // 3. Email sin verificar (aun teniendo rol admin en Firestore)
    const unverRes = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok-unverified',
      },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        fileHeaderBase64: toBase64(JPEG_HEADER),
      }),
    });
    expect(unverRes.status).toBe(403);
    expect((await unverRes.json()).code).toBe('email_not_verified');
  });

  it('debe validar permisos completos para owner, admin y member en los 5 endpoints (sin Download Tokens permanentes)', async () => {
    // Member puede firmar subida staging (`catalog_staging`)
    const memberSign = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-member-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        scope: 'catalog_staging',
        filename: '770001.png',
        contentType: 'image/png',
        sizeBytes: 4096,
        ean: '770001',
        fileHeaderBase64: toBase64(PNG_HEADER),
      }),
    });
    expect(memberSign.status).toBe(200);
    const memberSignBody = await memberSign.json();
    expect(memberSignBody.storagePath).toMatch(/^catalog-images\/ws_A\/770001_[0-9]+_[a-f0-9]+\.png$/);
    expect(memberSignBody.ttlSeconds).toBe(SIGN_UPLOAD_TTL_SECONDS);
    expect(memberSignBody.uploadUrl).toContain('X-Goog-Expires=120');
    expect(memberSignBody.canonicalMediaUrl).not.toContain('token=');
    expect(memberSignBody.requiredHeaders['x-goog-content-length-range']).toBe(`1,${MAX_BROKER_FILE_SIZE}`);
    expect(memberSignBody.requiredHeaders['x-goog-meta-workspaceid']).toBe('ws_A');
    expect(memberSignBody.requiredHeaders['x-goog-meta-uploadedby']).toBe('uid_member_a');

    // Member NO puede firmar subida en `workspace_private`
    const memberPrivSign = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-member-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        scope: 'workspace_private',
        filename: 'logo.webp',
        contentType: 'image/webp',
        sizeBytes: 2048,
        fileHeaderBase64: toBase64(WEBP_HEADER),
      }),
    });
    expect(memberPrivSign.status).toBe(403);
    expect((await memberPrivSign.json()).code).toBe('insufficient_role');

    // Admin SÍ puede firmar `workspace_private`
    const adminPrivSign = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        scope: 'workspace_private',
        filename: 'logo.webp',
        contentType: 'image/webp',
        sizeBytes: 2048,
        fileHeaderBase64: toBase64(WEBP_HEADER),
      }),
    });
    expect(adminPrivSign.status).toBe(200);
    const adminPrivBody = await adminPrivSign.json();
    expect(adminPrivBody.storagePath).toMatch(/^workspace-private\/ws_A\/logo_[0-9]+_[a-f0-9]+\.webp$/);

    // Simular objeto subido para lectura privada
    harness.objects.set(memberSignBody.storagePath, {
      contentType: 'image/png',
      sizeBytes: 4096,
      headerBytes: PNG_HEADER,
      metadata: { workspaceid: 'ws_A', uploadedby: 'uid_member_a', visibility: 'catalog_staging' },
    });

    // Member y Owner pueden leer activo privado mediante Signed URL V4 de vida corta
    const memberRead = await fetch(
      `${harness.baseUrl}/private-asset-url?workspaceId=ws_A&storagePath=${encodeURIComponent(memberSignBody.storagePath)}`,
      { headers: { Authorization: 'Bearer tok-member-a' } }
    );
    expect(memberRead.status).toBe(200);
    const memberReadBody = await memberRead.json();
    expect(memberReadBody.ttlSeconds).toBe(PRIVATE_ASSET_TTL_SECONDS);
    expect(memberReadBody.signedUrl).toContain('X-Goog-Expires=300');

    // Member NO puede publicar, despublicar ni borrar activos
    const memberPub = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-member-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_1',
        assets: [{ itemKey: 'product:0', sourceStoragePath: memberSignBody.storagePath }],
      }),
    });
    expect(memberPub.status).toBe(403);

    const memberDel = await fetch(`${harness.baseUrl}/asset`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-member-a' },
      body: JSON.stringify({ workspaceId: 'ws_A', storagePath: memberSignBody.storagePath }),
    });
    expect(memberDel.status).toBe(403);

    // Owner y Admin SÍ pueden publicar, despublicar y eliminar
    const ownerPub = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_1',
        assets: [{ itemKey: 'product:0', sourceStoragePath: memberSignBody.storagePath }],
      }),
    });
    expect(ownerPub.status).toBe(200);
    const ownerPubBody = await ownerPub.json();
    expect(ownerPubBody.promoted).toHaveLength(1);
    expect(ownerPubBody.promoted[0].publicStoragePath).toMatch(/^public-catalogs\/ws_A\/cat_1\//);
    expect(ownerPubBody.promoted[0].publicUrl).not.toContain('token=');
  });

  it('debe reflejar inmediatamente la degradación (admin -> member) y la expulsión del colaborador sin reemitir claims', async () => {
    const srcPath = 'catalog-images/ws_A/item_100.jpg';
    harness.objects.set(srcPath, {
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      headerBytes: JPEG_HEADER,
      metadata: { workspaceid: 'ws_A', uploadedby: 'uid_admin_a' },
    });

    // 1. Mientras es admin, puede publicar
    const resAdmin = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_live',
        assets: [{ itemKey: 'product:0', sourceStoragePath: srcPath }],
      }),
    });
    expect(resAdmin.status).toBe(200);

    // 2. Degradación en Firestore en vivo: admin -> member (mismo token, sin signOut)
    harness.workspaces.ws_A.members.uid_admin_a = 'member';

    const resDowngradedPub = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_live',
        assets: [{ itemKey: 'product:0', sourceStoragePath: srcPath }],
      }),
    });
    expect(resDowngradedPub.status).toBe(403);
    expect((await resDowngradedPub.json()).code).toBe('insufficient_role');

    const resDowngradedDel = await fetch(`${harness.baseUrl}/asset`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-a' },
      body: JSON.stringify({ workspaceId: 'ws_A', storagePath: srcPath }),
    });
    expect(resDowngradedDel.status).toBe(403);

    // Como member aún puede leer activo privado
    const resMemberRead = await fetch(
      `${harness.baseUrl}/private-asset-url?workspaceId=ws_A&storagePath=${encodeURIComponent(srcPath)}`,
      { headers: { Authorization: 'Bearer tok-admin-a' } }
    );
    expect(resMemberRead.status).toBe(200);

    // 3. Remoción inmediata del workspace en Firestore
    delete harness.workspaces.ws_A.members.uid_admin_a;

    const resRemovedRead = await fetch(
      `${harness.baseUrl}/private-asset-url?workspaceId=ws_A&storagePath=${encodeURIComponent(srcPath)}`,
      { headers: { Authorization: 'Bearer tok-admin-a' } }
    );
    expect(resRemovedRead.status).toBe(403);
    expect((await resRemovedRead.json()).code).toBe('not_workspace_member');

    const resRemovedSign = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        fileHeaderBase64: toBase64(JPEG_HEADER),
      }),
    });
    expect(resRemovedSign.status).toBe(403);
    expect((await resRemovedSign.json()).code).toBe('not_workspace_member');
  });

  it('debe bloquear estrictamente el acceso entre workspaces (cross-tenant) y ámbitos públicos directos', async () => {
    harness.objects.set('catalog-images/ws_B/secreto.jpg', {
      contentType: 'image/jpeg',
      sizeBytes: 1500,
      headerBytes: JPEG_HEADER,
      metadata: { workspaceid: 'ws_B' },
    });

    // Owner de ws_A intentando acceder a ws_B
    const crossWsSign = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_B',
        filename: 'intruso.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        fileHeaderBase64: toBase64(JPEG_HEADER),
      }),
    });
    expect(crossWsSign.status).toBe(403);

    // Owner de ws_A pasando workspaceId=ws_A pero storagePath de ws_B
    const crossPathRead = await fetch(
      `${harness.baseUrl}/private-asset-url?workspaceId=ws_A&storagePath=${encodeURIComponent('catalog-images/ws_B/secreto.jpg')}`,
      { headers: { Authorization: 'Bearer tok-owner-a' } }
    );
    expect(crossPathRead.status).toBe(403);
    expect((await crossPathRead.json()).code).toBe('cross_tenant_or_invalid_path');

    const crossPathPub = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_hijack',
        assets: [{ itemKey: 'product:0', sourceStoragePath: 'catalog-images/ws_B/secreto.jpg' }],
      }),
    });
    expect(crossPathPub.status).toBe(403);
    expect((await crossPathPub.json()).code).toBe('cross_tenant_source_path');

    const crossPathDelete = await fetch(`${harness.baseUrl}/asset`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        storagePath: 'catalog-images/ws_B/secreto.jpg',
      }),
    });
    expect(crossPathDelete.status).toBe(403);

    // Cliente intentando forzar subida directa a scope público
    const forbiddenPublicScope = await fetch(`${harness.baseUrl}/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        scope: 'public_published',
        filename: 'pub.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        fileHeaderBase64: toBase64(JPEG_HEADER),
      }),
    });
    expect(forbiddenPublicScope.status).toBe(403);
    expect((await forbiddenPublicScope.json()).code).toBe('forbidden_upload_scope');
  });

  it('debe rechazar SVG, MIME falso (spoofing), binarios inválidos y tamaños > 5 MB por magic bytes reales', async () => {
    expect(detectImageFormatFromMagicBytes(JPEG_HEADER)).toBe('image/jpeg');
    expect(detectImageFormatFromMagicBytes(PNG_HEADER)).toBe('image/png');
    expect(detectImageFormatFromMagicBytes(WEBP_HEADER)).toBe('image/webp');
    expect(detectImageFormatFromMagicBytes(SVG_BYTES)).toBeNull();
    expect(detectImageFormatFromMagicBytes(GARBAGE_BYTES)).toBeNull();

    const cases: Array<{
      name: string;
      body: Record<string, unknown>;
      expectedStatus: number;
      expectedCode: string;
    }> = [
      {
        name: 'Extensión .svg explícita',
        body: {
          workspaceId: 'ws_A',
          filename: 'xss.svg',
          contentType: 'image/svg+xml',
          sizeBytes: 512,
          fileHeaderBase64: toBase64(SVG_BYTES),
        },
        expectedStatus: 415,
        expectedCode: 'svg_rejected',
      },
      {
        name: 'SVG disfrazado de .jpg y MIME image/jpeg',
        body: {
          workspaceId: 'ws_A',
          filename: 'disfraz.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 512,
          fileHeaderBase64: toBase64(SVG_BYTES),
        },
        expectedStatus: 415,
        expectedCode: 'invalid_magic_bytes',
      },
      {
        name: 'Spoofing de MIME (encabezado real PNG declarado como image/jpeg con .jpg)',
        body: {
          workspaceId: 'ws_A',
          filename: 'falso.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
          fileHeaderBase64: toBase64(PNG_HEADER),
        },
        expectedStatus: 415,
        expectedCode: 'spoofed_mime',
      },
      {
        name: 'Binario corrupto / desconocido',
        body: {
          workspaceId: 'ws_A',
          filename: 'corrupto.webp',
          contentType: 'image/webp',
          sizeBytes: 1024,
          fileHeaderBase64: toBase64(GARBAGE_BYTES),
        },
        expectedStatus: 415,
        expectedCode: 'invalid_magic_bytes',
      },
      {
        name: 'Archivo > 5 MB',
        body: {
          workspaceId: 'ws_A',
          filename: 'pesado.jpg',
          contentType: 'image/jpeg',
          sizeBytes: MAX_BROKER_FILE_SIZE + 1,
          fileHeaderBase64: toBase64(JPEG_HEADER),
        },
        expectedStatus: 413,
        expectedCode: 'file_too_large',
      },
      {
        name: 'Sin magic bytes',
        body: {
          workspaceId: 'ws_A',
          filename: 'sinbytes.png',
          contentType: 'image/png',
          sizeBytes: 1024,
        },
        expectedStatus: 400,
        expectedCode: 'missing_magic_bytes',
      },
    ];

    for (const tc of cases) {
      const res = await fetch(`${harness.baseUrl}/sign-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
        body: JSON.stringify(tc.body),
      });
      const json = await res.json();
      expect(res.status, tc.name).toBe(tc.expectedStatus);
      expect(json.code, tc.name).toBe(tc.expectedCode);
    }
  });

  it('debe ejecutar el ciclo completo publicar -> despublicar y revertir parcialmente si falla un activo al publicar', async () => {
    const coverSrc = 'workspace-private/ws_A/portada_1.jpg';
    const prod1Src = 'catalog-images/ws_A/770111_1.png';
    const prod2Missing = 'catalog-images/ws_A/770222_missing.webp';

    harness.objects.set(coverSrc, {
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      headerBytes: JPEG_HEADER,
      metadata: { workspaceid: 'ws_A' },
    });
    harness.objects.set(prod1Src, {
      contentType: 'image/png',
      sizeBytes: 3072,
      headerBytes: PNG_HEADER,
      metadata: { workspaceid: 'ws_A', firebaseStorageDownloadTokens: 'legacy-token-should-be-stripped' },
    });

    // 1. Fallo parcial en el 2do activo -> debe revertir el 1er objeto copiado a public-catalogs/
    const partialFailRes = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_atomic',
        assets: [
          { itemKey: 'cover', sourceStoragePath: coverSrc },
          { itemKey: 'product:0', sourceStoragePath: prod2Missing },
        ],
      }),
    });
    expect(partialFailRes.status).toBe(422);
    const partialBody = await partialFailRes.json();
    expect(partialBody.code).toBe('source_asset_missing');
    expect(partialBody.details.rolledBackCount).toBe(1);
    expect(harness.objects.has('public-catalogs/ws_A/cat_atomic/portada_1.jpg')).toBe(false);

    // 2. Publicación completa exitosa de los activos válidos del snapshot
    const publishRes = await fetch(`${harness.baseUrl}/publish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({
        workspaceId: 'ws_A',
        catalogId: 'cat_atomic',
        assets: [
          { itemKey: 'cover', sourceStoragePath: coverSrc },
          { itemKey: 'product:0', sourceStoragePath: prod1Src },
        ],
      }),
    });
    expect(publishRes.status).toBe(200);
    const pubJson = await publishRes.json();
    expect(pubJson.promoted).toHaveLength(2);
    expect(harness.objects.has('public-catalogs/ws_A/cat_atomic/portada_1.jpg')).toBe(true);
    expect(harness.objects.has('public-catalogs/ws_A/cat_atomic/770111_1.png')).toBe(true);
    // Verificar que se eliminó cualquier firebaseStorageDownloadTokens heredado
    expect(
      harness.objects.get('public-catalogs/ws_A/cat_atomic/770111_1.png')?.metadata
        .firebaseStorageDownloadTokens
    ).toBeUndefined();

    // 3. Validar helpers de snapshot en firebaseDataService (solo reescribe snapshot público, preserva inventario maestro)
    const draftCatalog: Pick<Catalog, 'coverImage' | 'logoUrl' | 'products'> = {
      coverImage: `https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0383225470.firebasestorage.app/o/${encodeURIComponent(coverSrc)}?alt=media`,
      logoUrl: undefined,
      products: [
        {
          productId: 'p1',
          orderIndex: 0,
          featured: false,
          snapshot: {
            id: 'p1',
            name: 'Producto 1',
            sku: 'SKU-1',
            ean: '7701110000011',
            price: 10000,
            currency: 'COP',
            categoryId: 'c1',
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0383225470.firebasestorage.app/o/${encodeURIComponent(prod1Src)}?alt=media`,
            active: true,
            createdAt: '2026-11-17T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
        },
      ],
    };

    const collected = collectPrivateAssetsForCatalogPromotion(draftCatalog);
    expect(collected).toEqual([
      { itemKey: 'cover', sourceStoragePath: coverSrc },
      { itemKey: 'product:0', sourceStoragePath: prod1Src },
    ]);

    const promotedView = applyPromotedPublicUrlsToCatalogSnapshot(draftCatalog, pubJson.promoted);
    expect(promotedView.coverImage).toContain('public-catalogs%2Fws_A%2Fcat_atomic%2Fportada_1.jpg');
    expect(promotedView.products[0].snapshot.imageUrl).toContain('public-catalogs%2Fws_A%2Fcat_atomic%2F770111_1.png');
    expect(hasPromotedPublicCatalogAssets(promotedView)).toBe(true);
    // El borrador original mantiene su referencia privada intacta
    expect(draftCatalog.products[0].snapshot.imageUrl).toContain('catalog-images%2Fws_A%2F770111_1.png');

    // 4. Despublicar: elimina copias en public-catalogs/{wsId}/{catId}/ SIN borrar maestras en catalog-images/ ni workspace-private/
    const unpubRes = await fetch(`${harness.baseUrl}/unpublish-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-owner-a' },
      body: JSON.stringify({ workspaceId: 'ws_A', catalogId: 'cat_atomic' }),
    });
    expect(unpubRes.status).toBe(200);
    const unpubJson = await unpubRes.json();
    expect(unpubJson.deletedCount).toBe(2);
    expect(harness.objects.has('public-catalogs/ws_A/cat_atomic/portada_1.jpg')).toBe(false);
    expect(harness.objects.has('public-catalogs/ws_A/cat_atomic/770111_1.png')).toBe(false);
    // Las imágenes maestras del inventario y portada siguen intactas
    expect(harness.objects.has(coverSrc)).toBe(true);
    expect(harness.objects.has(prod1Src)).toBe(true);
  });

  it('debe manejar Signed URLs expiradas en cliente (caché RAM con ventana de renovación y error 403 al subir PUT expirado)', async () => {
    const now = Date.now();
    expect(isCachedSignedUrlValid(undefined, now)).toBe(false);
    expect(isCachedSignedUrlValid({ signedUrl: 'https://signed.old', expiresAtMs: now - 1000 }, now)).toBe(false);
    expect(isCachedSignedUrlValid({ signedUrl: 'https://signed.soon', expiresAtMs: now + 10_000 }, now)).toBe(false);
    expect(isCachedSignedUrlValid({ signedUrl: 'https://signed.ok', expiresAtMs: now + 120_000 }, now)).toBe(true);

    // Simular módulo firebaseClient autenticado con token verificado para probar fetchImpl de imageService
    const fbClient = await import('../services/firebaseClient');
    const prevAuth = fbClient.auth;
    Object.defineProperty(fbClient, 'auth', {
      configurable: true,
      value: {
        currentUser: {
          uid: 'uid_owner_a',
          emailVerified: true,
          getIdToken: async () => 'tok-owner-a',
        },
      },
    });

    try {
      harness.objects.set('catalog-images/ws_A/exp_test.jpg', {
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        headerBytes: JPEG_HEADER,
        metadata: { workspaceid: 'ws_A' },
      });

      let brokerFetchCalls = 0;
      const instrumentedFetch: typeof fetch = async (input, init) => {
        brokerFetchCalls++;
        const url = typeof input === 'string' ? input : input.toString();
        const relativePath = url.replace(/^.*\/api\/storage/, '');
        return fetch(`${harness.baseUrl}${relativePath}`, init);
      };

      // Primera llamada: obtiene firma y la cachea en RAM
      const firstUrl = await resolvePrivateAssetUrl('catalog-images/ws_A/exp_test.jpg', 'ws_A', {
        fetchImpl: instrumentedFetch,
      });
      expect(firstUrl).toContain('X-Goog-Expires=300');
      expect(brokerFetchCalls).toBe(1);

      // Segunda llamada sin expirar: usa caché RAM (no vuelve al Broker)
      const cachedUrl = await resolvePrivateAssetUrl('catalog-images/ws_A/exp_test.jpg', 'ws_A', {
        fetchImpl: instrumentedFetch,
      });
      expect(cachedUrl).toBe(firstUrl);
      expect(brokerFetchCalls).toBe(1);

      // Si el <img> reporta error 403 por URL expirada, `forceRefresh: true` solicita firma nueva
      const refreshedUrl = await resolvePrivateAssetUrl('catalog-images/ws_A/exp_test.jpg', 'ws_A', {
        forceRefresh: true,
        fetchImpl: instrumentedFetch,
      });
      expect(refreshedUrl).toContain('X-Goog-Expires=300');
      expect(brokerFetchCalls).toBe(2);

      // Si avanza el reloj dentro de la ventana de expiración (<15s restantes), renueva automáticamente sin forceRefresh
      const realNow = Date.now();
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow + 290_000);
      try {
        harness.fixedNowMs = realNow + 290_000;
        const autoRenewedUrl = await resolvePrivateAssetUrl('catalog-images/ws_A/exp_test.jpg', 'ws_A', {
          fetchImpl: instrumentedFetch,
        });
        expect(autoRenewedUrl).toContain('X-Goog-Expires=300');
        expect(brokerFetchCalls).toBe(3);
      } finally {
        dateSpy.mockRestore();
      }

      // Subida con Signed URL PUT expirada (GCS devuelve 403)
      const expiredPutFetch: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/storage/sign-upload')) {
          return fetch(`${harness.baseUrl}/sign-upload`, init);
        }
        return new Response('<?xml version="1.0"?><Error><Code>ExpiredToken</Code></Error>', {
          status: 403,
        });
      };

      const validJpgBlob = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
      await expect(
        uploadProductImageToStorage({
          file: validJpgBlob,
          filename: '770999.jpg',
          workspaceId: 'ws_A',
          fetchImpl: expiredPutFetch,
        })
      ).rejects.toMatchObject({
        name: 'CloudOperationError',
        code: 'unauthorized',
      });
    } finally {
      Object.defineProperty(fbClient, 'auth', {
        configurable: true,
        value: prevAuth,
      });
    }
  });
});

const hasAllEmulators = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
);

describe.skipIf(!hasAllEmulators)(
  '[B] R2.3.3 — Integración End-to-End con Firebase Emulator Suite (Auth + Firestore + Storage)',
  () => {
    it('debe ejecutar ciclo completo de Broker contra Firebase Emulators reales', () => {
      expect(hasAllEmulators).toBe(true);
    });
  }
);
