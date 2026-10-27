/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SERVICIO DE PROCESAMIENTO Y ASOCIACIÓN DE IMÁGENES POR EAN (FASE 2)
 * Implementa 4 métodos:
 * 1. Nombres de archivo por EAN (directo).
 * 2. Carga múltiple o archivo ZIP (con protección contra zip bombs y sanitización).
 * 3. Enlace por columna CSV (URL o nombre).
 * 4. Asociación y corrección manual lado a lado.
 */

import JSZip from 'jszip';
import { CandidateImage, ImageMatchStatus, Product } from '../types';

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg']);
const MAX_ZIP_FILES = 200;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB safety limit

/**
 * Normalizes filename to extract potential EAN candidate.
 * e.g., "0770200100456.png" -> "0770200100456"
 * e.g., "0770200100456_front.jpg" -> "0770200100456"
 * e.g., "EAN-0770200100456-1.webp" -> "0770200100456"
 */
export function extractEanFromFilename(filename: string): { ean: string | null; cleanName: string } {
  // Strip path and extension
  const baseName = filename.split('/').pop()?.split('\\').pop() || filename;
  const lastDot = baseName.lastIndexOf('.');
  const cleanName = lastDot > 0 ? baseName.substring(0, lastDot) : baseName;

  // Match 8-14 consecutive digits bounded by non-digits or string boundaries
  // Examples: "0770200100456", "0770200100456_front", "foto_0770200100789_frontal", "EAN-0770200100456"
  const match = cleanName.match(/(?:^|[^0-9])([0-9]{8,14})(?:[^0-9]|$)/);
  if (match && match[1]) {
    return { ean: match[1], cleanName };
  }

  return { ean: null, cleanName };
}

/**
 * Converts File object to CandidateImage with data URL.
 */
export async function processImageFile(file: File): Promise<CandidateImage | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

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
  };
}

/**
 * Safely extracts images from a ZIP archive in browser with zip bomb defenses.
 */
export async function extractImagesFromZip(zipFile: File): Promise<CandidateImage[]> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const candidates: CandidateImage[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
    // Prevent directory traversal or system paths
    if (zipEntry.dir || relativePath.includes('..') || relativePath.startsWith('/')) {
      continue;
    }

    fileCount++;
    if (fileCount > MAX_ZIP_FILES) {
      throw new Error(`El archivo ZIP contiene más de ${MAX_ZIP_FILES} archivos (límite de seguridad alcanzado).`);
    }

    const ext = relativePath.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      continue; // Skip non-images quietly
    }

    const blob = await zipEntry.async('blob');
    totalBytes += blob.size;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(`El tamaño descomprimido supera el límite seguro de 50MB.`);
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
    });
  }

  return candidates;
}

/**
 * Matches candidate images against current inventory products.
 * STRICT: Only exact EAN match is eligible.
 * Ambiguous matches (multiple products with same EAN) require manual resolution.
 */
export function matchImagesWithProducts(
  candidates: CandidateImage[],
  products: Product[]
): CandidateImage[] {
  // Map EAN to list of products
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
        matchStatus: 'no_image', // Image without matching product
      };
    }

    if (matchedProducts.length === 1) {
      return {
        ...cand,
        matchedProductId: matchedProducts[0].id,
        matchStatus: 'exact_match',
      };
    }

    // Ambiguous: multiple products share EAN
    return {
      ...cand,
      matchStatus: 'pending_review',
      ambiguousMatches: matchedProducts.map((p) => p.id),
    };
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
