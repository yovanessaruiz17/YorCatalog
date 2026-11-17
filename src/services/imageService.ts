/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVICIO DE PROCESAMIENTO, ALMACENAMIENTO Y ASOCIACIÓN DE IMÁGENES POR EAN
 * Implementa:
 * 1. Nombres de archivo por EAN (directo y normalizado).
 * 2. Carga múltiple o archivo ZIP (con protección contra zip bombs y sanitización de rutas).
 * 3. Restricción estricta a formatos rasterizados seguros (JPG, PNG, WebP) eliminando el vector SVG XSS.
 * 4. Subida real a Firebase Storage (carpeta catalog-images/{workspaceId}/...) con aislamiento multi-tenant.
 * 5. Prevención de colisiones con nonces y timestamps seguros.
 * 6. Política Cloud-Only: rechaza con CloudOperationError si Firebase Storage no está configurado o falla.
 */

import JSZip from 'jszip';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  isFirebaseConfigured,
  storage,
  CloudOperationError,
  classifyFirebaseError,
} from './firebaseClient';
import { CandidateImage, Product } from '../types';

// Formatos rasterizados seguros. SVG EXCLUIDO para evitar Stored XSS por scripts incrustados.
export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB por imagen
export const MAX_ZIP_FILES = 200;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB límite de seguridad total

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

export interface UploadImageToStorageOptions {
  file: File | Blob;
  filename: string;
  workspaceId: string;
  ean?: string | null;
}

export interface StorageUploadOutcome {
  publicUrl: string;
  storagePath: string;
  isLocal: boolean;
  sizeBytes: number;
}

/**
 * Sube una imagen a Firebase Storage bajo `catalog-images/{workspaceId}/{archivo}`
 * con validación de seguridad raster y sin fallback local en base64.
 */
export async function uploadProductImageToStorage(
  options: UploadImageToStorageOptions
): Promise<StorageUploadOutcome> {
  const { file, filename, workspaceId, ean } = options;

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

  if (!isFirebaseConfigured() || !storage) {
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

  const relativePath = buildSafeStoragePath(workspaceId, filename, ean);
  const fullStoragePath = `catalog-images/${relativePath}`;

  try {
    const storageRef = ref(storage, fullStoragePath);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg',
      cacheControl: 'public,max-age=3600',
    });

    const publicUrl = await getDownloadURL(snapshot.ref);
    if (!publicUrl) {
      throw new CloudOperationError(
        'persistence_error',
        'No fue posible resolver la URL pública en Firebase Storage.'
      );
    }

    return {
      publicUrl,
      storagePath: fullStoragePath,
      isLocal: false,
      sizeBytes: file.size,
    };
  } catch (error) {
    const classified = classifyFirebaseError(error, 'persistence_error');
    throw new CloudOperationError(classified.code, classified.userMessage, {
      path: fullStoragePath,
      originalError: error,
    });
  }
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
