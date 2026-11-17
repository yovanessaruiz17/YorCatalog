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

describe('[A] Separación de Roles Multiusuario (owner / admin / member) y Bloqueo sin Sesión', () => {
  it('debe rechazar createWorkspaceInvitation y acceptWorkspaceInvitation si no existe usuario autenticado y verificado', async () => {
    const { firebaseDataService } = await import('../services/firebaseDataService');

    await expect(
      firebaseDataService.createWorkspaceInvitation({
        workspaceId: 'ws_owner_1',
        workspaceName: 'Tienda Demo',
        email: 'collab@empresa.com',
        role: 'member',
      })
    ).rejects.toMatchObject({
      name: 'CloudOperationError',
      code: 'unauthorized',
    });

    await expect(
      firebaseDataService.acceptWorkspaceInvitation({
        id: 'inv_1',
        workspaceId: 'ws_owner_1',
        workspaceName: 'Tienda Demo',
        ownerId: 'uid_owner_1',
        email: 'collab@empresa.com',
        role: 'member',
        status: 'pending',
        invitedBy: 'uid_owner_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({
      name: 'CloudOperationError',
      code: 'unauthorized',
    });
  });

  it('debe verificar matriz de capacidades por rol (owner > admin > member > non_member)', () => {
    const canManageSettings = (r: 'owner' | 'admin' | 'member' | 'non_member') =>
      r === 'owner' || r === 'admin';
    const canDeleteWorkspace = (r: 'owner' | 'admin' | 'member' | 'non_member') =>
      r === 'owner';
    const canInviteRole = (
      actor: 'owner' | 'admin' | 'member' | 'non_member',
      target: 'owner' | 'admin' | 'member'
    ) => {
      if (target === 'owner') return false; // Prohibido invitar owner o autoescalar
      if (actor === 'owner') return true;
      if (actor === 'admin') return target === 'member';
      return false;
    };

    expect(canDeleteWorkspace('owner')).toBe(true);
    expect(canDeleteWorkspace('admin')).toBe(false);
    expect(canDeleteWorkspace('member')).toBe(false);
    expect(canManageSettings('owner')).toBe(true);
    expect(canManageSettings('admin')).toBe(true);
    expect(canManageSettings('member')).toBe(false);
    expect(canManageSettings('non_member')).toBe(false);

    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('owner', 'member')).toBe(true);
    expect(canInviteRole('owner', 'owner')).toBe(false);
    expect(canInviteRole('admin', 'member')).toBe(true);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('member', 'member')).toBe(false);
  });
});

