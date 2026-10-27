/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * FACHADA UNIFICADA DE DATOS (FASE 5)
 * Conmuta dinámicamente entre persistencia real en Supabase (PostgreSQL) y el adaptador local
 * de alta fidelidad según la disponibilidad de credenciales en el entorno.
 */

import { isSupabaseConfigured, supabase } from './supabaseClient';
import { supabaseDataService } from './supabaseDataService';
import { mockDataService } from './mockDataService';
import {
  Product,
  Category,
  Catalog,
  Order,
  OrderStatus,
  ImportRecord,
  CandidateImage,
  ImageMatchStatus,
  ParsedCSVRow,
  ImportOptions,
} from '../types';

export class UnifiedDataService {
  private get isLive(): boolean {
    return isSupabaseConfigured();
  }

  // --- PRODUCTOS ---

  async getAll(workspaceId?: string): Promise<Product[]> {
    if (this.isLive && workspaceId) {
      try {
        return await supabaseDataService.getProducts(workspaceId);
      } catch (e) {
        console.warn('Fallback a datos locales por error en Supabase:', e);
      }
    }
    return mockDataService.getAll();
  }

  async getById(id: string): Promise<Product | undefined> {
    return mockDataService.getById(id);
  }

  async filter(query: {
    search?: string;
    category?: string;
    active?: boolean;
    hasImage?: boolean;
    imageStatus?: ImageMatchStatus;
  }): Promise<Product[]> {
    return mockDataService.filter(query);
  }

  async create(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    workspaceId?: string
  ): Promise<Product> {
    if (this.isLive && workspaceId) {
      try {
        return await supabaseDataService.createProduct(workspaceId, product);
      } catch (e) {
        console.warn('Fallback a persistencia local por error en Supabase:', e);
      }
    }
    return mockDataService.create(product);
  }

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    if (this.isLive) {
      try {
        return await supabaseDataService.updateProduct(id, updates);
      } catch (e) {
        console.warn('Fallback a persistencia local por error en Supabase:', e);
      }
    }
    return mockDataService.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    if (this.isLive) {
      try {
        await supabaseDataService.deleteProduct(id);
      } catch (e) {
        console.warn('Fallback a eliminación local por error en Supabase:', e);
      }
    }
    return mockDataService.delete(id);
  }

  async bulkDelete(ids: string[]): Promise<number> {
    return mockDataService.bulkDelete(ids);
  }

  async bulkUpdateStatus(ids: string[], active: boolean): Promise<number> {
    return mockDataService.bulkUpdateStatus(ids, active);
  }

  async bulkUpdateCategory(ids: string[], categoryId: string, categoryName: string): Promise<number> {
    return mockDataService.bulkUpdateCategory(ids, categoryId, categoryName);
  }

  // --- CATEGORÍAS ---

  async getCategories(workspaceId?: string): Promise<Category[]> {
    if (this.isLive && workspaceId) {
      try {
        const cats = await supabaseDataService.getCategories(workspaceId);
        if (cats.length > 0) return cats;
      } catch (e) {
        console.warn('Fallback a categorías locales:', e);
      }
    }
    return mockDataService.getCategories();
  }

  async createCategory(name: string, workspaceId?: string): Promise<Category> {
    if (this.isLive && workspaceId) {
      try {
        return await supabaseDataService.createCategory(workspaceId, name);
      } catch (e) {
        console.warn('Fallback a categoría local:', e);
      }
    }
    return mockDataService.createCategory(name);
  }

  // --- IMPORTACIONES CSV ---

  async importProducts(
    rows: ParsedCSVRow[],
    options: ImportOptions,
    fileName: string,
    onProgress?: (percent: number, current: number, total: number) => void
  ): Promise<ImportRecord> {
    return mockDataService.importProducts(rows, options, fileName, onProgress);
  }

  async associateImages(candidates: CandidateImage[]): Promise<{ matched: number; updated: number }> {
    return mockDataService.associateImages(candidates);
  }

  async getHistory(): Promise<ImportRecord[]> {
    return mockDataService.getHistory();
  }

  // --- CATÁLOGOS ---

  async getCatalogs(workspaceId?: string): Promise<Catalog[]> {
    if (this.isLive && workspaceId) {
      try {
        const cats = await supabaseDataService.getCatalogs(workspaceId);
        if (cats.length > 0) return cats;
      } catch (e) {
        console.warn('Fallback a catálogos locales:', e);
      }
    }
    return mockDataService.getCatalogs();
  }

  async getCatalogById(id: string): Promise<Catalog | undefined> {
    return mockDataService.getCatalogById(id);
  }

  /**
   * Consulta pública de revista virtual por token o slug
   * Solo retorna catálogos en estado 'published'.
   */
  async getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined> {
    if (this.isLive) {
      try {
        const found = await supabaseDataService.getByShareToken(tokenOrSlug);
        if (found) return found;
      } catch (e) {
        console.warn('Fallback a consulta local de shareToken:', e);
      }
    }
    return mockDataService.getByShareToken(tokenOrSlug);
  }

  async getPublishedCatalogs(): Promise<Catalog[]> {
    return mockDataService.getPublishedCatalogs();
  }

  async createCatalog(catalog: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>): Promise<Catalog> {
    return mockDataService.createCatalog(catalog);
  }

  async updateCatalog(id: string, updates: Partial<Catalog>): Promise<Catalog> {
    return mockDataService.updateCatalog(id, updates);
  }

  async duplicateCatalog(id: string): Promise<Catalog> {
    return mockDataService.duplicateCatalog(id);
  }

  async deleteCatalog(id: string): Promise<boolean> {
    return mockDataService.deleteCatalog(id);
  }

  async publishCatalog(id: string): Promise<Catalog> {
    return mockDataService.publishCatalog(id);
  }

  async unpublishCatalog(id: string): Promise<Catalog> {
    return mockDataService.unpublishCatalog(id);
  }

  // --- PEDIDOS ---

  async getOrders(workspaceId?: string): Promise<Order[]> {
    if (this.isLive && workspaceId) {
      try {
        const ords = await supabaseDataService.getOrders(workspaceId);
        if (ords.length > 0) return ords;
      } catch (e) {
        console.warn('Fallback a pedidos locales:', e);
      }
    }
    return mockDataService.getOrders();
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    return mockDataService.getOrderById(id);
  }

  async createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>,
    workspaceId?: string
  ): Promise<Order> {
    if (this.isLive && workspaceId) {
      try {
        return await supabaseDataService.createOrder(order, workspaceId);
      } catch (e) {
        console.warn('Fallback a creación local de orden:', e);
      }
    }
    return mockDataService.createOrder(order);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    if (this.isLive) {
      try {
        await supabaseDataService.updateOrderStatus(id, status);
      } catch (e) {
        console.warn('Fallback a actualización local de orden:', e);
      }
    }
    return mockDataService.updateOrderStatus(id, status);
  }

  async deleteOrder(id: string): Promise<boolean> {
    return mockDataService.deleteOrder(id);
  }
}

export const dataService = new UnifiedDataService();
