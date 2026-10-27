/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PRUEBAS AUTOMATIZADAS: ASOCIACIÓN DE IMÁGENES Y GENERACIÓN DE PDF (FASE 5)
 */

import { describe, it, expect } from 'vitest';
import { extractEanFromFilename, matchImagesWithProducts } from '../services/imageService';
import { Product } from '../types';

describe('Asociación de Imágenes por EAN y Extracción de Nombres', () => {
  const sampleProducts: Product[] = [
    {
      id: 'prod-001',
      sku: 'YOR-CAFE-01',
      ean: '0770200100456',
      name: 'Café Especial Geisha Huila 340g',
      categoryId: 'cat-01',
      price: 48000,
      currency: 'COP',
      active: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'prod-002',
      sku: 'YOR-ACC-02',
      ean: '0770200100789',
      name: 'Prensa Francesa Acero Mate 600ml',
      categoryId: 'cat-01',
      price: 89000,
      currency: 'COP',
      active: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('debe extraer correctamente códigos EAN de 13 dígitos de nombres de archivos', () => {
    const res1 = extractEanFromFilename('0770200100456.jpg');
    expect(res1.ean).toBe('0770200100456');

    const res2 = extractEanFromFilename('foto_0770200100789_frontal.png');
    expect(res2.ean).toBe('0770200100789');

    const res3 = extractEanFromFilename('sin_codigo.jpg');
    expect(res3.ean).toBeNull();
  });

  it('debe asociar automáticamente con estado exact_match imágenes con EAN coincidente', () => {
    const candidates = [
      {
        id: 'img-01',
        filename: '0770200100456.jpg',
        cleanName: '0770200100456',
        extension: 'jpg',
        eanExtracted: '0770200100456',
        dataUrl: 'data:image/jpeg;base64,mock',
        sizeBytes: 1024,
        matchStatus: 'pending_review' as const,
      },
    ];

    const matched = matchImagesWithProducts(candidates, sampleProducts);
    expect(matched.length).toBe(1);
    expect(matched[0].matchedProductId).toBe('prod-001');
    expect(matched[0].matchStatus).toBe('exact_match');
  });

  it('debe marcar como no_image los archivos que no coincidan con ningún EAN del inventario', () => {
    const candidates = [
      {
        id: 'img-99',
        filename: '9999999999999.jpg',
        cleanName: '9999999999999',
        extension: 'jpg',
        eanExtracted: '9999999999999',
        dataUrl: 'data:image/jpeg;base64,mock',
        sizeBytes: 512,
        matchStatus: 'pending_review' as const,
      },
    ];

    const matched = matchImagesWithProducts(candidates, sampleProducts);
    expect(matched.length).toBe(1);
    expect(matched[0].matchedProductId).toBeUndefined();
    expect(matched[0].matchStatus).toBe('no_image');
  });
});
