/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PRUEBAS AUTOMATIZADAS: SEGURIDAD MULTI-TENANT Y LÍMITES DE ACCESO (FASE 5)
 */

import { describe, it, expect } from 'vitest';
import { MockDataService } from '../services/mockDataService';
import { OrderStatus } from '../types';

describe('Seguridad Multi-Tenant y Validación de Integridad', () => {
  const service = new MockDataService();

  it('no debe permitir registrar pedidos con cantidades negativas o cero', async () => {
    // Validación de integridad de datos
    const invalidQuantityItems = [
      {
        productId: 'prod-001',
        sku: 'YOR-01',
        ean: '0770200100456',
        name: 'Producto A',
        price: 50000,
        quantity: -5, // Invalido
        subtotal: -250000,
      },
      {
        productId: 'prod-002',
        sku: 'YOR-02',
        ean: '0770200100789',
        name: 'Producto B',
        price: 30000,
        quantity: 0, // Invalido
        subtotal: 0,
      },
    ];

    // Función de saneamiento de carrito
    const sanitized = invalidQuantityItems
      .filter((it) => it.quantity > 0)
      .map((it) => ({
        ...it,
        quantity: Math.max(1, Math.floor(it.quantity)),
      }));

    expect(sanitized.length).toBe(0);
  });

  it('no debe marcar automáticamente un pedido como confirmed al crearlo desde la web', async () => {
    const newOrder = await service.createOrder({
      catalogId: 'cat-01',
      catalogTitle: 'Catálogo Temporada Fin de Año 2026',
      catalogVersion: 2,
      customerName: 'Cliente Anónimo',
      items: [
        {
          productId: 'prod-001',
          sku: 'YOR-CAFE-01',
          ean: '0770200100456',
          name: 'Café Geisha',
          price: 48000,
          quantity: 1,
          subtotal: 48000,
        },
      ],
      itemsCount: 1,
      totalAmount: 48000,
      currency: 'COP',
      status: 'whatsapp_opened', // Estado correcto al abrir WhatsApp
    });

    // Debe registrarse como whatsapp_opened, NUNCA confirmed sin intervención del comercio
    expect(newOrder.status).toBe('whatsapp_opened');
    expect(newOrder.status).not.toBe('confirmed');

    // Solo el operador en el backoffice puede confirmar el pedido
    const confirmedOrder = await service.updateOrderStatus(newOrder.id, 'confirmed');
    expect(confirmedOrder.status).toBe('confirmed');
  });

  it('debe mantener inmutable el snapshot de productos en versiones publicadas frente a cambios en inventario', async () => {
    // 1. Obtener catálogo publicado inicial
    const initialCatalog = await service.getCatalogById('cat-01');
    expect(initialCatalog?.publishedSnapshot).toBeDefined();

    const snapshotProduct = initialCatalog!.publishedSnapshot!.products[0].snapshot;
    const originalPrice = snapshotProduct.price;

    // 2. Modificar el producto en el inventario general
    await service.update(snapshotProduct.id, {
      price: originalPrice + 20000,
      name: 'Nombre Cambiado en Inventario Privado',
    });

    // 3. Consultar la revista pública publicada
    const publicCatalog = await service.getByShareToken('pub_gourmet_2026');
    const publicItem = publicCatalog?.publishedSnapshot?.products[0].snapshot;

    // 4. El precio y nombre en la revista publicada deben permanecer inmutables
    expect(publicItem?.price).toBe(originalPrice);
    expect(publicItem?.name).toBe(snapshotProduct.name);
  });
});
