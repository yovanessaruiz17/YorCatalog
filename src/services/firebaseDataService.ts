/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVICIO DE DATOS FIREBASE MULTI-TENANT (CLOUD-ONLY)
 * Implementa persistencia real en Cloud Firestore con reglas multiempresa (firestore.rules),
 * aislamiento por workspace, snapshots de publicación pública en /publishedCatalogs/{shareToken}
 * y manejo de errores estructurado via handleFirestoreError.
 */

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  orderBy,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import {
  db,
  auth,
  isFirebaseConfigured,
  OperationType,
  CloudOperationError,
  handleFirestoreError,
  classifyFirebaseError,
} from './firebaseClient';
import {
  uploadProductImageToStorage,
  extractManagedStoragePath,
  isPrivateManagedAsset,
  isPublicCatalogAsset,
  promoteCatalogAssetsViaBroker,
  unpublishCatalogAssetsViaBroker,
  type PromoteAssetInput,
  type PromotedAssetOutput,
} from './imageService';
import {
  Product,
  Category,
  Catalog,
  Order,
  OrderStatus,
  ImportRecord,
  CandidateImage,
  BusinessSettings,
  ParsedCSVRow,
  ImportOptions,
  SupportedCurrency,
  SupportedLanguage,
  ThemeMode,
  UserMembership,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from '../types';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function sanitizeFirestoreId(raw: string | undefined, prefix = 'id'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function timestampToIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function clampString(val: unknown, maxLen: number): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

function mapProductDoc(id: string, data: Record<string, any>): Product {
  return {
    id: data.id || id,
    name: data.name || '',
    description: data.description ?? undefined,
    sku: data.sku || '',
    ean: data.ean ?? null,
    categoryId: data.categoryId || '',
    categoryName: data.categoryName ?? undefined,
    brand: data.brand ?? undefined,
    price: Number(data.price || 0),
    compareAtPrice:
      data.compareAtPrice !== null && data.compareAtPrice !== undefined
        ? Number(data.compareAtPrice)
        : undefined,
    currency: data.currency || 'COP',
    imageUrl: data.imageUrl ?? undefined,
    imageVerified: Boolean(data.imageVerified),
    imageMatchStatus: data.imageMatchStatus ?? 'no_image',
    additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : undefined,
    stock: data.stock !== undefined && data.stock !== null ? Number(data.stock) : 0,
    active: data.active ?? true,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function mapCatalogDoc(id: string, data: Record<string, any>): Catalog {
  return {
    id: data.id || id,
    workspaceId: data.workspaceId,
    ownerId: data.ownerId,
    businessName: data.businessName,
    whatsappNumber: data.whatsappNumber,
    currency: data.currency,
    language: data.language,
    internalName: data.internalName || data.title || '',
    title: data.title || '',
    subtitle: data.subtitle ?? undefined,
    slug: data.slug || id,
    shareToken: data.shareToken,
    description: data.description ?? undefined,
    status: data.status || 'draft',
    version: Number(data.version || 1),
    itemsCount: Number(data.itemsCount ?? (Array.isArray(data.products) ? data.products.length : 0)),
    coverImage: data.coverImage ?? undefined,
    logoUrl: data.logoUrl ?? undefined,
    templateId: data.templateId || 'editorial',
    visualSettings: data.visualSettings || {},
    products: Array.isArray(data.products) ? data.products : [],
    publishedAt: data.publishedAt ? timestampToIso(data.publishedAt) : undefined,
    publishedUrl: data.publishedUrl ?? undefined,
    publishedSnapshot: data.publishedSnapshot ?? undefined,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function collectPrivateAssetsForCatalogPromotion(catalog: Pick<Catalog, 'coverImage' | 'logoUrl' | 'products'>): PromoteAssetInput[] {
  const assets: PromoteAssetInput[] = [];

  if (catalog.coverImage && isPrivateManagedAsset(catalog.coverImage)) {
    const sourceStoragePath = extractManagedStoragePath(catalog.coverImage);
    if (sourceStoragePath) {
      assets.push({ itemKey: 'cover', sourceStoragePath });
    }
  }

  if (catalog.logoUrl && isPrivateManagedAsset(catalog.logoUrl)) {
    const sourceStoragePath = extractManagedStoragePath(catalog.logoUrl);
    if (sourceStoragePath) {
      assets.push({ itemKey: 'logo', sourceStoragePath });
    }
  }

  const products = Array.isArray(catalog.products) ? catalog.products : [];
  products.forEach((item, idx) => {
    const snap = item?.snapshot;
    if (!snap) return;

    if (snap.imageUrl && isPrivateManagedAsset(snap.imageUrl)) {
      const sourceStoragePath = extractManagedStoragePath(snap.imageUrl);
      if (sourceStoragePath) {
        assets.push({ itemKey: `product:${idx}`, sourceStoragePath });
      }
    }

    if (Array.isArray(snap.additionalImages)) {
      snap.additionalImages.forEach((extraUrl, extraIdx) => {
        if (extraUrl && isPrivateManagedAsset(extraUrl)) {
          const sourceStoragePath = extractManagedStoragePath(extraUrl);
          if (sourceStoragePath) {
            assets.push({ itemKey: `product:${idx}:extra:${extraIdx}`, sourceStoragePath });
          }
        }
      });
    }
  });

  return assets;
}

export function applyPromotedPublicUrlsToCatalogSnapshot(
  catalog: Pick<Catalog, 'coverImage' | 'logoUrl' | 'products'>,
  promoted: PromotedAssetOutput[]
): {
  coverImage: string | undefined;
  logoUrl: string | undefined;
  products: Catalog['products'];
} {
  const urlByKey = new Map<string, string>();
  for (const entry of promoted) {
    urlByKey.set(entry.itemKey, entry.publicUrl);
  }

  const coverImage = urlByKey.get('cover') ?? catalog.coverImage;
  const logoUrl = urlByKey.get('logo') ?? catalog.logoUrl;
  const products = (catalog.products || []).map((item, idx) => {
    if (!item?.snapshot) return item;
    const promotedPrimary = urlByKey.get(`product:${idx}`);
    const promotedExtras = Array.isArray(item.snapshot.additionalImages)
      ? item.snapshot.additionalImages.map(
          (url, extraIdx) => urlByKey.get(`product:${idx}:extra:${extraIdx}`) ?? url
        )
      : item.snapshot.additionalImages;

    if (!promotedPrimary && !promotedExtras) return item;
    return {
      ...item,
      snapshot: {
        ...item.snapshot,
        ...(promotedPrimary ? { imageUrl: promotedPrimary } : {}),
        ...(promotedExtras ? { additionalImages: promotedExtras } : {}),
      },
    };
  });

  return { coverImage, logoUrl, products };
}

export function hasPromotedPublicCatalogAssets(data: Record<string, any> | undefined): boolean {
  if (!data) return false;
  if (isPublicCatalogAsset(data.coverImage) || isPublicCatalogAsset(data.logoUrl)) {
    return true;
  }
  const products = Array.isArray(data.products) ? data.products : [];
  for (const item of products) {
    if (isPublicCatalogAsset(item?.snapshot?.imageUrl)) return true;
    const extras = Array.isArray(item?.snapshot?.additionalImages) ? item.snapshot.additionalImages : [];
    if (extras.some((u: unknown) => typeof u === 'string' && isPublicCatalogAsset(u))) return true;
  }
  const snapProducts = Array.isArray(data.publishedSnapshot?.products)
    ? data.publishedSnapshot.products
    : [];
  for (const item of snapProducts) {
    if (isPublicCatalogAsset(item?.snapshot?.imageUrl)) return true;
    const extras = Array.isArray(item?.snapshot?.additionalImages) ? item.snapshot.additionalImages : [];
    if (extras.some((u: unknown) => typeof u === 'string' && isPublicCatalogAsset(u))) return true;
  }
  return false;
}

function mapOrderDoc(id: string, data: Record<string, any>): Order {
  return {
    id: data.id || id,
    workspaceId: data.workspaceId,
    ownerId: data.ownerId,
    orderNumber: data.orderNumber || id,
    catalogId: data.catalogId ?? undefined,
    catalogShareToken: data.catalogShareToken ?? undefined,
    catalogTitle: data.catalogTitle ?? undefined,
    catalogVersion:
      data.catalogVersion !== null && data.catalogVersion !== undefined
        ? Number(data.catalogVersion)
        : undefined,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone ?? undefined,
    customerCity: data.customerCity ?? undefined,
    customerAddress: data.customerAddress ?? undefined,
    notes: data.notes ?? undefined,
    itemsCount: Number(data.itemsCount || 0),
    totalAmount: Number(data.totalAmount || 0),
    currency: data.currency || 'COP',
    status: data.status || 'whatsapp_opened',
    whatsappUrl: data.whatsappUrl ?? undefined,
    items: Array.isArray(data.items) ? data.items : [],
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export class FirebaseDataService {
  private ownerIdCache = new Map<string, string>();

  private ensureDb(): Firestore {
    if (!isFirebaseConfigured() || !db) {
      throw new CloudOperationError(
        'not_configured',
        'Firebase no está configurado. YorCatalog opera exclusivamente en la nube (Cloud-Only).'
      );
    }
    return db;
  }

  public clearRuntimeCaches(): void {
    this.ownerIdCache.clear();
  }

  private async resolveWorkspaceOwnerId(workspaceId: string): Promise<string> {
    const cached = this.ownerIdCache.get(workspaceId);
    if (cached) return cached;

    const firestore = this.ensureDb();
    const wsPath = `workspaces/${workspaceId}`;
    try {
      const wsSnap = await getDoc(doc(firestore, 'workspaces', workspaceId));
      if (wsSnap.exists()) {
        const ownerId = wsSnap.data()?.ownerId;
        if (typeof ownerId === 'string' && VALID_ID_REGEX.test(ownerId)) {
          this.ownerIdCache.set(workspaceId, ownerId);
          return ownerId;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, wsPath);
    }

    const uid = auth?.currentUser?.uid;
    if (uid && VALID_ID_REGEX.test(uid)) {
      return uid;
    }

    throw new CloudOperationError(
      'unauthorized',
      'No se pudo verificar el propietario del workspace activo en Firestore.'
    );
  }

  // --- PRODUCTOS ---

  async getProducts(workspaceId: string): Promise<Product[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'products'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapProductDoc(d.id, d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async getProductById(id: string, workspaceId: string): Promise<Product | undefined> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products/${id}`;
    try {
      const snap = await getDoc(doc(firestore, 'workspaces', workspaceId, 'products', id));
      if (!snap.exists()) return undefined;
      return mapProductDoc(snap.id, snap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async createProduct(
    workspaceId: string,
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    const firestore = this.ensureDb();
    const productId = generateId('prod');
    const path = `workspaces/${workspaceId}/products/${productId}`;
    const ownerId = await this.resolveWorkspaceOwnerId(workspaceId);
    const nowIso = new Date().toISOString();

    const payload = stripUndefined({
      id: productId,
      workspaceId,
      ownerId,
      name: (product.name || 'Producto').trim().slice(0, 200),
      description: clampString(product.description, 2000),
      sku: (product.sku || productId).trim().slice(0, 80),
      ean: clampString(product.ean, 32),
      categoryId: clampString(product.categoryId, 128) ?? '',
      categoryName: clampString(product.categoryName, 100),
      brand: clampString(product.brand, 100),
      price: Math.max(0, Number(product.price || 0)),
      compareAtPrice:
        product.compareAtPrice !== undefined && product.compareAtPrice !== null
          ? Math.max(0, Number(product.compareAtPrice))
          : null,
      currency: (['COP', 'USD', 'EUR', 'MXN'].includes(product.currency)
        ? product.currency
        : 'COP') as SupportedCurrency,
      imageUrl: clampString(product.imageUrl, 1500),
      imageVerified: Boolean(product.imageVerified),
      imageMatchStatus: product.imageMatchStatus || (product.imageUrl ? 'confirmed' : 'no_image'),
      additionalImages: Array.isArray(product.additionalImages)
        ? product.additionalImages.slice(0, 10)
        : [],
      stock: Math.max(0, Number(product.stock ?? 0)),
      active: product.active ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await setDoc(doc(firestore, 'workspaces', workspaceId, 'products', productId), payload);
      return {
        ...product,
        id: productId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async updateProduct(
    id: string,
    updates: Partial<Product>,
    workspaceId: string
  ): Promise<Product> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products/${id}`;

    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.name !== undefined) payload.name = updates.name.trim().slice(0, 200);
    if (updates.description !== undefined) payload.description = clampString(updates.description, 2000);
    if (updates.sku !== undefined) payload.sku = updates.sku.trim().slice(0, 80);
    if (updates.ean !== undefined) payload.ean = clampString(updates.ean, 32);
    if (updates.categoryId !== undefined) payload.categoryId = clampString(updates.categoryId, 128) ?? '';
    if (updates.categoryName !== undefined) payload.categoryName = clampString(updates.categoryName, 100);
    if (updates.brand !== undefined) payload.brand = clampString(updates.brand, 100);
    if (updates.price !== undefined) payload.price = Math.max(0, Number(updates.price));
    if (updates.compareAtPrice !== undefined) {
      payload.compareAtPrice =
        updates.compareAtPrice !== null ? Math.max(0, Number(updates.compareAtPrice)) : null;
    }
    if (updates.currency !== undefined && ['COP', 'USD', 'EUR', 'MXN'].includes(updates.currency)) {
      payload.currency = updates.currency;
    }
    if (updates.imageUrl !== undefined) payload.imageUrl = clampString(updates.imageUrl, 1500);
    if (updates.imageVerified !== undefined) payload.imageVerified = Boolean(updates.imageVerified);
    if (updates.imageMatchStatus !== undefined) payload.imageMatchStatus = updates.imageMatchStatus;
    if (updates.additionalImages !== undefined) {
      payload.additionalImages = Array.isArray(updates.additionalImages)
        ? updates.additionalImages.slice(0, 10)
        : [];
    }
    if (updates.stock !== undefined) payload.stock = Math.max(0, Number(updates.stock));
    if (updates.active !== undefined) payload.active = Boolean(updates.active);

    try {
      const ref = doc(firestore, 'workspaces', workspaceId, 'products', id);
      await updateDoc(ref, payload);
      const refreshed = await getDoc(ref);
      if (refreshed.exists()) {
        return mapProductDoc(refreshed.id, refreshed.data());
      }
      return {
        id,
        name: updates.name || '',
        sku: updates.sku || '',
        ean: updates.ean ?? null,
        categoryId: updates.categoryId || '',
        price: updates.price || 0,
        currency: updates.currency || 'COP',
        active: updates.active ?? true,
        createdAt: updates.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...updates,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async deleteProduct(id: string, workspaceId: string): Promise<boolean> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products/${id}`;
    try {
      await deleteDoc(doc(firestore, 'workspaces', workspaceId, 'products', id));
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async bulkDeleteProducts(ids: string[], workspaceId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products`;
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(firestore);
        for (const id of chunk) {
          batch.delete(doc(firestore, 'workspaces', workspaceId, 'products', id));
        }
        await batch.commit();
      }
      return ids.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async bulkUpdateProductStatus(ids: string[], active: boolean, workspaceId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products`;
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(firestore);
        for (const id of chunk) {
          batch.update(doc(firestore, 'workspaces', workspaceId, 'products', id), {
            active,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      return ids.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async bulkUpdateProductCategory(
    ids: string[],
    categoryId: string,
    categoryName: string,
    workspaceId: string
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/products`;
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(firestore);
        for (const id of chunk) {
          batch.update(doc(firestore, 'workspaces', workspaceId, 'products', id), {
            categoryId: clampString(categoryId, 128) ?? '',
            categoryName: clampString(categoryName, 100),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      return ids.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // --- CATEGORÍAS ---

  async getCategories(workspaceId: string): Promise<Category[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/categories`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'categories'),
        orderBy('name', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.data().id || d.id,
        name: d.data().name || '',
        description: d.data().description ?? undefined,
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async createCategory(workspaceId: string, name: string): Promise<Category> {
    const firestore = this.ensureDb();
    const categoryId = generateId('catg');
    const path = `workspaces/${workspaceId}/categories/${categoryId}`;
    const ownerId = await this.resolveWorkspaceOwnerId(workspaceId);
    const cleanName = name.trim().slice(0, 100) || 'General';

    try {
      await setDoc(doc(firestore, 'workspaces', workspaceId, 'categories', categoryId), {
        id: categoryId,
        workspaceId,
        ownerId,
        name: cleanName,
        description: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: categoryId, name: cleanName };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  // --- CATÁLOGOS ---

  async getCatalogs(workspaceId: string): Promise<Catalog[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'catalogs'),
        orderBy('updatedAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapCatalogDoc(d.id, d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async getCatalogById(id: string, workspaceId: string): Promise<Catalog | undefined> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs/${id}`;
    try {
      const snap = await getDoc(doc(firestore, 'workspaces', workspaceId, 'catalogs', id));
      if (!snap.exists()) return undefined;
      return mapCatalogDoc(snap.id, snap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async createCatalog(
    workspaceId: string,
    catalog: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Catalog> {
    const firestore = this.ensureDb();
    const catalogId = generateId('cat');
    const path = `workspaces/${workspaceId}/catalogs/${catalogId}`;
    const ownerId = await this.resolveWorkspaceOwnerId(workspaceId);
    const nowIso = new Date().toISOString();

    const cleanSlug = sanitizeFirestoreId(
      (catalog.slug || catalog.title || catalogId)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-'),
      'cat'
    );
    const shareToken = sanitizeFirestoreId(catalog.shareToken, 'pub');
    const products = Array.isArray(catalog.products) ? catalog.products.slice(0, 300) : [];

    const payload = stripUndefined({
      id: catalogId,
      workspaceId,
      ownerId,
      internalName: (catalog.internalName || catalog.title || 'Catálogo').trim().slice(0, 160),
      title: (catalog.title || 'Catálogo Comercial').trim().slice(0, 160),
      subtitle: clampString(catalog.subtitle, 240),
      slug: cleanSlug,
      shareToken,
      description: clampString(catalog.description, 2000),
      status: catalog.status || 'draft',
      version: Math.max(1, Number(catalog.version || 1)),
      itemsCount: products.length,
      coverImage: clampString(catalog.coverImage, 1500),
      logoUrl: clampString(catalog.logoUrl, 1500),
      templateId: catalog.templateId || 'editorial',
      visualSettings: catalog.visualSettings || {},
      products,
      publishedAt: catalog.publishedAt || null,
      publishedUrl: clampString(catalog.publishedUrl, 1000),
      publishedSnapshot: catalog.publishedSnapshot || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await setDoc(doc(firestore, 'workspaces', workspaceId, 'catalogs', catalogId), payload);
      return {
        ...catalog,
        id: catalogId,
        workspaceId,
        ownerId,
        slug: cleanSlug,
        shareToken,
        itemsCount: products.length,
        products,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async updateCatalog(
    id: string,
    updates: Partial<Catalog>,
    workspaceId: string
  ): Promise<Catalog> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs/${id}`;

    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.internalName !== undefined) {
      payload.internalName = updates.internalName.trim().slice(0, 160);
    }
    if (updates.title !== undefined) {
      payload.title = updates.title.trim().slice(0, 160);
    }
    if (updates.subtitle !== undefined) {
      payload.subtitle = clampString(updates.subtitle, 240);
    }
    if (updates.slug !== undefined) {
      payload.slug = sanitizeFirestoreId(
        updates.slug.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
        'cat'
      );
    }
    if (updates.shareToken !== undefined) {
      payload.shareToken = sanitizeFirestoreId(updates.shareToken, 'pub');
    }
    if (updates.description !== undefined) {
      payload.description = clampString(updates.description, 2000);
    }
    if (updates.coverImage !== undefined) {
      payload.coverImage = clampString(updates.coverImage, 1500);
    }
    if (updates.logoUrl !== undefined) {
      payload.logoUrl = clampString(updates.logoUrl, 1500);
    }
    if (updates.templateId !== undefined) {
      payload.templateId = updates.templateId;
    }
    if (updates.visualSettings !== undefined) {
      payload.visualSettings = updates.visualSettings;
    }
    if (updates.products !== undefined) {
      const sliced = updates.products.slice(0, 300);
      payload.products = sliced;
      payload.itemsCount = sliced.length;
    }

    try {
      const ref = doc(firestore, 'workspaces', workspaceId, 'catalogs', id);
      await updateDoc(ref, payload);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return mapCatalogDoc(snap.id, snap.data());
      }
      throw new CloudOperationError('persistence_error', 'Catálogo actualizado pero no encontrado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async duplicateCatalog(id: string, workspaceId: string): Promise<Catalog> {
    const original = await this.getCatalogById(id, workspaceId);
    if (!original) {
      throw new CloudOperationError('persistence_error', 'Catálogo original no encontrado para duplicar.');
    }

    const newTitle = `Copia de ${original.title}`.slice(0, 160);
    const newSlug = sanitizeFirestoreId(
      `${original.slug}-copia-${Date.now().toString(36).slice(-4)}`,
      'cat'
    );

    return this.createCatalog(original.workspaceId || workspaceId, {
      internalName: newTitle,
      title: newTitle,
      subtitle: original.subtitle,
      slug: newSlug,
      shareToken: generateId('pub'),
      description: original.description,
      status: 'draft',
      version: 1,
      itemsCount: original.products.length,
      coverImage: original.coverImage,
      logoUrl: original.logoUrl,
      templateId: original.templateId,
      visualSettings: original.visualSettings,
      products: original.products,
    });
  }

  async deleteCatalog(id: string, workspaceId: string): Promise<boolean> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs/${id}`;
    try {
      const catRef = doc(firestore, 'workspaces', workspaceId, 'catalogs', id);
      const snap = await getDoc(catRef);
      const snapData = snap.exists() ? snap.data() : undefined;
      const shareToken = snapData?.shareToken;

      let pubData: Record<string, any> | undefined;
      let pubExists = false;
      if (shareToken && VALID_ID_REGEX.test(shareToken)) {
        const pubSnap = await getDoc(doc(firestore, 'publishedCatalogs', shareToken));
        if (pubSnap.exists()) {
          pubExists = true;
          pubData = pubSnap.data();
        }
      }

      // Si existen activos públicos promovidos bajo public-catalogs/{wsId}/{id}/,
      // eliminarlos sin tocar las imágenes maestras en catalog-images/{wsId}/.
      if (hasPromotedPublicCatalogAssets(snapData) || hasPromotedPublicCatalogAssets(pubData)) {
        await unpublishCatalogAssetsViaBroker({ workspaceId, catalogId: id });
      }

      const batch = writeBatch(firestore);
      batch.delete(catRef);
      if (pubExists && shareToken) {
        batch.delete(doc(firestore, 'publishedCatalogs', shareToken));
      }
      await batch.commit();
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  async getPublishedCatalogs(workspaceId: string): Promise<Catalog[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'catalogs'),
        where('status', '==', 'published')
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => mapCatalogDoc(d.id, d.data()))
        .sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async publishCatalog(
    id: string,
    publishedData: Catalog,
    workspaceId: string
  ): Promise<Catalog> {
    const firestore = this.ensureDb();
    const wsId = publishedData.workspaceId || workspaceId;
    if (!wsId) {
      throw new CloudOperationError('persistence_error', 'Se requiere workspaceId para publicar.');
    }

    const ownerId = publishedData.ownerId || (await this.resolveWorkspaceOwnerId(wsId));

    // Obtener metadatos públicos del negocio (nombre, whatsapp, moneda, idioma) desde /workspaces/{wsId}
    let businessName = publishedData.businessName || 'Mi Negocio Comercial';
    let whatsappNumber = publishedData.whatsappNumber || '';
    let currency: SupportedCurrency = publishedData.currency || 'COP';
    let language: SupportedLanguage = publishedData.language || 'es';

    try {
      const wsSnap = await getDoc(doc(firestore, 'workspaces', wsId));
      if (wsSnap.exists()) {
        const wsData = wsSnap.data();
        if (wsData.name) businessName = String(wsData.name).slice(0, 120);
        if (wsData.whatsappNumber !== undefined) {
          whatsappNumber = String(wsData.whatsappNumber || '').slice(0, 32);
        }
        if (['COP', 'USD', 'EUR', 'MXN'].includes(wsData.currency)) {
          currency = wsData.currency;
        }
        if (['es', 'en'].includes(wsData.language)) {
          language = wsData.language;
        }
      }
    } catch {
      // Si no es legible, usar los valores recibidos
    }

    const nowIso = new Date().toISOString();
    const newVersion = (publishedData.version || 1) + 1;
    const token = sanitizeFirestoreId(publishedData.shareToken || generateId('pub'), 'pub');
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://yorcatalog.app';
    const publicUrl = `${origin}/m/${token}`;
    const draftProducts = (publishedData.products || []).slice(0, 300);

    // 1. Promover vía Storage Broker EXCLUSIVAMENTE los activos de este snapshot hacia public-catalogs/{wsId}/{id}/
    //    Si la promoción falla (total o parcialmente), abortar antes de marcar el catálogo como publicado.
    const assetsToPromote = collectPrivateAssetsForCatalogPromotion({
      coverImage: publishedData.coverImage,
      logoUrl: publishedData.logoUrl,
      products: draftProducts,
    });

    let promotedAssets: PromotedAssetOutput[] = [];
    if (assetsToPromote.length > 0) {
      promotedAssets = await promoteCatalogAssetsViaBroker({
        workspaceId: wsId,
        catalogId: id,
        assets: assetsToPromote,
      });
    }

    const publicView = applyPromotedPublicUrlsToCatalogSnapshot(
      {
        coverImage: publishedData.coverImage,
        logoUrl: publishedData.logoUrl,
        products: draftProducts,
      },
      promotedAssets
    );

    const publishedSnapshot = {
      version: newVersion,
      publishedAt: nowIso,
      products: publicView.products,
      visualSettings: publishedData.visualSettings,
      templateId: publishedData.templateId,
      publicUrl,
    };

    const catRef = doc(firestore, 'workspaces', wsId, 'catalogs', id);
    const pubRef = doc(firestore, 'publishedCatalogs', token);

    const batch = writeBatch(firestore);

    // 2. Actualizar catálogo privado en /workspaces/{wsId}/catalogs/{id} conservando fuentes privadas en `products`
    //    y guardando el snapshot público promovido en `publishedSnapshot`.
    batch.update(catRef, {
      internalName: (publishedData.internalName || publishedData.title).trim().slice(0, 160),
      title: publishedData.title.trim().slice(0, 160),
      subtitle: clampString(publishedData.subtitle, 240),
      slug: sanitizeFirestoreId(publishedData.slug, 'cat'),
      shareToken: token,
      description: clampString(publishedData.description, 2000),
      templateId: publishedData.templateId,
      visualSettings: publishedData.visualSettings,
      products: draftProducts,
      itemsCount: draftProducts.length,
      coverImage: clampString(publishedData.coverImage, 1500),
      logoUrl: clampString(publishedData.logoUrl, 1500),
      status: 'published',
      version: newVersion,
      publishedAt: nowIso,
      publishedUrl: publicUrl,
      publishedSnapshot,
      updatedAt: serverTimestamp(),
    });

    // 3. Publicar snapshot público desacoplado con URLs públicas de `public-catalogs/` en /publishedCatalogs/{shareToken}
    batch.set(
      pubRef,
      stripUndefined({
        id: token,
        catalogId: id,
        workspaceId: wsId,
        ownerId,
        businessName: businessName.trim().slice(0, 120) || 'Mi Negocio',
        whatsappNumber: whatsappNumber.trim().slice(0, 32),
        currency,
        language,
        title: publishedData.title.trim().slice(0, 160),
        subtitle: clampString(publishedData.subtitle, 240),
        slug: sanitizeFirestoreId(publishedData.slug, 'cat'),
        shareToken: token,
        description: clampString(publishedData.description, 2000),
        status: 'published',
        version: newVersion,
        itemsCount: publicView.products.length,
        coverImage: clampString(publicView.coverImage, 1500),
        logoUrl: clampString(publicView.logoUrl, 1500),
        templateId: publishedData.templateId,
        visualSettings: publishedData.visualSettings,
        products: publicView.products,
        publishedAt: nowIso,
        publishedUrl: publicUrl,
        publishedSnapshot,
        updatedAt: serverTimestamp(),
      })
    );

    try {
      await batch.commit();
      return {
        ...publishedData,
        id,
        workspaceId: wsId,
        ownerId,
        businessName,
        whatsappNumber,
        currency,
        language,
        status: 'published',
        version: newVersion,
        shareToken: token,
        itemsCount: draftProducts.length,
        publishedAt: nowIso,
        publishedUrl: publicUrl,
        publishedSnapshot,
        updatedAt: nowIso,
      };
    } catch (error) {
      // Compensación: si falló el commit de Firestore tras promover activos nuevos, limpiar copia pública si no estaba previamente publicada
      if (promotedAssets.length > 0 && publishedData.status !== 'published') {
        await unpublishCatalogAssetsViaBroker({ workspaceId: wsId, catalogId: id }).catch(
          () => undefined
        );
      }
      handleFirestoreError(error, OperationType.WRITE, `workspaces/${wsId}/catalogs/${id}`);
    }
  }

  async unpublishCatalog(id: string, workspaceId: string): Promise<boolean> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/catalogs/${id}`;

    try {
      const catRef = doc(firestore, 'workspaces', workspaceId, 'catalogs', id);
      const snap = await getDoc(catRef);
      if (!snap.exists()) {
        throw new CloudOperationError('persistence_error', 'Catálogo no encontrado para despublicar.');
      }

      const snapData = snap.data();
      const shareToken = snapData?.shareToken;
      let pubExists = false;
      let pubData: Record<string, any> | undefined;

      if (shareToken && VALID_ID_REGEX.test(shareToken)) {
        const pubRef = doc(firestore, 'publishedCatalogs', shareToken);
        const pubSnap = await getDoc(pubRef);
        if (pubSnap.exists()) {
          pubExists = true;
          pubData = pubSnap.data();
        }
      }

      // Eliminar copias públicas bajo public-catalogs/{workspaceId}/{id}/ conservando maestras en catalog-images/
      if (hasPromotedPublicCatalogAssets(snapData) || hasPromotedPublicCatalogAssets(pubData)) {
        await unpublishCatalogAssetsViaBroker({ workspaceId, catalogId: id });
      }

      const batch = writeBatch(firestore);

      batch.update(catRef, {
        status: 'draft',
        publishedAt: null,
        publishedUrl: null,
        updatedAt: serverTimestamp(),
      });

      if (pubExists && shareToken) {
        batch.delete(doc(firestore, 'publishedCatalogs', shareToken));
      }

      await batch.commit();
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  /**
   * Consulta pública anónima por shareToken desde /publishedCatalogs/{shareToken}.
   * - Retorna `undefined` si el token es inválido, no existe o fue despublicado (`permission-denied` en regla resource != null && status == 'published').
   * - Lanza `CloudOperationError('unreachable', ...)` si Firestore está inaccesible o sin red.
   */
  async getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined> {
    const firestore = this.ensureDb();
    const clean = (tokenOrSlug || '').trim();
    if (!clean || clean.length < 3 || !VALID_ID_REGEX.test(clean)) {
      return undefined;
    }

    const path = `publishedCatalogs/${clean}`;
    try {
      const snap = await getDocFromServer(doc(firestore, 'publishedCatalogs', clean));
      if (!snap.exists()) return undefined;
      const data = snap.data();
      if (data.status !== 'published') return undefined;
      return mapCatalogDoc(data.catalogId || snap.id, data);
    } catch (error) {
      const rawCode = ((error as { code?: string })?.code || '').toLowerCase();
      // En firestore.rules: allow get: if resource != null && existing().status == 'published';
      // Cuando no existe o está en draft, Firestore devuelve permission-denied.
      if (rawCode.includes('permission-denied') || rawCode.includes('not-found')) {
        return undefined;
      }
      const classified = classifyFirebaseError(error, 'unreachable');
      throw new CloudOperationError(classified.code, classified.userMessage, {
        operationType: OperationType.GET,
        path,
        originalError: error,
      });
    }
  }

  // --- PEDIDOS ---

  async getOrders(workspaceId: string): Promise<Order[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/orders`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'orders'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => mapOrderDoc(d.id, d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async getOrderById(id: string, workspaceId: string): Promise<Order | undefined> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/orders/${id}`;
    try {
      const snap = await getDoc(doc(firestore, 'workspaces', workspaceId, 'orders', id));
      if (!snap.exists()) return undefined;
      return mapOrderDoc(snap.id, snap.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async createOrder(
    order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>,
    workspaceId: string
  ): Promise<Order> {
    const firestore = this.ensureDb();
    const orderId = generateId('ord');
    const path = `workspaces/${workspaceId}/orders/${orderId}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `PED-${new Date().getFullYear()}-${randomSuffix}`;
    const nowIso = new Date().toISOString();

    if (!Array.isArray(order.items) || order.items.length === 0) {
      throw new CloudOperationError(
        'persistence_error',
        'El pedido debe incluir al menos un producto válido.'
      );
    }

    // Resolver ownerId desde el catálogo publicado (comprador público sin login) o desde workspace (operador)
    let ownerId = order.ownerId;
    if (!ownerId && order.catalogShareToken) {
      try {
        const pubSnap = await getDoc(doc(firestore, 'publishedCatalogs', order.catalogShareToken));
        if (pubSnap.exists()) {
          ownerId = pubSnap.data()?.ownerId;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `publishedCatalogs/${order.catalogShareToken}`);
      }
    }
    if (!ownerId) {
      ownerId = await this.resolveWorkspaceOwnerId(workspaceId);
    }

    const sanitizedItems = order.items.slice(0, 200).map((it) => ({
      productId: it.productId,
      sku: it.sku || '',
      ean: it.ean ?? null,
      name: it.name || 'Producto',
      price: Math.max(0, Number(it.price || 0)),
      compareAtPrice: it.compareAtPrice !== undefined ? Number(it.compareAtPrice) : null,
      quantity: Math.max(1, Number(it.quantity || 1)),
      subtotal: Math.max(0, Number(it.subtotal ?? it.price * it.quantity)),
      imageUrl: clampString(it.imageUrl, 1500),
    }));

    const payload = stripUndefined({
      id: orderId,
      workspaceId,
      ownerId,
      orderNumber,
      catalogId: clampString(order.catalogId, 128),
      catalogShareToken: clampString(order.catalogShareToken, 128),
      catalogTitle: clampString(order.catalogTitle, 160),
      catalogVersion:
        order.catalogVersion !== undefined ? Number(order.catalogVersion) : null,
      customerName: (order.customerName || 'Cliente').trim().slice(0, 140),
      customerPhone: clampString(order.customerPhone, 40),
      customerCity: clampString(order.customerCity, 100),
      customerAddress: clampString(order.customerAddress, 300),
      notes: clampString(order.notes, 1000),
      items: sanitizedItems,
      itemsCount: Math.max(1, Number(order.itemsCount || sanitizedItems.length)),
      totalAmount: Math.max(0, Number(order.totalAmount || 0)),
      currency: (['COP', 'USD', 'EUR', 'MXN'].includes(order.currency)
        ? order.currency
        : 'COP') as SupportedCurrency,
      status: (order.status || 'whatsapp_opened') as OrderStatus,
      whatsappUrl: clampString(order.whatsappUrl, 4000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await setDoc(doc(firestore, 'workspaces', workspaceId, 'orders', orderId), payload);
      return {
        ...order,
        id: orderId,
        workspaceId,
        ownerId,
        orderNumber,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    workspaceId: string
  ): Promise<boolean> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/orders/${id}`;
    try {
      await updateDoc(doc(firestore, 'workspaces', workspaceId, 'orders', id), {
        status,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async deleteOrder(id: string, workspaceId: string): Promise<boolean> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/orders/${id}`;
    try {
      await deleteDoc(doc(firestore, 'workspaces', workspaceId, 'orders', id));
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  // --- IMPORTACIONES CSV ---

  async importProducts(
    workspaceId: string,
    rows: ParsedCSVRow[],
    options: ImportOptions,
    fileName: string,
    onProgress?: (percent: number, current: number, total: number) => void
  ): Promise<ImportRecord> {
    const firestore = this.ensureDb();
    const ownerId = await this.resolveWorkspaceOwnerId(workspaceId);
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    const errorLog: string[] = [];
    const total = rows.length;
    const nowIso = new Date().toISOString();

    const existingProducts = await this.getProducts(workspaceId);
    const existingMap = new Map<string, Product>();
    for (const p of existingProducts) {
      existingMap.set(p.sku.toLowerCase().trim(), p);
    }

    const existingCategories = await this.getCategories(workspaceId);
    const categoryMap = new Map<string, Category>();
    for (const c of existingCategories) {
      categoryMap.set(c.name.toLowerCase().trim(), c);
    }

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      if (onProgress && (i % 5 === 0 || i === total - 1)) {
        onProgress(Math.round(((i + 1) / total) * 100), i + 1, total);
      }

      if (
        row.status === 'error' ||
        !row.mapped.name ||
        !row.mapped.sku ||
        row.mapped.price === undefined
      ) {
        errorsCount++;
        errorLog.push(`Fila ${row.rowNumber} omitida: ${row.errors.join(', ')}`);
        continue;
      }

      const skuKey = row.mapped.sku.toLowerCase().trim();
      const existing = existingMap.get(skuKey);

      const catName = (row.mapped.category || options.defaultCategory || 'General').trim();
      let matchedCat = categoryMap.get(catName.toLowerCase());
      if (!matchedCat) {
        matchedCat = await this.createCategory(workspaceId, catName);
        categoryMap.set(catName.toLowerCase(), matchedCat);
      }

      try {
        if (existing) {
          if (options.conflictResolution === 'skip_existing') {
            skippedCount++;
            continue;
          }

          if (options.conflictResolution === 'create_new_sku') {
            const newSku = `${row.mapped.sku}-N`;
            await this.createProduct(workspaceId, {
              name: row.mapped.name,
              sku: newSku,
              ean: row.mapped.ean || null,
              categoryId: matchedCat?.id || '',
              categoryName: matchedCat?.name || catName,
              brand: row.mapped.brand,
              description: row.mapped.description,
              price: row.mapped.price,
              compareAtPrice: row.mapped.compareAtPrice,
              currency: 'COP',
              stock: options.updateStock ? row.mapped.stock || 0 : 0,
              imageUrl: options.updateImages ? row.mapped.imageUrl : undefined,
              active: row.mapped.active ?? true,
            });
            importedCount++;
          } else {
            const updates: Partial<Product> = {
              name: row.mapped.name,
              ean: row.mapped.ean || existing.ean,
              categoryId: matchedCat?.id || existing.categoryId,
              categoryName: matchedCat?.name || existing.categoryName,
              brand: row.mapped.brand || existing.brand,
              description: row.mapped.description || existing.description,
            };
            if (options.updatePrices) updates.price = row.mapped.price;
            if (options.updateStock && row.mapped.stock !== undefined) {
              updates.stock = row.mapped.stock;
            }
            if (options.updateImages && row.mapped.imageUrl) {
              updates.imageUrl = row.mapped.imageUrl;
            }

            await this.updateProduct(existing.id, updates, workspaceId);
            updatedCount++;
          }
        } else {
          await this.createProduct(workspaceId, {
            name: row.mapped.name,
            sku: row.mapped.sku,
            ean: row.mapped.ean || null,
            categoryId: matchedCat?.id || '',
            categoryName: matchedCat?.name || catName,
            brand: row.mapped.brand,
            description: row.mapped.description,
            price: row.mapped.price,
            compareAtPrice: row.mapped.compareAtPrice,
            currency: 'COP',
            stock: row.mapped.stock || 0,
            imageUrl: row.mapped.imageUrl,
            active: row.mapped.active ?? true,
          });
          importedCount++;
        }
      } catch (err: any) {
        errorsCount++;
        errorLog.push(`Error en fila ${row.rowNumber} (${row.mapped.sku}): ${err?.message || err}`);
      }
    }

    const importId = generateId('imp');
    const finalStatus: 'completed' | 'failed' =
      errorsCount === total && total > 0 ? 'failed' : 'completed';
    const clampedLog = errorLog.slice(0, 200).map((msg) => msg.slice(0, 500));

    try {
      await setDoc(doc(firestore, 'workspaces', workspaceId, 'importJobs', importId), {
        id: importId,
        workspaceId,
        ownerId,
        fileName: (fileName || 'importacion.csv').slice(0, 255),
        totalRows: total,
        importedCount,
        updatedCount,
        skippedCount,
        duplicatesCount: 0,
        errorsCount,
        status: finalStatus,
        conflictResolution: options.conflictResolution,
        errorLog: clampedLog,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${workspaceId}/importJobs/${importId}`);
    }

    return {
      id: importId,
      fileName,
      totalRows: total,
      importedCount,
      updatedCount,
      skippedCount,
      duplicatesCount: 0,
      errorsCount,
      status: finalStatus,
      conflictResolution: options.conflictResolution,
      errorLog: clampedLog,
      createdAt: nowIso,
    };
  }

  async getImportHistory(workspaceId: string): Promise<ImportRecord[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/importJobs`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'importJobs'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          fileName: data.fileName || '',
          totalRows: Number(data.totalRows || 0),
          importedCount: Number(data.importedCount || 0),
          updatedCount: Number(data.updatedCount || 0),
          skippedCount: Number(data.skippedCount || 0),
          duplicatesCount: Number(data.duplicatesCount || 0),
          errorsCount: Number(data.errorsCount || 0),
          status: data.status || 'completed',
          conflictResolution: data.conflictResolution,
          errorLog: Array.isArray(data.errorLog) ? data.errorLog : [],
          createdAt: timestampToIso(data.createdAt),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  // --- CONFIGURACIÓN DE WORKSPACE ---

  async getWorkspaceSettings(workspaceId: string): Promise<BusinessSettings> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}`;
    try {
      const snap = await getDoc(doc(firestore, 'workspaces', workspaceId));
      if (!snap.exists()) {
        throw new CloudOperationError(
          'unauthorized',
          'Workspace no encontrado o sin acceso en Firestore.'
        );
      }

      const data = snap.data();
      const prefs = data.settingsJson || {};
      return {
        businessName: data.name || 'Mi Negocio Comercial',
        tagline: data.tagline || '',
        logoUrl: data.logoUrl || '',
        whatsappNumber: data.whatsappNumber || '',
        contactEmail: data.contactEmail || '',
        currency: (data.currency || 'COP') as SupportedCurrency,
        language: (data.language || 'es') as SupportedLanguage,
        theme: (data.theme || 'light') as ThemeMode,
        catalogPreferences: {
          showPrices: prefs.showPrices ?? true,
          showStock: prefs.showStock ?? false,
          defaultTemplate: prefs.defaultTemplate || 'editorial',
          allowDirectOrder: prefs.allowDirectOrder ?? true,
          includeQrCode: prefs.includeQrCode ?? true,
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    settings: Partial<BusinessSettings>
  ): Promise<void> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}`;
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (settings.businessName !== undefined) {
      payload.name = settings.businessName.trim().slice(0, 120) || 'Mi Negocio';
    }
    if (settings.tagline !== undefined) {
      payload.tagline = clampString(settings.tagline, 240);
    }
    if (settings.logoUrl !== undefined) {
      payload.logoUrl = clampString(settings.logoUrl, 1000);
    }
    if (settings.whatsappNumber !== undefined) {
      payload.whatsappNumber = String(settings.whatsappNumber || '').trim().slice(0, 32);
    }
    if (settings.contactEmail !== undefined) {
      payload.contactEmail = clampString(settings.contactEmail, 254);
    }
    if (settings.currency !== undefined) {
      payload.currency = settings.currency;
    }
    if (settings.language !== undefined) {
      payload.language = settings.language;
    }
    if (settings.theme !== undefined) {
      payload.theme = settings.theme;
    }
    if (settings.catalogPreferences !== undefined) {
      payload.settingsJson = settings.catalogPreferences;
    }

    try {
      await updateDoc(doc(firestore, 'workspaces', workspaceId), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  // --- ASOCIACIÓN DE IMÁGENES EN FIREBASE STORAGE + FIRESTORE ---

  async associateImages(
    workspaceId: string,
    candidates: CandidateImage[]
  ): Promise<{ matched: number; updated: number }> {
    this.ensureDb();
    let updatedCount = 0;
    const exactMatches = candidates.filter(
      (c) => (c.matchStatus === 'exact_match' || c.matchStatus === 'confirmed') && c.matchedProductId
    );

    if (exactMatches.length === 0) {
      return { matched: 0, updated: 0 };
    }

    for (const cand of exactMatches) {
      let imageUrl = cand.remoteUrl;

      if (cand.fileBlob) {
        const uploadRes = await uploadProductImageToStorage({
          file: cand.fileBlob,
          filename: cand.filename,
          workspaceId,
          ean: cand.eanExtracted,
        });
        imageUrl = uploadRes.publicUrl;
      }

      if (!imageUrl || imageUrl.startsWith('data:')) {
        throw new CloudOperationError(
          'persistence_error',
          `La imagen ${cand.filename} no tiene URL remota de Firebase Storage ni blob válido para subir.`
        );
      }

      await this.updateProduct(
        cand.matchedProductId!,
        {
          imageUrl,
          imageVerified: true,
          imageMatchStatus: 'confirmed',
        },
        workspaceId
      );
      updatedCount++;
    }

    return {
      matched: exactMatches.length,
      updated: updatedCount,
    };
  }

  // --- COLABORADORES, MEMBRESÍAS E INVITACIONES MULTI-TENANT ---

  async listUserMemberships(userId: string): Promise<UserMembership[]> {
    const firestore = this.ensureDb();
    const path = `users/${userId}/memberships`;
    try {
      const snap = await getDocs(collection(firestore, 'users', userId, 'memberships'));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          workspaceId: data.workspaceId || d.id,
          userId: data.userId || userId,
          workspaceName: data.workspaceName || 'Workspace Comercial',
          role: (data.role as WorkspaceRole) || 'member',
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async listPendingInvitationsForEmail(email: string): Promise<WorkspaceInvitation[]> {
    const firestore = this.ensureDb();
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) return [];

    const path = `invitations(email=${normalizedEmail})`;
    try {
      const q = query(
        collectionGroup(firestore, 'invitations'),
        where('email', '==', normalizedEmail),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          workspaceId: data.workspaceId,
          workspaceName: data.workspaceName || 'Workspace Comercial',
          ownerId: data.ownerId,
          email: data.email || normalizedEmail,
          role: (data.role === 'admin' ? 'admin' : 'member') as 'admin' | 'member',
          status: data.status || 'pending',
          invitedBy: data.invitedBy || '',
          acceptedBy: data.acceptedBy ?? undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/members`;
    try {
      const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'members'));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          workspaceId: data.workspaceId || workspaceId,
          userId: data.userId || d.id,
          role: (data.role as WorkspaceRole) || 'member',
          email: data.email ?? undefined,
          fullName: data.fullName ?? undefined,
          invitationId: data.invitationId ?? undefined,
          createdAt: timestampToIso(data.createdAt),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async listWorkspaceInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/invitations`;
    try {
      const q = query(
        collection(firestore, 'workspaces', workspaceId, 'invitations'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          workspaceId: data.workspaceId || workspaceId,
          workspaceName: data.workspaceName || 'Workspace Comercial',
          ownerId: data.ownerId || '',
          email: data.email || '',
          role: (data.role === 'admin' ? 'admin' : 'member') as 'admin' | 'member',
          status: data.status || 'pending',
          invitedBy: data.invitedBy || '',
          acceptedBy: data.acceptedBy ?? undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async createWorkspaceInvitation(options: {
    workspaceId: string;
    workspaceName: string;
    email: string;
    role: 'admin' | 'member';
  }): Promise<WorkspaceInvitation> {
    const firestore = this.ensureDb();
    const currentUid = auth?.currentUser?.uid;
    if (!currentUid || !auth?.currentUser?.emailVerified) {
      throw new CloudOperationError(
        'unauthorized',
        'Debes iniciar sesión con correo verificado para invitar colaboradores.'
      );
    }

    const cleanEmail = options.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length > 254) {
      throw new CloudOperationError(
        'persistence_error',
        'Ingresa un correo electrónico válido para enviar la invitación.'
      );
    }

    const ownerId = await this.resolveWorkspaceOwnerId(options.workspaceId);
    const invitationId = generateId('inv');
    const path = `workspaces/${options.workspaceId}/invitations/${invitationId}`;
    const wsName = (options.workspaceName || 'Mi Negocio Comercial').trim().slice(0, 120);
    const nowIso = new Date().toISOString();

    const payload = {
      id: invitationId,
      workspaceId: options.workspaceId,
      workspaceName: wsName,
      ownerId,
      email: cleanEmail,
      role: options.role,
      status: 'pending' as const,
      invitedBy: currentUid,
      acceptedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(
        doc(firestore, 'workspaces', options.workspaceId, 'invitations', invitationId),
        payload
      );
      return {
        id: invitationId,
        workspaceId: options.workspaceId,
        workspaceName: wsName,
        ownerId,
        email: cleanEmail,
        role: options.role,
        status: 'pending',
        invitedBy: currentUid,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async acceptWorkspaceInvitation(
    invitation: WorkspaceInvitation,
    fullName?: string
  ): Promise<void> {
    const firestore = this.ensureDb();
    const user = auth?.currentUser;
    if (!user || !user.emailVerified || !user.email) {
      throw new CloudOperationError(
        'unauthorized',
        'Se requiere una sesión con correo verificado para aceptar la invitación.'
      );
    }

    const uid = user.uid;
    const normalizedUserEmail = user.email.trim().toLowerCase();
    if (normalizedUserEmail !== invitation.email.trim().toLowerCase()) {
      throw new CloudOperationError(
        'unauthorized',
        `Esta invitación fue emitida para ${invitation.email} y no coincide con tu sesión actual.`
      );
    }

    const invRef = doc(firestore, 'workspaces', invitation.workspaceId, 'invitations', invitation.id);
    const memberRef = doc(firestore, 'workspaces', invitation.workspaceId, 'members', uid);
    const userMembershipRef = doc(firestore, 'users', uid, 'memberships', invitation.workspaceId);

    const displayName = (
      fullName ||
      user.displayName ||
      normalizedUserEmail.split('@')[0] ||
      'Colaborador'
    )
      .trim()
      .slice(0, 120);

    const batch = writeBatch(firestore);
    batch.update(invRef, {
      status: 'accepted',
      acceptedBy: uid,
      updatedAt: serverTimestamp(),
    });
    batch.set(memberRef, {
      id: uid,
      workspaceId: invitation.workspaceId,
      userId: uid,
      role: invitation.role,
      email: normalizedUserEmail,
      fullName: displayName,
      invitationId: invitation.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(userMembershipRef, {
      id: invitation.workspaceId,
      workspaceId: invitation.workspaceId,
      userId: uid,
      workspaceName: (invitation.workspaceName || 'Workspace Comercial').trim().slice(0, 120),
      role: invitation.role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `workspaces/${invitation.workspaceId}/invitations/${invitation.id}`
      );
    }
  }

  async revokeWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<void> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/invitations/${invitationId}`;
    try {
      await updateDoc(doc(firestore, 'workspaces', workspaceId, 'invitations', invitationId), {
        status: 'revoked',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async updateWorkspaceMemberRole(
    workspaceId: string,
    memberId: string,
    role: 'admin' | 'member',
    workspaceName?: string
  ): Promise<void> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/members/${memberId}`;
    const memberRef = doc(firestore, 'workspaces', workspaceId, 'members', memberId);
    const userMembershipRef = doc(firestore, 'users', memberId, 'memberships', workspaceId);

    try {
      const membershipSnap = await getDoc(userMembershipRef);
      const batch = writeBatch(firestore);
      batch.update(memberRef, {
        role,
        updatedAt: serverTimestamp(),
      });
      if (membershipSnap.exists()) {
        batch.update(userMembershipRef, {
          role,
          ...(workspaceName ? { workspaceName: workspaceName.trim().slice(0, 120) } : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(userMembershipRef, {
          id: workspaceId,
          workspaceId,
          userId: memberId,
          workspaceName: (workspaceName || 'Workspace Comercial').trim().slice(0, 120),
          role,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
    const firestore = this.ensureDb();
    const path = `workspaces/${workspaceId}/members/${memberId}`;
    try {
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'workspaces', workspaceId, 'members', memberId));
      batch.delete(doc(firestore, 'users', memberId, 'memberships', workspaceId));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export const firebaseDataService = new FirebaseDataService();
