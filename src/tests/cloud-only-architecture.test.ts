/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRUEBAS AUTOMATIZADAS DE ARQUITECTURA CLOUD-ONLY Y ESTADOS DE CONEXIÓN (FASE R2.2)
 * Clasificación:
 * [A] Pruebas unitarias en memoria con mocks controlados de disponibilidad/permisos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dataService } from '../services/dataService';
import { settingsService } from '../services/settingsService';
import {
  CloudOperationError,
  classifyFirebaseError,
  formatCloudErrorForUser,
  isFirebaseConfigured,
} from '../services/firebaseClient';

describe('[A] FASE R2.2 — Arquitectura Cloud-Only con Firebase (Sin Persistencia Local)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Bloqueo Explícito cuando Firebase no está configurado (not_configured)', () => {
    beforeEach(() => {
      vi.spyOn(dataService, 'isLive', 'get').mockReturnValue(false);
    });

    it('debe rechazar la creación de productos con CloudOperationError not_configured', async () => {
      await expect(
        dataService.create(
          {
            name: 'Producto Test',
            sku: 'SKU-TEST-001',
            ean: '7701234567890',
            categoryId: 'cat-test',
            price: 15000,
            currency: 'COP',
            stock: 5,
            active: true,
          },
          'ws-test-123'
        )
      ).rejects.toMatchObject({
        name: 'CloudOperationError',
        code: 'not_configured',
      });
    });

    it('debe rechazar actualización y eliminación con error explícito', async () => {
      await expect(
        dataService.update('prod-1', { price: 20000 }, 'ws-test-123')
      ).rejects.toThrow(/Firebase no está configurado/i);

      await expect(dataService.delete('prod-1', 'ws-test-123')).rejects.toThrow(
        /Firebase no está configurado/i
      );
    });

    it('debe rechazar importación CSV, asociación de imágenes, pedidos y publicación sin Firebase', async () => {
      await expect(
        dataService.importProducts(
          [],
          {
            conflictResolution: 'update_existing',
            updatePrices: true,
            updateImages: true,
            updateStock: true,
            defaultCategory: 'General',
          },
          'test.csv',
          'ws-test-123'
        )
      ).rejects.toThrow(/Firebase no está configurado/i);

      await expect(dataService.associateImages([], 'ws-test-123')).rejects.toThrow(
        /Firebase no está configurado/i
      );

      await expect(
        dataService.createOrder(
          {
            catalogTitle: 'Catálogo Demo',
            catalogVersion: 1,
            customerName: 'Cliente Prueba',
            items: [],
            itemsCount: 0,
            totalAmount: 0,
            currency: 'COP',
            status: 'whatsapp_opened',
          },
          'ws-test-123'
        )
      ).rejects.toThrow(/Firebase no está configurado/i);

      await expect(dataService.publishCatalog('cat-01', undefined, 'ws-test-123')).rejects.toThrow(
        /Firebase no está configurado/i
      );
    });

    it('NO debe devolver listas vacías engañosas en lecturas privadas cuando Firebase no está configurado', async () => {
      await expect(dataService.getAll('ws-test-123')).rejects.toMatchObject({
        code: 'not_configured',
      });
      await expect(dataService.getCatalogs('ws-test-123')).rejects.toMatchObject({
        code: 'not_configured',
      });
      await expect(dataService.getOrders('ws-test-123')).rejects.toMatchObject({
        code: 'not_configured',
      });
      await expect(dataService.getHistory('ws-test-123')).rejects.toMatchObject({
        code: 'not_configured',
      });
    });
  });

  describe('2. Bloqueo por Workspace Faltante (unauthorized)', () => {
    it('debe rechazar lecturas y escrituras privadas si no hay workspaceId activo', async () => {
      if (!isFirebaseConfigured()) return;

      await expect(dataService.getAll(undefined)).rejects.toMatchObject({
        name: 'CloudOperationError',
        code: 'unauthorized',
      });

      await expect(dataService.getOrders(undefined)).rejects.toMatchObject({
        name: 'CloudOperationError',
        code: 'unauthorized',
      });

      await expect(dataService.publishCatalog('cat-01', undefined, undefined)).rejects.toMatchObject({
        name: 'CloudOperationError',
        code: 'unauthorized',
      });
    });
  });

  describe('3. Clasificación Diferenciada de Estados de Conexión Firebase', () => {
    it('debe clasificar correctamente unreachable, session_expired, unauthorized y persistence_error', () => {
      expect(classifyFirebaseError({ code: 'unavailable', message: 'Failed to get document' }).code).toBe(
        'unreachable'
      );
      expect(
        classifyFirebaseError(new Error('Failed to get document because the client is offline.')).code
      ).toBe('unreachable');
      expect(classifyFirebaseError({ code: 'auth/user-token-expired', message: 'expired' }).code).toBe(
        'session_expired'
      );
      expect(classifyFirebaseError({ code: 'resource-exhausted', message: 'quota' }).code).toBe(
        'persistence_error'
      );

      const formattedJsonError = formatCloudErrorForUser(
        new CloudOperationError(
          'unauthorized',
          JSON.stringify({
            error: 'Missing or insufficient permissions.',
            operationType: 'list',
            path: 'workspaces/ws_1/products',
          })
        )
      );
      expect(formattedJsonError.code).toBe('unauthorized');
      expect(formattedJsonError.message).toMatch(/Permisos insuficientes/i);
    });
  });

  describe('4. Cero Persistencia Comercial en localStorage o sessionStorage', () => {
    it('no debe escribir claves comerciales en localStorage ni sessionStorage al fallar consultas', async () => {
      vi.spyOn(dataService, 'isLive', 'get').mockReturnValue(false);

      await expect(dataService.getAll('ws-test-123')).rejects.toThrow();
      await expect(settingsService.getSettings('ws-test-123')).rejects.toThrow();

      if (typeof localStorage !== 'undefined') {
        const businessKeys = [
          'yorcatalog_products',
          'yorcatalog_categories',
          'yorcatalog_catalogs',
          'yorcatalog_orders',
          'yorcatalog_imports',
          'yorcatalog_settings',
          'yorcatalog_demo_session',
        ];
        for (const key of businessKeys) {
          expect(localStorage.getItem(key)).toBeNull();
        }
        expect(localStorage.length).toBe(0);
      }

      if (typeof sessionStorage !== 'undefined') {
        expect(sessionStorage.length).toBe(0);
      }
    });
  });
});
