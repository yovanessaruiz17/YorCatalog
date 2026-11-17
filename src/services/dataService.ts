/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FACHADA DE DATOS CLOUD-ONLY (FIREBASE FIRESTORE + STORAGE)
 * Conecta exclusivamente con Cloud Firestore y Firebase Storage.
 * Queda terminantemente prohibido cualquier mecanismo de persistencia local o fallback silencioso.
 * Si Firebase no está configurado o la sesión/workspace es inválido, las operaciones lanzan CloudOperationError explícito.
 */

import { CloudOperationError, isFirebaseConfigured } from './firebaseClient';
import { firebaseDataService } from './firebaseDataService';
import {
  Product,
  Category,
  Catalog,
  Order,
  OrderStatus,
  ImportRecord,
  CandidateImage,
  ParsedCSVRow,
  ImportOptions,
} from '../types';

export class UnifiedDataService {
  public get isLive(): boolean {
    return isFirebaseConfigured();
  }

  private checkConfigured(): void {
    if (!this.isLive) {
      throw new CloudOperationError(
        'not_configured',
        'Firebase no está configurado. YorCatalog opera exclusivamente en la nube (Cloud-Only).'
      );
    }
  }

  private requireWorkspace(workspaceId?: string): string {
    this.checkConfigured();
    if (!workspaceId) {
      throw new CloudOperationError(
        'unauthorized',
        'Se requiere un workspace activo para operar sobre datos en Cloud Firestore.'
      );
    }
    return workspaceId;
  }

  public clearRuntimeCaches(): void {
    firebaseDataService.clearRuntimeCaches();
  }

  // --- PRODUCTOS ---

  async getAll(workspaceId?: string): Promise<Product[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getProducts(wsId);
  }

  async getById(id: string, workspaceId?: string): Promise<Product | undefined> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getProductById(id, wsId);
  }

  async filter(query: {
    workspaceId?: string;
    search?: string;
    category?: string;
    active?: boolean;
    hasImage?: boolean;
  }): Promise<Product[]> {
    const wsId = this.requireWorkspace(query.workspaceId);
    const all = await firebaseDataService.getProducts(wsId);
    return all.filter((p) => {
      if (
        query.search &&
        !p.name.toLowerCase().includes(query.search.toLowerCase()) &&
        !p.sku.toLowerCase().includes(query.search.toLowerCase())
      ) {
        return false;
      }
      if (query.category && query.category !== 'all' && p.categoryId !== query.category) {
        return false;
      }
      if (query.active !== undefined && p.active !== query.active) {
        return false;
      }
      if (query.hasImage !== undefined && Boolean(p.imageUrl) !== query.hasImage) {
        return false;
      }
      return true;
    });
  }

  async create(
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    workspaceId?: string
  ): Promise<Product> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.createProduct(wsId, product);
  }

  async update(
    id: string,
    updates: Partial<Product>,
    workspaceId?: string
  ): Promise<Product> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.updateProduct(id, updates, wsId);
  }

  async delete(id: string, workspaceId?: string): Promise<boolean> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.deleteProduct(id, wsId);
  }

  async bulkDelete(ids: string[], workspaceId?: string): Promise<number> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.bulkDeleteProducts(ids, wsId);
  }

  async bulkUpdateStatus(ids: string[], active: boolean, workspaceId?: string): Promise<number> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.bulkUpdateProductStatus(ids, active, wsId);
  }

  async bulkUpdateCategory(
    ids: string[],
    categoryId: string,
    categoryName: string,
    workspaceId?: string
  ): Promise<number> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.bulkUpdateProductCategory(ids, categoryId, categoryName, wsId);
  }

  // --- CATEGORÍAS ---

  async getCategories(workspaceId?: string): Promise<Category[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getCategories(wsId);
  }

  async createCategory(name: string, workspaceId?: string): Promise<Category> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.createCategory(wsId, name);
  }

  // --- IMPORTACIONES CSV ---

  async importProducts(
    rows: ParsedCSVRow[],
    options: ImportOptions,
    fileName: string,
    workspaceId?: string,
    onProgress?: (percent: number, current: number, total: number) => void
  ): Promise<ImportRecord> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.importProducts(wsId, rows, options, fileName, onProgress);
  }

  async getHistory(workspaceId?: string): Promise<ImportRecord[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getImportHistory(wsId);
  }

  async associateImages(
    candidates: CandidateImage[],
    workspaceId?: string
  ): Promise<{ matched: number; updated: number }> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.associateImages(wsId, candidates);
  }

  // --- CATÁLOGOS ---

  async getCatalogs(workspaceId?: string): Promise<Catalog[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getCatalogs(wsId);
  }

  async getCatalogById(id: string, workspaceId?: string): Promise<Catalog | undefined> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getCatalogById(id, wsId);
  }

  async getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined> {
    this.checkConfigured();
    return firebaseDataService.getByShareToken(tokenOrSlug);
  }

  async getPublishedCatalogs(workspaceId?: string): Promise<Catalog[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getPublishedCatalogs(wsId);
  }

  async createCatalog(
    catalog: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>,
    workspaceId?: string
  ): Promise<Catalog> {
    const wsId = this.requireWorkspace(catalog.workspaceId || workspaceId);
    return firebaseDataService.createCatalog(wsId, catalog);
  }

  async updateCatalog(
    id: string,
    updates: Partial<Catalog>,
    workspaceId?: string
  ): Promise<Catalog> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.updateCatalog(id, updates, wsId);
  }

  async duplicateCatalog(id: string, workspaceId?: string): Promise<Catalog> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.duplicateCatalog(id, wsId);
  }

  async deleteCatalog(id: string, workspaceId?: string): Promise<boolean> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.deleteCatalog(id, wsId);
  }

  async publishCatalog(
    id: string,
    publishedData?: Catalog,
    workspaceId?: string
  ): Promise<Catalog> {
    const wsId = this.requireWorkspace(publishedData?.workspaceId || workspaceId);
    let catalog = publishedData;
    if (!catalog) {
      catalog = await this.getCatalogById(id, wsId);
    }
    if (!catalog) {
      throw new CloudOperationError('persistence_error', 'Catálogo no encontrado para publicar.');
    }
    return firebaseDataService.publishCatalog(id, catalog, wsId);
  }

  async unpublishCatalog(id: string, workspaceId?: string): Promise<boolean> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.unpublishCatalog(id, wsId);
  }

  // --- PEDIDOS ---

  async getOrders(workspaceId?: string): Promise<Order[]> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getOrders(wsId);
  }

  async getOrderById(id: string, workspaceId?: string): Promise<Order | undefined> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.getOrderById(id, wsId);
  }

  async createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>,
    workspaceId?: string
  ): Promise<Order> {
    const wsId = this.requireWorkspace(order.workspaceId || workspaceId);
    return firebaseDataService.createOrder(order, wsId);
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    workspaceId?: string
  ): Promise<boolean> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.updateOrderStatus(id, status, wsId);
  }

  async deleteOrder(id: string, workspaceId?: string): Promise<boolean> {
    const wsId = this.requireWorkspace(workspaceId);
    return firebaseDataService.deleteOrder(id, wsId);
  }
}

export const dataService = new UnifiedDataService();
