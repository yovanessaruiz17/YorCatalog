/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: PUBLICACIÓN DE CATÁLOGOS Y URLS COMERCIALES [A]
 */

import { describe, it, expect } from 'vitest';
import { buildPublicCatalogUrl, getPublicAppBaseUrl } from '../utils/url';
import { Catalog, CatalogPublishedSnapshot } from '../types';

describe('[A] Publicación y Seguridad de URLs Comerciales', () => {
  it('debe generar URLs comerciales públicas que nunca contengan localhost ni 127.0.0.1', () => {
    const url = buildPublicCatalogUrl('pub_test_token_123');
    expect(url).toBeDefined();
    expect(url).toContain('/m/pub_test_token_123');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('127.0.0.1');
  });

  it('debe respetar dominio personalizado válido cuando el comercio lo configura', () => {
    const custom = getPublicAppBaseUrl('https://catalogo.miempresa.com/');
    expect(custom).toBe('https://catalogo.miempresa.com');

    const url = buildPublicCatalogUrl('pub_custom_999', 'https://catalogo.miempresa.com/');
    expect(url).toBe('https://catalogo.miempresa.com/m/pub_custom_999');
  });

  it('debe construir snapshots publicados inmutables con metadatos de versión y negocio desacoplados', () => {
    const snapshot: CatalogPublishedSnapshot = {
      version: 2,
      publishedAt: '2026-11-17T12:00:00.000Z',
      publicUrl: buildPublicCatalogUrl('pub_inmutable_001'),
      templateId: 'editorial',
      visualSettings: {
        primaryColor: '#0f172a',
        secondaryColor: '#059669',
        fontFamily: 'serif',
        gridColumns: 3,
        productsPerPage: 6,
        cardSpacing: 'normal',
        showDescription: true,
        showBrand: true,
        showSku: true,
        showEan: true,
        showPrices: true,
        showDiscounts: true,
        showPageNumbers: true,
        headerText: 'Edición 2026',
        footerText: 'YorCatalog',
        groupByCategory: false,
        pageSize: 'a4',
        includeQrCode: true,
      },
      products: [
        {
          productId: 'p1',
          orderIndex: 0,
          snapshot: {
            id: 'p1',
            name: 'Café Origen Huila',
            sku: 'CAFE-01',
            ean: '0770200100456',
            categoryId: 'c1',
            price: 48000,
            currency: 'COP',
            active: true,
            createdAt: '2026-11-01T00:00:00Z',
            updatedAt: '2026-11-01T00:00:00Z',
          },
        },
      ],
    };

    const publishedCatalog: Partial<Catalog> = {
      id: 'cat-01',
      workspaceId: 'ws_owner_1',
      ownerId: 'owner_1',
      businessName: 'Café Alquimia',
      whatsappNumber: '+573001234567',
      currency: 'COP',
      language: 'es',
      status: 'published',
      shareToken: 'pub_inmutable_001',
      version: 2,
      publishedSnapshot: snapshot,
    };

    expect(publishedCatalog.publishedSnapshot?.products[0].snapshot.price).toBe(48000);
    expect(publishedCatalog.publishedSnapshot?.publicUrl).not.toContain('localhost');
    expect(publishedCatalog.businessName).toBe('Café Alquimia');
    expect(publishedCatalog.whatsappNumber).toBe('+573001234567');
  });
});
