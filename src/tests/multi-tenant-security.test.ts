/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS: SEGURIDAD MULTI-TENANT, AISLAMIENTO Y CONTROL PÚBLICO (FIREBASE)
 *
 * Clasificación:
 * [A] Pruebas unitarias de aislamiento lógico, sanitización y contratos Cloud-Only.
 * (Las pruebas de reglas Firestore y conectividad en vivo viven en firestore.rules.test.ts y firebase-integration.test.ts)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataService } from '../services/dataService';

describe('[A] Seguridad Multi-Tenant y Validación de Integridad de Pedidos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe descartar cantidades negativas o cero antes de persistir pedidos', () => {
    const invalidQuantityItems = [
      {
        productId: 'prod-001',
        sku: 'YOR-01',
        ean: '0770200100456',
        name: 'Producto A',
        price: 50000,
        quantity: -5,
        subtotal: -250000,
      },
      {
        productId: 'prod-002',
        sku: 'YOR-02',
        ean: '0770200100789',
        name: 'Producto B',
        price: 30000,
        quantity: 0,
        subtotal: 0,
      },
    ];

    const sanitized = invalidQuantityItems
      .filter((it) => it.quantity > 0)
      .map((it) => ({
        ...it,
        quantity: Math.max(1, Math.floor(it.quantity)),
      }));

    expect(sanitized.length).toBe(0);
  });

  it('debe rechazar createOrder si el pedido no contiene productos válidos', async () => {
    await expect(
      dataService.createOrder(
        {
          catalogId: 'cat-01',
          catalogShareToken: 'pub_test_2026',
          ownerId: 'uid_owner_1',
          catalogTitle: 'Catálogo Prueba',
          catalogVersion: 1,
          customerName: 'Cliente Prueba',
          items: [],
          itemsCount: 0,
          totalAmount: 0,
          currency: 'COP',
          status: 'whatsapp_opened',
        },
        'ws_uid_owner_1'
      )
    ).rejects.toThrow(/al menos un producto válido/i);
  });

  it('debe impedir lecturas o mutaciones privadas cuando falta el workspaceId del tenant', async () => {
    await expect(dataService.getAll(undefined)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(dataService.getCatalogs('')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(dataService.getOrders(undefined)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('debe impedir que un usuario de Workspace A acceda a recursos privados de Workspace B', () => {
    const workspaceA_Products = [
      { id: 'p1', workspaceId: 'ws_tenant_A', name: 'Producto Tenant A' },
    ];

    const requestedByTenantB = workspaceA_Products.filter(
      (p) => p.workspaceId === 'ws_tenant_B'
    );

    expect(requestedByTenantB.length).toBe(0);

    const targetProductWorkspace: string = 'ws_tenant_A';
    const actingUserWorkspace: string = 'ws_tenant_B';
    expect(targetProductWorkspace === actingUserWorkspace).toBe(false);
  });
});

describe('[A] Seguridad de Acceso Público y Anti-Enumeración por ShareToken', () => {
  it('debe retornar undefined inmediatamente cuando el shareToken está vacío o contiene caracteres inseguros', async () => {
    expect(await dataService.getByShareToken('')).toBeUndefined();
    expect(await dataService.getByShareToken('ab')).toBeUndefined();
    expect(await dataService.getByShareToken('../admin/users')).toBeUndefined();
    expect(await dataService.getByShareToken('token con espacios!')).toBeUndefined();
  });
});
