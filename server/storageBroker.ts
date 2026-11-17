/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * STORAGE BROKER BACKEND — YORCATALOG (FASE R2.3.3)
 *
 * Implementa los 5 endpoints autoritativos sobre Cloud Run (Express + Firebase Admin SDK):
 * - POST   /api/storage/sign-upload
 * - POST   /api/storage/publish-assets
 * - POST   /api/storage/unpublish-assets
 * - GET    /api/storage/private-asset-url
 * - DELETE /api/storage/asset
 *
 * Invariantes de seguridad:
 * 1. Verificación estricta de ID Token con `verifyIdToken(token, true)` (chequeo de revocación).
 * 2. Verificación obligatoria de `email_verified === true`.
 * 3. Consulta en vivo de membresía y rol en la base Firestore nombrada (`owner` / `admin` / `member`),
 *    sin depender de Custom Claims para autorización principal.
 * 4. Validación de tamaño (<= 5 MB), MIME y *magic bytes* reales (solo JPEG, PNG, WebP; anti-SVG).
 * 5. Rutas determinadas exclusivamente en servidor (`catalog-images/`, `workspace-private/`, `public-catalogs/`).
 * 6. Cero Download Tokens permanentes para activos privados; solo V4 Signed URLs de corta duración.
 */

import express from 'express';
import crypto from 'node:crypto';
import type { Router, Request, Response } from 'express';
import { getFirebaseAdminContext } from './firebaseAdmin.ts';

export const MAX_BROKER_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const SIGN_UPLOAD_TTL_SECONDS = 120; // 2 minutos
export const PRIVATE_ASSET_TTL_SECONDS = 300; // 5 minutos

export const VALID_SEGMENT_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type BrokerWorkspaceRole = 'owner' | 'admin' | 'member';
export type UploadScope = 'catalog_staging' | 'workspace_private';

export interface DecodedAuthToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

export interface BrokerAuthVerifier {
  verifyIdToken(token: string, checkRevoked: boolean): Promise<DecodedAuthToken>;
}

export interface BrokerMembershipStore {
  getWorkspaceOwnerId(workspaceId: string): Promise<string | null>;
  getWorkspaceMemberRole(workspaceId: string, uid: string): Promise<BrokerWorkspaceRole | null>;
}

export interface InspectedStorageObject {
  exists: boolean;
  sizeBytes: number;
  contentType: string;
  headerBytes: Uint8Array;
  metadata?: Record<string, string>;
}

export interface BrokerStorageAdapter {
  bucketName: string;
  getSignedUploadUrl(params: {
    storagePath: string;
    contentType: string;
    expiresInSeconds: number;
    extensionHeaders: Record<string, string>;
  }): Promise<string>;
  getSignedReadUrl(params: {
    storagePath: string;
    expiresInSeconds: number;
  }): Promise<string>;
  inspectObject(storagePath: string): Promise<InspectedStorageObject>;
  copyObjectToPublic(params: {
    sourcePath: string;
    destinationPath: string;
    contentType: string;
    metadata: Record<string, string>;
  }): Promise<void>;
  deleteObject(storagePath: string): Promise<boolean>;
  listAndDeletePrefix(prefix: string): Promise<string[]>;
}

export interface StorageBrokerDeps {
  isConfigured: () => boolean;
  getConfigError: () => string | null;
  auth: BrokerAuthVerifier | null;
  membershipStore: BrokerMembershipStore | null;
  storage: BrokerStorageAdapter | null;
  nowMs?: () => number;
}

export interface AuthorizedMemberContext {
  uid: string;
  email?: string;
  workspaceId: string;
  role: BrokerWorkspaceRole;
}

export class BrokerHttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BrokerHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isValidSegment(value: unknown): value is string {
  return typeof value === 'string' && VALID_SEGMENT_REGEX.test(value);
}

/**
 * Inspecciona los *magic bytes* reales del encabezado binario.
 * Rechaza SVG, XML, HTML, scripts y cualquier binario distinto de JPEG, PNG o WebP.
 */
export function detectImageFormatFromMagicBytes(
  bytes: Uint8Array
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!bytes || bytes.length < 12) {
    return null;
  }

  // Rechazar explícitamente firmas textuales / XML / SVG / HTML / scripts
  const textSample = Buffer.from(bytes.slice(0, Math.min(bytes.length, 64)))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    textSample.startsWith('<svg') ||
    textSample.startsWith('<?xml') ||
    textSample.startsWith('<!doctype') ||
    textSample.startsWith('<html') ||
    textSample.startsWith('<script') ||
    textSample.includes('<svg')
  ) {
    return null;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function extensionMatchesMime(ext: string, mime: string): boolean {
  if (mime === 'image/jpeg') return ext === 'jpg' || ext === 'jpeg';
  if (mime === 'image/png') return ext === 'png';
  if (mime === 'image/webp') return ext === 'webp';
  return false;
}

export function validateUploadBinarySpec(params: {
  filename: unknown;
  contentType: unknown;
  sizeBytes: unknown;
  headerBytes: Uint8Array | null;
}): { filename: string; ext: string; contentType: 'image/jpeg' | 'image/png' | 'image/webp'; sizeBytes: number } {
  const { filename, contentType, sizeBytes, headerBytes } = params;

  if (typeof filename !== 'string' || !filename.trim()) {
    throw new BrokerHttpError(400, 'invalid_filename', 'El nombre de archivo es obligatorio.');
  }
  const cleanName = filename.trim();
  if (
    cleanName.includes('..') ||
    cleanName.includes('/') ||
    cleanName.includes('\\') ||
    cleanName.includes('\0')
  ) {
    throw new BrokerHttpError(400, 'invalid_filename', 'Nombre de archivo con secuencias de ruta no permitidas.');
  }

  const ext = cleanName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'svg') {
    throw new BrokerHttpError(
      415,
      'svg_rejected',
      'Por seguridad (prevención Stored XSS), los archivos SVG están estrictamente prohibidos.'
    );
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BrokerHttpError(
      415,
      'unsupported_extension',
      `Extensión .${ext || '?'} no permitida. Solo se aceptan JPG, PNG y WebP.`
    );
  }

  if (typeof contentType !== 'string' || contentType.toLowerCase().includes('svg')) {
    throw new BrokerHttpError(415, 'svg_rejected', 'Tipo MIME SVG o inválido rechazado.');
  }
  const normalizedMime = contentType.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new BrokerHttpError(
      415,
      'unsupported_mime',
      `Tipo MIME no permitido (${contentType}). Solo image/jpeg, image/png o image/webp.`
    );
  }
  if (!extensionMatchesMime(ext, normalizedMime)) {
    throw new BrokerHttpError(
      415,
      'mime_extension_mismatch',
      `La extensión .${ext} no coincide con el MIME declarado (${normalizedMime}).`
    );
  }

  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new BrokerHttpError(400, 'invalid_size', 'El archivo debe tener un tamaño mayor a 0 bytes.');
  }
  if (sizeBytes > MAX_BROKER_FILE_SIZE) {
    throw new BrokerHttpError(
      413,
      'file_too_large',
      `El archivo supera el límite máximo de 5 MB (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  if (!headerBytes || headerBytes.length < 12) {
    throw new BrokerHttpError(
      400,
      'missing_magic_bytes',
      'Se requieren al menos los primeros 12 bytes reales del archivo para validar magic bytes.'
    );
  }

  const detectedMime = detectImageFormatFromMagicBytes(headerBytes);
  if (!detectedMime) {
    throw new BrokerHttpError(
      415,
      'invalid_magic_bytes',
      'El contenido binario no corresponde a una imagen válida JPEG, PNG o WebP (SVG/binario adulterado rechazado).'
    );
  }
  if (detectedMime !== normalizedMime) {
    throw new BrokerHttpError(
      415,
      'spoofed_mime',
      `MIME falso detectado: el encabezado real es ${detectedMime}, pero se declaró ${normalizedMime}.`
    );
  }

  return {
    filename: cleanName,
    ext,
    contentType: detectedMime,
    sizeBytes,
  };
}

export function buildServerCanonicalStoragePath(params: {
  scope: UploadScope;
  workspaceId: string;
  ext: string;
  ean?: string | null;
  filename: string;
  nowMs?: number;
}): string {
  const { scope, workspaceId, ext, ean, filename } = params;
  const prefix = scope === 'workspace_private' ? 'workspace-private' : 'catalog-images';
  const rawBase =
    typeof ean === 'string' && ean.trim()
      ? ean.trim()
      : filename.replace(/\.[^.]+$/, '') || 'img';
  const cleanBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'img';
  const ts = params.nowMs ?? Date.now();
  const nonce = crypto.randomBytes(6).toString('hex');
  return `${prefix}/${workspaceId}/${cleanBase}_${ts}_${nonce}.${ext}`;
}

export function isPrivateStoragePathForWorkspace(
  storagePath: unknown,
  workspaceId: string
): storagePath is string {
  if (typeof storagePath !== 'string' || !storagePath.trim()) return false;
  if (storagePath.includes('..') || storagePath.includes('\\') || storagePath.includes('\0')) {
    return false;
  }
  const parts = storagePath.split('/');
  if (parts.length !== 3) return false;
  const [prefix, pathWorkspaceId, fileName] = parts;
  if (prefix !== 'catalog-images' && prefix !== 'workspace-private') return false;
  if (pathWorkspaceId !== workspaceId) return false;
  return /^[a-zA-Z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(fileName);
}

export function isManagedStoragePathForWorkspace(
  storagePath: unknown,
  workspaceId: string
): storagePath is string {
  if (isPrivateStoragePathForWorkspace(storagePath, workspaceId)) return true;
  if (typeof storagePath !== 'string' || !storagePath.trim()) return false;
  if (storagePath.includes('..') || storagePath.includes('\\') || storagePath.includes('\0')) {
    return false;
  }
  const parts = storagePath.split('/');
  if (parts.length !== 4) return false;
  const [prefix, pathWorkspaceId, catalogId, fileName] = parts;
  if (prefix !== 'public-catalogs') return false;
  if (pathWorkspaceId !== workspaceId) return false;
  if (!isValidSegment(catalogId)) return false;
  return /^[a-zA-Z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(fileName);
}

export function buildPublicStoragePathFromSource(
  workspaceId: string,
  catalogId: string,
  sourceStoragePath: string
): string {
  const fileName = sourceStoragePath.split('/').pop() || '';
  if (!/^[a-zA-Z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(fileName)) {
    throw new BrokerHttpError(400, 'invalid_source_path', 'Nombre de archivo de origen inválido.');
  }
  return `public-catalogs/${workspaceId}/${catalogId}/${fileName}`;
}

export function buildPublicFirebaseMediaUrl(bucketName: string, publicStoragePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(publicStoragePath)}?alt=media`;
}

function classifyTokenVerificationError(error: unknown): BrokerHttpError {
  const code = ((error as { code?: string })?.code || '').toLowerCase();
  if (code.includes('id-token-revoked')) {
    return new BrokerHttpError(
      401,
      'token_revoked',
      'Tu sesión o token de autorización fue revocado. Inicia sesión nuevamente.'
    );
  }
  if (code.includes('id-token-expired') || code.includes('user-disabled')) {
    return new BrokerHttpError(
      401,
      'token_expired',
      'Tu token de sesión ha expirado o la cuenta está deshabilitada.'
    );
  }
  return new BrokerHttpError(
    401,
    'invalid_token',
    'Token de Firebase Authentication inválido o malformado.'
  );
}

export async function authorizeWorkspaceMember(
  req: Request,
  deps: StorageBrokerDeps,
  workspaceId: unknown,
  allowedRoles: readonly BrokerWorkspaceRole[]
): Promise<AuthorizedMemberContext> {
  if (!deps.isConfigured() || !deps.auth || !deps.membershipStore || !deps.storage) {
    throw new BrokerHttpError(
      503,
      'broker_not_configured',
      deps.getConfigError() || 'El Storage Broker no está configurado en el servidor.'
    );
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new BrokerHttpError(
      401,
      'missing_bearer_token',
      'Se requiere encabezado Authorization: Bearer <Firebase ID Token>.'
    );
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new BrokerHttpError(401, 'missing_bearer_token', 'El token Bearer está vacío.');
  }

  let decoded: DecodedAuthToken;
  try {
    // CRITICAL: checkRevoked = true cierra ventana de tokens cacheados tras revokeRefreshTokens()
    decoded = await deps.auth.verifyIdToken(idToken, true);
  } catch (err) {
    throw classifyTokenVerificationError(err);
  }

  if (decoded.email_verified !== true) {
    throw new BrokerHttpError(
      403,
      'email_not_verified',
      'Debes verificar tu correo electrónico en Firebase Auth antes de usar el Storage Broker.'
    );
  }

  if (!isValidSegment(workspaceId)) {
    throw new BrokerHttpError(400, 'invalid_workspace_id', 'El workspaceId proporcionado es inválido.');
  }

  const [wsOwnerId, memberRole] = await Promise.all([
    deps.membershipStore.getWorkspaceOwnerId(workspaceId),
    deps.membershipStore.getWorkspaceMemberRole(workspaceId, decoded.uid),
  ]);

  if (!wsOwnerId) {
    throw new BrokerHttpError(
      403,
      'workspace_access_denied',
      'No tienes membresía activa en este workspace.'
    );
  }

  let effectiveRole: BrokerWorkspaceRole | null = memberRole;
  if (!effectiveRole && wsOwnerId === decoded.uid) {
    effectiveRole = 'owner';
  }

  if (!effectiveRole) {
    throw new BrokerHttpError(
      403,
      'not_workspace_member',
      'Tu cuenta no pertenece actualmente a este workspace o fue removida.'
    );
  }

  if (!allowedRoles.includes(effectiveRole)) {
    throw new BrokerHttpError(
      403,
      'insufficient_role',
      `Tu rol actual (${effectiveRole}) no tiene permisos para realizar esta operación en Storage.`
    );
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    workspaceId,
    role: effectiveRole,
  };
}

function sendErrorResponse(res: Response, error: unknown): void {
  if (error instanceof BrokerHttpError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  const msg = error instanceof Error ? error.message : String(error);
  const statusHint = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;
  if (statusHint === 404 || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
    res.status(404).json({
      error: 'El bucket o archivo solicitado no existe en Firebase Storage.',
      code: 'storage_not_found',
    });
    return;
  }

  res.status(500).json({
    error: 'Error interno en el Storage Broker.',
    code: 'broker_internal_error',
    details: { message: msg },
  });
}

export function createAdminBrokerDeps(): StorageBrokerDeps {
  return {
    isConfigured: () => getFirebaseAdminContext().configured,
    getConfigError: () => getFirebaseAdminContext().configError,
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.auth) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Auth no disponible');
        }
        const decoded = await ctx.auth.verifyIdToken(token, checkRevoked);
        return {
          uid: decoded.uid,
          email: decoded.email,
          email_verified: decoded.email_verified,
        };
      },
    },
    membershipStore: {
      getWorkspaceOwnerId: async (workspaceId: string) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.db) return null;
        const snap = await ctx.db.collection('workspaces').doc(workspaceId).get();
        if (!snap.exists) return null;
        const ownerId = snap.data()?.ownerId;
        return typeof ownerId === 'string' ? ownerId : null;
      },
      getWorkspaceMemberRole: async (workspaceId: string, uid: string) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.db) return null;
        const snap = await ctx.db
          .collection('workspaces')
          .doc(workspaceId)
          .collection('members')
          .doc(uid)
          .get();
        if (!snap.exists) return null;
        const role = snap.data()?.role;
        if (role === 'owner' || role === 'admin' || role === 'member') {
          return role;
        }
        return null;
      },
    },
    storage: {
      get bucketName() {
        return getFirebaseAdminContext().config.storageBucket;
      },
      getSignedUploadUrl: async ({ storagePath, contentType, expiresInSeconds, extensionHeaders }) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const file = bucket.file(storagePath);
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + expiresInSeconds * 1000,
          contentType,
          extensionHeaders,
        });
        return url;
      },
      getSignedReadUrl: async ({ storagePath, expiresInSeconds }) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const file = bucket.file(storagePath);
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expiresInSeconds * 1000,
        });
        return url;
      },
      inspectObject: async (storagePath: string) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) {
          return {
            exists: false,
            sizeBytes: 0,
            contentType: '',
            headerBytes: new Uint8Array(0),
          };
        }
        const [metadata] = await file.getMetadata();
        const [headerBuffer] = await file.download({ start: 0, end: 63 });
        const customMeta: Record<string, string> = {};
        if (metadata.metadata) {
          for (const [k, v] of Object.entries(metadata.metadata)) {
            if (typeof v === 'string') customMeta[k] = v;
          }
        }
        return {
          exists: true,
          sizeBytes: Number(metadata.size || 0),
          contentType: String(metadata.contentType || ''),
          headerBytes: new Uint8Array(headerBuffer),
          metadata: customMeta,
        };
      },
      copyObjectToPublic: async ({ sourcePath, destinationPath, contentType, metadata }) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const srcFile = bucket.file(sourcePath);
        const destFile = bucket.file(destinationPath);
        await srcFile.copy(destFile);
        // Asegurar metadatos limpios sin firebaseStorageDownloadTokens
        await destFile.setMetadata({
          contentType,
          cacheControl: 'public,max-age=3600',
          metadata: {
            ...metadata,
            firebaseStorageDownloadTokens: null,
          },
        });
      },
      deleteObject: async (storagePath: string) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) return false;
        await file.delete({ ignoreNotFound: true });
        return true;
      },
      listAndDeletePrefix: async (prefix: string) => {
        const ctx = getFirebaseAdminContext();
        if (!ctx.storage) {
          throw new BrokerHttpError(503, 'broker_not_configured', ctx.configError || 'Storage no disponible');
        }
        const bucket = ctx.storage.bucket(ctx.config.storageBucket);
        const [files] = await bucket.getFiles({ prefix });
        const deleted: string[] = [];
        for (const f of files) {
          await f.delete({ ignoreNotFound: true });
          deleted.push(f.name);
        }
        return deleted;
      },
    },
  };
}

export function createStorageBrokerRouter(customDeps?: StorageBrokerDeps): Router {
  const router = express.Router();
  const deps = customDeps ?? createAdminBrokerDeps();
  const nowMs = () => (deps.nowMs ? deps.nowMs() : Date.now());

  // 1. POST /api/storage/sign-upload
  router.post('/sign-upload', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        workspaceId?: unknown;
        scope?: unknown;
        filename?: unknown;
        contentType?: unknown;
        sizeBytes?: unknown;
        ean?: unknown;
        fileHeaderBase64?: unknown;
      };

      const scope: UploadScope =
        body.scope === 'workspace_private' ? 'workspace_private' : 'catalog_staging';

      if (
        body.scope !== undefined &&
        body.scope !== 'catalog_staging' &&
        body.scope !== 'workspace_private'
      ) {
        throw new BrokerHttpError(
          403,
          'forbidden_upload_scope',
          'Los clientes no pueden subir directamente a rutas públicas ni arbitrarias.'
        );
      }

      const allowedRoles: readonly BrokerWorkspaceRole[] =
        scope === 'workspace_private' ? ['owner', 'admin'] : ['owner', 'admin', 'member'];

      const authCtx = await authorizeWorkspaceMember(req, deps, body.workspaceId, allowedRoles);

      let headerBytes: Uint8Array | null = null;
      if (typeof body.fileHeaderBase64 === 'string' && body.fileHeaderBase64.trim()) {
        headerBytes = new Uint8Array(Buffer.from(body.fileHeaderBase64.trim(), 'base64'));
      }

      const validated = validateUploadBinarySpec({
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        headerBytes,
      });

      const storagePath = buildServerCanonicalStoragePath({
        scope,
        workspaceId: authCtx.workspaceId,
        ext: validated.ext,
        ean: typeof body.ean === 'string' ? body.ean : null,
        filename: validated.filename,
        nowMs: nowMs(),
      });

      const extensionHeaders: Record<string, string> = {
        'x-goog-content-length-range': `1,${MAX_BROKER_FILE_SIZE}`,
        'x-goog-meta-workspaceid': authCtx.workspaceId,
        'x-goog-meta-uploadedby': authCtx.uid,
        'x-goog-meta-visibility': scope,
      };

      const uploadUrl = await deps.storage!.getSignedUploadUrl({
        storagePath,
        contentType: validated.contentType,
        expiresInSeconds: SIGN_UPLOAD_TTL_SECONDS,
        extensionHeaders,
      });

      const expiresAt = new Date(nowMs() + SIGN_UPLOAD_TTL_SECONDS * 1000).toISOString();

      res.status(200).json({
        storagePath,
        canonicalMediaUrl: buildPublicFirebaseMediaUrl(deps.storage!.bucketName, storagePath),
        uploadUrl,
        requiredHeaders: {
          'Content-Type': validated.contentType,
          ...extensionHeaders,
        },
        ttlSeconds: SIGN_UPLOAD_TTL_SECONDS,
        expiresAt,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  });

  // 2. GET /api/storage/private-asset-url
  router.get('/private-asset-url', async (req: Request, res: Response) => {
    try {
      const workspaceId = req.query.workspaceId;
      const storagePath = req.query.storagePath;

      const authCtx = await authorizeWorkspaceMember(req, deps, workspaceId, [
        'owner',
        'admin',
        'member',
      ]);

      if (!isPrivateStoragePathForWorkspace(storagePath, authCtx.workspaceId)) {
        throw new BrokerHttpError(
          403,
          'cross_tenant_or_invalid_path',
          'Ruta privada inválida o perteneciente a otro workspace.'
        );
      }

      const inspected = await deps.storage!.inspectObject(storagePath);
      if (!inspected.exists) {
        throw new BrokerHttpError(404, 'asset_not_found', 'El activo privado no existe en Storage.');
      }

      if (
        inspected.metadata?.workspaceid &&
        inspected.metadata.workspaceid !== authCtx.workspaceId
      ) {
        throw new BrokerHttpError(
          403,
          'workspace_metadata_mismatch',
          'Los metadatos del objeto no coinciden con el workspace autorizado.'
        );
      }
      if (
        inspected.metadata?.workspaceId &&
        inspected.metadata.workspaceId !== authCtx.workspaceId
      ) {
        throw new BrokerHttpError(
          403,
          'workspace_metadata_mismatch',
          'Los metadatos del objeto no coinciden con el workspace autorizado.'
        );
      }

      const signedUrl = await deps.storage!.getSignedReadUrl({
        storagePath,
        expiresInSeconds: PRIVATE_ASSET_TTL_SECONDS,
      });

      res.status(200).json({
        signedUrl,
        storagePath,
        ttlSeconds: PRIVATE_ASSET_TTL_SECONDS,
        expiresAt: new Date(nowMs() + PRIVATE_ASSET_TTL_SECONDS * 1000).toISOString(),
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  });

  // 3. POST /api/storage/publish-assets
  router.post('/publish-assets', async (req: Request, res: Response) => {
    const copiedPublicPaths: string[] = [];
    try {
      const body = (req.body || {}) as {
        workspaceId?: unknown;
        catalogId?: unknown;
        assets?: Array<{ itemKey?: unknown; sourceStoragePath?: unknown }>;
      };

      const authCtx = await authorizeWorkspaceMember(req, deps, body.workspaceId, ['owner', 'admin']);

      if (!isValidSegment(body.catalogId)) {
        throw new BrokerHttpError(400, 'invalid_catalog_id', 'El catalogId proporcionado es inválido.');
      }
      const catalogId = body.catalogId;

      const rawAssets = Array.isArray(body.assets) ? body.assets : [];
      if (rawAssets.length > 350) {
        throw new BrokerHttpError(400, 'too_many_assets', 'El lote supera el límite permitido de activos.');
      }

      // Validar rutas antes de iniciar copias
      const validatedAssets: Array<{
        itemKey: string;
        sourceStoragePath: string;
        destinationPath: string;
      }> = [];

      for (const item of rawAssets) {
        if (typeof item?.itemKey !== 'string' || !item.itemKey.trim()) {
          throw new BrokerHttpError(400, 'invalid_asset_entry', 'Cada activo debe incluir itemKey.');
        }
        if (!isPrivateStoragePathForWorkspace(item.sourceStoragePath, authCtx.workspaceId)) {
          throw new BrokerHttpError(
            403,
            'cross_tenant_source_path',
            `Acceso denegado: la ruta de origen "${String(item.sourceStoragePath || '')}" no pertenece al workspace autorizado.`
          );
        }

        validatedAssets.push({
          itemKey: item.itemKey.trim(),
          sourceStoragePath: item.sourceStoragePath,
          destinationPath: buildPublicStoragePathFromSource(
            authCtx.workspaceId,
            catalogId,
            item.sourceStoragePath
          ),
        });
      }

      const promoted: Array<{
        itemKey: string;
        sourceStoragePath: string;
        publicStoragePath: string;
        publicUrl: string;
      }> = [];

      for (const entry of validatedAssets) {
        const inspected = await deps.storage!.inspectObject(entry.sourceStoragePath);
        if (!inspected.exists) {
          throw new BrokerHttpError(
            422,
            'source_asset_missing',
            `No se encontró la imagen privada de origen (${entry.sourceStoragePath}) para promover el catálogo.`,
            { failedItemKey: entry.itemKey }
          );
        }

        const ext = entry.sourceStoragePath.split('.').pop()?.toLowerCase() || '';
        const verified = validateUploadBinarySpec({
          filename: entry.sourceStoragePath.split('/').pop() || '',
          contentType: inspected.contentType,
          sizeBytes: inspected.sizeBytes,
          headerBytes: inspected.headerBytes,
        });

        await deps.storage!.copyObjectToPublic({
          sourcePath: entry.sourceStoragePath,
          destinationPath: entry.destinationPath,
          contentType: verified.contentType,
          metadata: {
            workspaceId: authCtx.workspaceId,
            catalogId,
            promotedBy: authCtx.uid,
            sourceStoragePath: entry.sourceStoragePath,
            visibility: 'public_published',
            extension: ext,
          },
        });

        copiedPublicPaths.push(entry.destinationPath);
        promoted.push({
          itemKey: entry.itemKey,
          sourceStoragePath: entry.sourceStoragePath,
          publicStoragePath: entry.destinationPath,
          publicUrl: buildPublicFirebaseMediaUrl(deps.storage!.bucketName, entry.destinationPath),
        });
      }

      res.status(200).json({
        workspaceId: authCtx.workspaceId,
        catalogId,
        promoted,
      });
    } catch (error) {
      // Consistencia: si falla parcialmente la promoción, revertir objetos copiados en este ciclo
      for (const copiedPath of copiedPublicPaths) {
        await deps.storage?.deleteObject(copiedPath).catch(() => undefined);
      }
      if (error instanceof BrokerHttpError && copiedPublicPaths.length > 0) {
        sendErrorResponse(
          res,
          new BrokerHttpError(error.status, error.code, error.message, {
            ...(error.details || {}),
            rolledBackCount: copiedPublicPaths.length,
          })
        );
        return;
      }
      sendErrorResponse(res, error);
    }
  });

  // 4. POST /api/storage/unpublish-assets
  router.post('/unpublish-assets', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        workspaceId?: unknown;
        catalogId?: unknown;
      };

      const authCtx = await authorizeWorkspaceMember(req, deps, body.workspaceId, ['owner', 'admin']);

      if (!isValidSegment(body.catalogId)) {
        throw new BrokerHttpError(400, 'invalid_catalog_id', 'El catalogId proporcionado es inválido.');
      }

      // ÚNICAMENTE elimina la copia pública del catálogo; NUNCA toca catalog-images/{wsId}/ ni workspace-private/{wsId}/
      const publicPrefix = `public-catalogs/${authCtx.workspaceId}/${body.catalogId}/`;
      const deletedPaths = await deps.storage!.listAndDeletePrefix(publicPrefix);

      res.status(200).json({
        workspaceId: authCtx.workspaceId,
        catalogId: body.catalogId,
        deletedCount: deletedPaths.length,
        deletedPaths,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  });

  // 5. DELETE /api/storage/asset
  router.delete('/asset', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { workspaceId?: unknown; storagePath?: unknown };
      const workspaceId = body.workspaceId ?? req.query.workspaceId;
      const storagePath = body.storagePath ?? req.query.storagePath;

      const authCtx = await authorizeWorkspaceMember(req, deps, workspaceId, ['owner', 'admin']);

      if (!isManagedStoragePathForWorkspace(storagePath, authCtx.workspaceId)) {
        throw new BrokerHttpError(
          403,
          'cross_tenant_or_invalid_path',
          'No está permitido eliminar activos fuera del workspace autorizado.'
        );
      }

      const deleted = await deps.storage!.deleteObject(storagePath);
      if (!deleted) {
        throw new BrokerHttpError(404, 'asset_not_found', 'El archivo indicado no existe en Storage.');
      }

      res.status(200).json({
        deleted: true,
        workspaceId: authCtx.workspaceId,
        storagePath,
      });
    } catch (error) {
      sendErrorResponse(res, error);
    }
  });

  return router;
}
