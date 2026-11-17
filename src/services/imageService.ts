/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVICIO DE PROCESAMIENTO, ALMACENAMIENTO Y ASOCIACIÓN DE IMÁGENES POR EAN (FASE R2.3.3)
 * Implementa:
 * 1. Nombres de archivo por EAN (directo y normalizado).
 * 2. Carga múltiple o archivo ZIP (con protección contra zip bombs y sanitización de rutas).
 * 3. Restricción estricta a formatos rasterizados seguros (JPG, PNG, WebP) eliminando SVG XSS.
 * 4. Integración con Storage Broker Backend (`/api/storage/*`):
 *    - `POST /api/storage/sign-upload` + subida PUT por Signed URL V4 (sin Download Tokens privados).
 *    - `GET /api/storage/private-asset-url` con caché únicamente en memoria RAM y expiración automática.
 *    - `POST /api/storage/publish-assets` y `POST /api/storage/unpublish-assets` para ciclo de vida público.
 *    - `DELETE /api/storage/asset` para eliminación autorizada por owner/admin.
 * 5. Política Cloud-Only: rechaza con CloudOperationError si Auth/Broker/Storage no están operativos.
 */

import JSZip from 'jszip';
import {
  auth,
  firebaseConfig,
  isFirebaseConfigured,
  CloudOperationError,
  CloudConnectionCode,
} from './firebaseClient';
import { CandidateImage, Product } from '../types';

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por imagen
export const MAX_ZIP_FILES = 200;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB límite de seguridad total

export const STORAGE_PREFIXES = {
  privateCatalogStaging: 'catalog-images',
  privateWorkspace: 'workspace-private',
  publicPublished: 'public-catalogs',
} as const;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: {
  name: string;
  size: number;
  type?: string;
}): ImageValidationResult {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'svg' || file.type === 'image/svg+xml') {
    return {
      valid: false,
      error:
        'Por seguridad, el formato SVG no está permitido para evitar inyección de scripts (XSS). Utilice formatos rasterizados como JPG, PNG o WebP.',
    };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Formato de imagen no admitido (.${ext}). Solo se admiten archivos JPG, PNG y WebP.`,
    };
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `La imagen supera el tamaño máximo permitido de 5 MB (${sizeMb} MB).`,
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Tipo MIME no admitido (${file.type}). Se requieren imágenes rasterizadas válidas.`,
    };
  }

  return { valid: true };
}

export function extractEanFromFilename(filename: string): {
  ean: string | null;
  cleanName: string;
} {
  const baseName = filename.split('/').pop()?.split('\\').pop() || filename;
  const lastDot = baseName.lastIndexOf('.');
  const cleanName = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;

  const match = cleanName.match(/(?:^|[^0-9])([0-9]{8,14})(?:[^0-9]|$)/);
  if (match && match[1]) {
    return { ean: match[1], cleanName };
  }

  return { ean: null, cleanName };
}

export async function processImageFile(file: File): Promise<CandidateImage | null> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    console.warn(`Archivo descartado (${file.name}): ${validation.error}`);
    return null;
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const { ean, cleanName } = extractEanFromFilename(file.name);
  const dataUrl = await fileToDataUrl(file);

  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename: file.name,
    cleanName,
    extension: ext,
    eanExtracted: ean,
    dataUrl,
    sizeBytes: file.size,
    matchStatus: ean ? 'pending_review' : 'invalid_image',
    fileBlob: file,
  };
}

export async function extractImagesFromZip(zipFile: File): Promise<CandidateImage[]> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const candidates: CandidateImage[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
    if (
      zipEntry.dir ||
      relativePath.includes('..') ||
      relativePath.startsWith('/') ||
      relativePath.includes('\\')
    ) {
      continue;
    }

    fileCount++;
    if (fileCount > MAX_ZIP_FILES) {
      throw new Error(
        `El archivo ZIP contiene más de ${MAX_ZIP_FILES} archivos (límite de seguridad alcanzado).`
      );
    }

    const ext = relativePath.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      continue;
    }

    const blob = await zipEntry.async('blob');
    totalBytes += blob.size;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(`El tamaño total descomprimido supera el límite seguro de 50MB.`);
    }

    if (blob.size > MAX_IMAGE_FILE_SIZE) {
      continue;
    }

    const { ean, cleanName } = extractEanFromFilename(relativePath);
    const dataUrl = await blobToDataUrl(blob);

    candidates.push({
      id: `zip-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filename: relativePath.split('/').pop() || relativePath,
      cleanName,
      extension: ext,
      eanExtracted: ean,
      dataUrl,
      sizeBytes: blob.size,
      matchStatus: ean ? 'pending_review' : 'invalid_image',
      fileBlob: blob,
    });
  }

  return candidates;
}

export function matchImagesWithProducts(
  candidates: CandidateImage[],
  products: Product[]
): CandidateImage[] {
  const productsByEan = new Map<string, Product[]>();
  for (const p of products) {
    if (p.ean) {
      const eanKey = p.ean.trim();
      const list = productsByEan.get(eanKey) || [];
      list.push(p);
      productsByEan.set(eanKey, list);
    }
  }

  return candidates.map((cand) => {
    if (!cand.eanExtracted) {
      return {
        ...cand,
        matchStatus: 'invalid_image',
      };
    }

    const matchedProducts = productsByEan.get(cand.eanExtracted);
    if (!matchedProducts || matchedProducts.length === 0) {
      return {
        ...cand,
        matchStatus: 'no_image',
      };
    }

    if (matchedProducts.length === 1) {
      return {
        ...cand,
        matchedProductId: matchedProducts[0].id,
        matchStatus: 'exact_match',
      };
    }

    return {
      ...cand,
      matchStatus: 'pending_review',
      ambiguousMatches: matchedProducts.map((p) => p.id),
    };
  });
}

export function buildSafeStoragePath(
  workspaceId: string,
  filename: string,
  ean?: string | null
): string {
  const safeWorkspaceId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '');
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : 'png';

  const rawBase = ean ? ean.trim() : filename.split('/').pop()?.split('\\').pop() || 'img';
  const cleanBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

  const timestamp = Date.now();
  const randomNonce = Math.random().toString(36).substring(2, 8);

  return `${safeWorkspaceId}/${cleanBase}_${timestamp}_${randomNonce}.${safeExt}`;
}

export function buildPrivateAssetStoragePath(
  workspaceId: string,
  filename: string,
  ean?: string | null
): string {
  return `${STORAGE_PREFIXES.privateCatalogStaging}/${buildSafeStoragePath(workspaceId, filename, ean)}`;
}

export function buildWorkspacePrivateAssetPath(
  workspaceId: string,
  filename: string
): string {
  return `${STORAGE_PREFIXES.privateWorkspace}/${buildSafeStoragePath(workspaceId, filename)}`;
}

export function buildPublicCatalogStoragePath(
  workspaceId: string,
  catalogId: string,
  filename: string,
  ean?: string | null
): string {
  const safeCatalogId = catalogId.replace(/[^a-zA-Z0-9_-]/g, '') || 'catalog';
  const safeRelative = buildSafeStoragePath(workspaceId, filename, ean);
  const [safeWorkspaceId, fileSegment] = safeRelative.split('/');
  return `${STORAGE_PREFIXES.publicPublished}/${safeWorkspaceId}/${safeCatalogId}/${fileSegment}`;
}

export function isManagedStoragePath(storagePath: string): boolean {
  if (!storagePath || storagePath.includes('..') || storagePath.includes('\\')) {
    return false;
  }
  return (
    storagePath.startsWith(`${STORAGE_PREFIXES.privateCatalogStaging}/`) ||
    storagePath.startsWith(`${STORAGE_PREFIXES.privateWorkspace}/`) ||
    storagePath.startsWith(`${STORAGE_PREFIXES.publicPublished}/`)
  );
}

export function extractManagedStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return null;

  if (trimmed.startsWith('storage://')) {
    const candidate = trimmed.slice('storage://'.length);
    return isManagedStoragePath(candidate) ? candidate : null;
  }

  if (isManagedStoragePath(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const marker = '/o/';
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) {
        const encodedObj = parsed.pathname.slice(idx + marker.length);
        const decoded = decodeURIComponent(encodedObj);
        return isManagedStoragePath(decoded) ? decoded : null;
      }
    }
  } catch {
    // No es URL válida
  }

  return null;
}

export function isPrivateManagedAsset(urlOrPath: string | null | undefined): boolean {
  const storagePath = extractManagedStoragePath(urlOrPath);
  if (!storagePath) return false;
  return (
    storagePath.startsWith(`${STORAGE_PREFIXES.privateCatalogStaging}/`) ||
    storagePath.startsWith(`${STORAGE_PREFIXES.privateWorkspace}/`)
  );
}

export function isPublicCatalogAsset(urlOrPath: string | null | undefined): boolean {
  const storagePath = extractManagedStoragePath(urlOrPath);
  if (!storagePath) return false;
  return storagePath.startsWith(`${STORAGE_PREFIXES.publicPublished}/`);
}

function getBrokerBaseUrl(): string {
  const envBase =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_STORAGE_BROKER_BASE_URL
      : undefined;
  return (envBase || '').trim().replace(/\/+$/, '');
}

function buildBrokerUrl(endpointPath: string): string {
  const base = getBrokerBaseUrl();
  return `${base}${endpointPath}`;
}

function mapBrokerStatusToCloudCode(status: number, bodyCode?: string): CloudConnectionCode {
  if (status === 401 || bodyCode === 'token_revoked' || bodyCode === 'token_expired') {
    return 'session_expired';
  }
  if (status === 403) {
    return 'unauthorized';
  }
  if (status === 503 || status === 404 || bodyCode === 'broker_not_configured' || bodyCode === 'storage_not_found') {
    return 'not_configured';
  }
  return 'persistence_error';
}

async function requireVerifiedIdToken(): Promise<{ token: string; uid: string }> {
  if (!isFirebaseConfigured()) {
    throw new CloudOperationError(
      'not_configured',
      'Firebase no está configurado. YorCatalog opera exclusivamente en la nube (Cloud-Only).'
    );
  }
  if (!auth?.currentUser) {
    throw new CloudOperationError(
      'session_expired',
      'Debes iniciar sesión en Firebase Auth para operar con activos en Storage.'
    );
  }
  if (!auth.currentUser.emailVerified) {
    throw new CloudOperationError(
      'unauthorized',
      'Verifica tu correo electrónico en Firebase Auth antes de operar con Storage.'
    );
  }
  const token = await auth.currentUser.getIdToken();
  return { token, uid: auth.currentUser.uid };
}

async function readFileHeaderBase64(file: Blob, maxBytes = 64): Promise<string> {
  const slice = file.slice(0, maxBytes);
  const arrayBuf = await slice.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Caché estrictamente en memoria RAM (cero localStorage / sessionStorage / IndexedDB)
interface CachedSignedUrlEntry {
  signedUrl: string;
  expiresAtMs: number;
}
const privateSignedUrlCache = new Map<string, CachedSignedUrlEntry>();

export function clearPrivateAssetUrlCache(): void {
  privateSignedUrlCache.clear();
}

export function isCachedSignedUrlValid(entry: CachedSignedUrlEntry | undefined, nowMs = Date.now()): boolean {
  if (!entry) return false;
  // Renovar 15s antes del vencimiento real para evitar errores 403 por reloj/latencia
  return entry.expiresAtMs - 15_000 > nowMs;
}

export async function resolvePrivateAssetUrl(
  urlOrPath: string,
  workspaceId?: string,
  options?: { forceRefresh?: boolean; fetchImpl?: typeof fetch }
): Promise<string> {
  if (!urlOrPath) return urlOrPath;
  if (!isPrivateManagedAsset(urlOrPath)) {
    return urlOrPath;
  }

  const storagePath = extractManagedStoragePath(urlOrPath);
  if (!storagePath) return urlOrPath;

  const targetWorkspaceId = workspaceId || storagePath.split('/')[1] || '';
  if (!targetWorkspaceId) {
    throw new CloudOperationError(
      'unauthorized',
      'Se requiere workspaceId para resolver la URL firmada del activo privado.'
    );
  }

  const cacheKey = `${targetWorkspaceId}:${storagePath}`;
  if (!options?.forceRefresh) {
    const cached = privateSignedUrlCache.get(cacheKey);
    if (isCachedSignedUrlValid(cached)) {
      return cached!.signedUrl;
    }
  }

  const { token } = await requireVerifiedIdToken();
  const fetchFn = options?.fetchImpl ?? fetch;
  const query = new URLSearchParams({
    workspaceId: targetWorkspaceId,
    storagePath,
  });

  let response: Response;
  try {
    response = await fetchFn(buildBrokerUrl(`/api/storage/private-asset-url?${query.toString()}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'No se pudo contactar al Storage Broker para firmar la lectura del activo privado.',
      { path: storagePath, originalError: err }
    );
  }

  const data = (await response.json().catch(() => ({}))) as {
    signedUrl?: string;
    expiresAt?: string;
    ttlSeconds?: number;
    error?: string;
    code?: string;
  };

  if (!response.ok || !data.signedUrl) {
    throw new CloudOperationError(
      mapBrokerStatusToCloudCode(response.status, data.code),
      data.error || 'El Storage Broker rechazó la lectura del activo privado.',
      { path: storagePath }
    );
  }

  const expiresAtMs = data.expiresAt
    ? Date.parse(data.expiresAt)
    : Date.now() + (data.ttlSeconds || 300) * 1000;

  privateSignedUrlCache.set(cacheKey, {
    signedUrl: data.signedUrl,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 240_000,
  });

  return data.signedUrl;
}

export interface UploadImageToStorageOptions {
  file: File | Blob;
  filename: string;
  workspaceId: string;
  ean?: string | null;
  scope?: 'catalog_staging' | 'workspace_private';
  fetchImpl?: typeof fetch;
}

export interface StorageUploadOutcome {
  publicUrl: string;
  storagePath: string;
  isLocal: boolean;
  sizeBytes: number;
  isPrivate: boolean;
}

/**
 * Sube una imagen a Firebase Storage exclusivamente a través del Storage Broker:
 * 1. Solicita Signed URL V4 a `POST /api/storage/sign-upload` enviando encabezado para validar magic bytes.
 * 2. Ejecuta PUT directo a GCS/Storage usando la Signed URL V4 de vida corta (sin Download Tokens permanentes).
 */
export async function uploadProductImageToStorage(
  options: UploadImageToStorageOptions
): Promise<StorageUploadOutcome> {
  const { file, filename, workspaceId, ean, scope = 'catalog_staging', fetchImpl } = options;

  const validation = validateImageFile({
    name: filename,
    size: file.size,
    type: file.type,
  });

  if (!validation.valid) {
    throw new CloudOperationError(
      'persistence_error',
      validation.error || 'Archivo de imagen rechazado por validación.'
    );
  }

  if (!isFirebaseConfigured()) {
    throw new CloudOperationError(
      'not_configured',
      'Firebase Storage no está configurado. YorCatalog opera exclusivamente en la nube (Cloud-Only).'
    );
  }

  if (!workspaceId) {
    throw new CloudOperationError(
      'unauthorized',
      'Se requiere un identificador de workspace válido para almacenar imágenes en la nube.'
    );
  }

  const { token } = await requireVerifiedIdToken();
  const fetchFn = fetchImpl ?? fetch;
  const fileHeaderBase64 = await readFileHeaderBase64(file, 64);

  let signRes: Response;
  try {
    signRes = await fetchFn(buildBrokerUrl('/api/storage/sign-upload'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId,
        scope,
        filename,
        contentType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        ean: ean || undefined,
        fileHeaderBase64,
      }),
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'No se pudo contactar al Storage Broker para firmar la subida de la imagen.',
      { originalError: err }
    );
  }

  const signPayload = (await signRes.json().catch(() => ({}))) as {
    uploadUrl?: string;
    storagePath?: string;
    canonicalMediaUrl?: string;
    requiredHeaders?: Record<string, string>;
    error?: string;
    code?: string;
  };

  if (!signRes.ok || !signPayload.uploadUrl || !signPayload.storagePath) {
    throw new CloudOperationError(
      mapBrokerStatusToCloudCode(signRes.status, signPayload.code),
      signPayload.error || 'El Storage Broker rechazó la solicitud de firma de subida.'
    );
  }

  let putRes: Response;
  try {
    putRes = await fetchFn(signPayload.uploadUrl, {
      method: 'PUT',
      headers: signPayload.requiredHeaders || {
        'Content-Type': file.type || 'image/jpeg',
      },
      body: file,
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'La transferencia binaria hacia Firebase Storage falló o se interrumpió.',
      { path: signPayload.storagePath, originalError: err }
    );
  }

  if (!putRes.ok) {
    const code: CloudConnectionCode =
      putRes.status === 403
        ? 'unauthorized'
        : putRes.status === 404
          ? 'not_configured'
          : 'persistence_error';
    throw new CloudOperationError(
      code,
      `Firebase Storage rechazó la subida firmada (HTTP ${putRes.status}). Verifica si el bucket está inicializado y CORS configurado o si la URL firmada expiró.`,
      { path: signPayload.storagePath }
    );
  }

  const canonicalUrl =
    signPayload.canonicalMediaUrl ||
    `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(signPayload.storagePath)}?alt=media`;

  return {
    publicUrl: canonicalUrl,
    storagePath: signPayload.storagePath,
    isLocal: false,
    sizeBytes: file.size,
    isPrivate: true,
  };
}

export interface PromoteAssetInput {
  itemKey: string;
  sourceStoragePath: string;
}

export interface PromotedAssetOutput {
  itemKey: string;
  sourceStoragePath: string;
  publicStoragePath: string;
  publicUrl: string;
}

export async function promoteCatalogAssetsViaBroker(params: {
  workspaceId: string;
  catalogId: string;
  assets: PromoteAssetInput[];
  fetchImpl?: typeof fetch;
}): Promise<PromotedAssetOutput[]> {
  if (params.assets.length === 0) return [];

  const { token } = await requireVerifiedIdToken();
  const fetchFn = params.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(buildBrokerUrl('/api/storage/publish-assets'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        catalogId: params.catalogId,
        assets: params.assets,
      }),
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'No se pudo contactar al Storage Broker para promover las imágenes públicas del catálogo.',
      { originalError: err }
    );
  }

  const payload = (await res.json().catch(() => ({}))) as {
    promoted?: PromotedAssetOutput[];
    error?: string;
    code?: string;
  };

  if (!res.ok || !Array.isArray(payload.promoted)) {
    throw new CloudOperationError(
      mapBrokerStatusToCloudCode(res.status, payload.code),
      payload.error || 'Falló la promoción de imágenes públicas del catálogo en el Storage Broker.'
    );
  }

  return payload.promoted;
}

export async function unpublishCatalogAssetsViaBroker(params: {
  workspaceId: string;
  catalogId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const { token } = await requireVerifiedIdToken();
  const fetchFn = params.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(buildBrokerUrl('/api/storage/unpublish-assets'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        catalogId: params.catalogId,
      }),
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'No se pudo contactar al Storage Broker para limpiar las imágenes públicas del catálogo.',
      { originalError: err }
    );
  }

  const payload = (await res.json().catch(() => ({}))) as {
    deletedCount?: number;
    deletedPaths?: string[];
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    throw new CloudOperationError(
      mapBrokerStatusToCloudCode(res.status, payload.code),
      payload.error || 'No se pudieron eliminar los activos públicos del catálogo.'
    );
  }

  return {
    deletedCount: Number(payload.deletedCount || 0),
    deletedPaths: Array.isArray(payload.deletedPaths) ? payload.deletedPaths : [],
  };
}

export async function deleteProductImageFromStorage(
  storagePath: string,
  workspaceId?: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  if (!isManagedStoragePath(storagePath)) {
    throw new CloudOperationError(
      'unauthorized',
      'Ruta de archivo inválida para eliminación en Firebase Storage.'
    );
  }

  if (!isFirebaseConfigured()) {
    throw new CloudOperationError(
      'not_configured',
      'Firebase Storage no está configurado en este entorno.'
    );
  }

  const resolvedWorkspaceId = workspaceId || storagePath.split('/')[1] || '';
  if (!resolvedWorkspaceId) {
    throw new CloudOperationError(
      'unauthorized',
      'Se requiere workspaceId para eliminar un archivo en Storage.'
    );
  }

  const { token } = await requireVerifiedIdToken();
  const fetchFn = fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(buildBrokerUrl('/api/storage/asset'), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspaceId: resolvedWorkspaceId,
        storagePath,
      }),
    });
  } catch (err) {
    throw new CloudOperationError(
      'unreachable',
      'No se pudo contactar al Storage Broker para eliminar el activo.',
      { path: storagePath, originalError: err }
    );
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new CloudOperationError(
      mapBrokerStatusToCloudCode(res.status, payload.code),
      payload.error || 'El Storage Broker denegó o falló al eliminar el archivo.',
      { path: storagePath }
    );
  }

  privateSignedUrlCache.delete(`${resolvedWorkspaceId}:${storagePath}`);
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mimeType = blob.type || 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
