/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: STORAGE DE IMÁGENES, CLASIFICACIÓN DE ERRORES Y VALIDACIÓN RASTER [A]
 * Clasificación:
 * [A] Pruebas unitarias de validación raster, sanitización de rutas, eliminación segura y errores de Firebase Storage.
 */

import { describe, it, expect } from 'vitest';
import {
  validateImageFile,
  buildSafeStoragePath,
  uploadProductImageToStorage,
  deleteProductImageFromStorage,
  MAX_IMAGE_FILE_SIZE,
} from '../services/imageService';
import { CloudOperationError, classifyFirebaseError } from '../services/firebaseClient';

describe('[A] Validación de Archivos de Imagen y Seguridad Raster', () => {
  it('debe aceptar formatos rasterizados seguros (JPG, PNG, WebP) menores a 5 MB', () => {
    const validJpg = validateImageFile({ name: 'producto1.jpg', size: 1024 * 1024, type: 'image/jpeg' });
    expect(validJpg.valid).toBe(true);

    const validPng = validateImageFile({ name: 'producto2.png', size: 2 * 1024 * 1024, type: 'image/png' });
    expect(validPng.valid).toBe(true);

    const validWebp = validateImageFile({ name: 'producto3.webp', size: 500 * 1024, type: 'image/webp' });
    expect(validWebp.valid).toBe(true);
  });

  it('debe RECHAZAR estrictamente archivos SVG para prevenir vectores de inyección XSS', () => {
    const svgFile = validateImageFile({ name: 'vector_malicioso.svg', size: 2048, type: 'image/svg+xml' });
    expect(svgFile.valid).toBe(false);
    expect(svgFile.error).toContain('SVG');
    expect(svgFile.error).toContain('XSS');
  });

  it('debe rechazar extensiones ejecutables o no autorizadas (.exe, .js, .pdf)', () => {
    const exeFile = validateImageFile({ name: 'script.exe', size: 1024 });
    expect(exeFile.valid).toBe(false);

    const jsFile = validateImageFile({ name: 'payload.js', size: 512 });
    expect(jsFile.valid).toBe(false);
  });

  it('debe rechazar imágenes individuales que excedan el límite de 5 MB', () => {
    const oversizedFile = validateImageFile({
      name: 'foto_gigante.jpg',
      size: MAX_IMAGE_FILE_SIZE + 1024,
      type: 'image/jpeg',
    });
    expect(oversizedFile.valid).toBe(false);
    expect(oversizedFile.error).toContain('5 MB');
  });
});

describe('[A] Generación de Rutas Seguras de Firebase Storage y Aislamiento por Workspace', () => {
  it('debe aislar la ruta del archivo prefijándola con el workspaceId', () => {
    const wsId = 'ws_empresa_123';
    const filename = '0770200100456_front.jpg';
    const path = buildSafeStoragePath(wsId, filename, '0770200100456');

    expect(path.startsWith('ws_empresa_123/')).toBe(true);
    expect(path).toContain('0770200100456');
    expect(path.endsWith('.jpg')).toBe(true);
  });

  it('debe desinfectar el workspaceId para evitar secuencias de path traversal (..)', () => {
    const maliciousWsId = '../etc/passwd';
    const path = buildSafeStoragePath(maliciousWsId, 'foto.png');

    expect(path).not.toContain('..');
    expect(path.startsWith('etcpasswd/')).toBe(true);
    expect(path).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.png$/);
  });

  it('debe generar sufijos únicos con timestamp y nonce para evitar colisiones accidentales', () => {
    const wsId = 'ws-test';
    const path1 = buildSafeStoragePath(wsId, 'same_name.png');
    const path2 = buildSafeStoragePath(wsId, 'same_name.png');

    expect(path1).not.toBe(path2);
  });
});

describe('[A] Política Cloud-Only y Clasificación de Errores de Firebase Storage', () => {
  it('debe rechazar la subida con CloudOperationError unauthorized si falta workspaceId (sin fallback local://)', async () => {
    const fakeBlob = new Blob(['contenido_de_imagen_falsa'], { type: 'image/png' });

    await expect(
      uploadProductImageToStorage({
        file: fakeBlob,
        filename: 'producto_demo.png',
        workspaceId: '',
        ean: '7701234567890',
      })
    ).rejects.toThrow(CloudOperationError);
  });

  it('debe abortar y lanzar error si el archivo es SVG o inválido antes de tocar Firebase Storage', async () => {
    const invalidBlob = new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' });

    await expect(
      uploadProductImageToStorage({
        file: invalidBlob,
        filename: 'malicioso.svg',
        workspaceId: 'ws-demo',
      })
    ).rejects.toThrow(/SVG/);
  });

  it('debe rechazar deleteProductImageFromStorage para rutas fuera de catalog-images/', async () => {
    await expect(deleteProductImageFromStorage('other-bucket/secret.png')).rejects.toMatchObject({
      name: 'CloudOperationError',
      code: 'unauthorized',
    });
  });

  it('debe clasificar correctamente storage/bucket-not-found (HTTP 404), storage/quota-exceeded, storage/unauthorized y storage/retry-limit-exceeded', () => {
    const bucket404 = classifyFirebaseError({
      code: 'storage/bucket-not-found',
      status_: 404,
      message: 'Bucket does not exist',
    });
    expect(bucket404.code).toBe('not_configured');
    expect(bucket404.userMessage).toMatch(/404|inicializado/i);

    const quota = classifyFirebaseError({ code: 'storage/quota-exceeded', message: 'Quota' });
    expect(quota.code).toBe('persistence_error');

    const retryLimit = classifyFirebaseError({ code: 'storage/retry-limit-exceeded', message: 'Timeout' });
    expect(retryLimit.code).toBe('unreachable');

    const unauth = classifyFirebaseError({ code: 'storage/unauthenticated', message: 'Unauth' });
    expect(unauth.code).toBe('session_expired');
  });
});
