/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PRUEBAS AUTOMATIZADAS: PUBLICACIÓN Y SEGURIDAD DE CATÁLOGOS (FASE 5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockDataService } from '../services/mockDataService';
import { buildPublicCatalogUrl } from '../utils/url';
import { Catalog } from '../types';

describe('Publicación y Seguridad de Catálogos', () => {
  let mockService: MockDataService;

  beforeEach(() => {
    mockService = new MockDataService();
  });

  it('debe generar URLs comerciales públicas que nunca contengan localhost', () => {
    const url = buildPublicCatalogUrl('pub_test_token_123');
    expect(url).toBeDefined();
    expect(url).toContain('/m/pub_test_token_123');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('127.0.0.1');
  });

  it('debe permitir publicar un catálogo en borrador y asignarle token único e instantánea inmutable', async () => {
    // Tomar catálogo en borrador (cat-02)
    const draft = await mockService.getCatalogById('cat-02');
    expect(draft).toBeDefined();
    expect(draft?.status).toBe('draft');

    const published = await mockService.publishCatalog('cat-02');
    expect(published.status).toBe('published');
    expect(published.shareToken).toBeDefined();
    expect(published.shareToken?.startsWith('pub_')).toBe(true);
    expect(published.publishedUrl).toBeDefined();
    expect(published.publishedUrl).not.toContain('localhost');
    expect(published.version).toBeGreaterThan(1);
    expect(published.publishedSnapshot).toBeDefined();
    expect(published.publishedSnapshot?.products.length).toBe(published.products.length);
  });

  it('debe permitir acceso público exclusivamente a catálogos en estado published', async () => {
    // 1. Catálogo publicado accesible
    const pubCatalog = await mockService.getByShareToken('pub_gourmet_2026');
    expect(pubCatalog).toBeDefined();
    expect(pubCatalog?.status).toBe('published');

    // 2. Catálogo en borrador NO debe ser accesible públicamente
    const draftDirect = await mockService.getByShareToken('cat-02');
    expect(draftDirect).toBeUndefined();

    // 3. Token aleatorio inexistente
    const notFound = await mockService.getByShareToken('pub_token_inexistente_999');
    expect(notFound).toBeUndefined();
  });

  it('debe revocar inmediatamente el acceso público al despublicar un catálogo', async () => {
    // Publicar catálogo cat-02
    const published = await mockService.publishCatalog('cat-02');
    const token = published.shareToken!;

    // Verificar que es accesible
    const verifyBefore = await mockService.getByShareToken(token);
    expect(verifyBefore).toBeDefined();

    // Despublicar
    const unpublished = await mockService.unpublishCatalog('cat-02');
    expect(unpublished.status).toBe('draft');

    // Intentar acceder con el mismo shareToken
    const verifyAfter = await mockService.getByShareToken(token);
    expect(verifyAfter).toBeUndefined();
  });
});
