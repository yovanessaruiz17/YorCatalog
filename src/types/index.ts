/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProductStatus = 'active' | 'draft' | 'archived';

export type ImageMatchStatus =
  | 'exact_match'       // Coincidencia exacta por EAN
  | 'pending_review'     // Pendiente de revisión humana
  | 'no_image'           // Sin imagen asignada
  | 'invalid_image'      // Imagen inválida o dañada
  | 'confirmed';         // Asociación confirmada por operador

export interface Category {
  id: string;
  name: string;
  description?: string;
  productCount?: number;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  /**
   * EAN is treated strictly as string or null to preserve leading zeros.
   * EAN is NOT the database primary key.
   */
  ean: string | null;
  categoryId: string;
  categoryName?: string;
  brand?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  imageUrl?: string;
  imageVerified?: boolean;
  imageMatchStatus?: ImageMatchStatus;
  additionalImages?: string[];
  stock?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Catalog Types (Fase 3) ---

export type CatalogStatus = 'draft' | 'published' | 'archived';

export type CatalogTemplateId =
  | 'minimal'
  | 'editorial'
  | 'promotional'
  | 'category_grid';

export interface CatalogProductItem {
  productId: string;
  orderIndex: number;
  customTitle?: string;
  customPrice?: number;
  customDescription?: string;
  featured?: boolean;
  /**
   * Immutable snapshot of product data at catalog build/publish time
   */
  snapshot: Product;
}

export interface CatalogVisualSettings {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  gridColumns: 1 | 2 | 3 | 4;
  productsPerPage: number;
  cardSpacing: 'compact' | 'normal' | 'relaxed';
  showDescription: boolean;
  showBrand: boolean;
  showSku: boolean;
  showEan: boolean;
  showPrices: boolean;
  showDiscounts: boolean;
  showPageNumbers: boolean;
  headerText: string;
  footerText: string;
  groupByCategory: boolean;
  pageSize: 'a4' | 'magazine_letter';
  includeQrCode: boolean;
}

export interface CatalogPublishedSnapshot {
  version: number;
  publishedAt: string;
  products: CatalogProductItem[];
  visualSettings: CatalogVisualSettings;
  templateId: CatalogTemplateId;
  publicUrl: string;
}

export interface Catalog {
  id: string;
  internalName: string;
  title: string;
  subtitle?: string;
  slug: string;
  shareToken?: string;
  description?: string;
  status: CatalogStatus;
  version: number;
  itemsCount: number;
  coverImage?: string;
  logoUrl?: string;
  templateId: CatalogTemplateId;
  visualSettings: CatalogVisualSettings;
  products: CatalogProductItem[];
  publishedAt?: string;
  publishedUrl?: string;
  publishedSnapshot?: CatalogPublishedSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogTemplate {
  id: CatalogTemplateId;
  name: string;
  category: string;
  description: string;
  defaultSettings: Partial<CatalogVisualSettings>;
  badge: string;
  features: string[];
}

export interface ImportRecord {
  id: string;
  fileName: string;
  fileSize?: number;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  duplicatesCount: number;
  errorsCount: number;
  status: 'completed' | 'failed' | 'pending';
  conflictResolution?: ImportConflictResolution;
  errorLog?: string[];
  createdAt: string;
}

export type OrderStatus = 'whatsapp_opened' | 'pending_whatsapp' | 'prepared' | 'confirmed' | 'cancelled';

export interface OrderItem {
  productId: string;
  sku: string;
  ean: string | null;
  name: string;
  price: number;
  compareAtPrice?: number;
  quantity: number;
  subtotal: number;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  catalogId?: string;
  catalogTitle?: string;
  catalogVersion?: number;
  customerName: string;
  customerPhone?: string;
  customerCity?: string;
  customerAddress?: string;
  items: OrderItem[];
  itemsCount: number;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  notes?: string;
  whatsappUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  ean: string | null;
  name: string;
  price: number;
  compareAtPrice?: number;
  quantity: number;
  imageUrl?: string;
  currency: string;
  categoryName?: string;
}

export interface CustomerCheckoutData {
  name: string;
  phone?: string;
  city?: string;
  address?: string;
  notes?: string;
}

export type SupportedCurrency = 'COP' | 'USD' | 'EUR' | 'MXN';
export type SupportedLanguage = 'es' | 'en';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface CatalogPreferences {
  showPrices: boolean;
  showStock: boolean;
  defaultTemplate: string;
  allowDirectOrder: boolean;
  includeQrCode: boolean;
}

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  logoUrl?: string;
  whatsappNumber: string;
  contactEmail?: string;
  currency: SupportedCurrency;
  language: SupportedLanguage;
  theme: ThemeMode;
  catalogPreferences: CatalogPreferences;
}

// --- CSV Import & Validation Types (Fase 2) ---

export type ProductFieldKey =
  | 'name'
  | 'sku'
  | 'ean'
  | 'price'
  | 'compareAtPrice'
  | 'categoryId'
  | 'brand'
  | 'stock'
  | 'description'
  | 'imageUrl'
  | 'active';

export interface ColumnMapping {
  csvHeader: string;
  targetField: ProductFieldKey | 'ignore';
  sampleValues: string[];
}

export interface ParsedCSVRow {
  rowNumber: number;
  raw: Record<string, string>;
  mapped: {
    name?: string;
    sku?: string;
    ean?: string | null;
    price?: number;
    compareAtPrice?: number;
    category?: string;
    brand?: string;
    stock?: number;
    description?: string;
    imageUrl?: string;
    active?: boolean;
  };
  errors: string[];
  warnings: string[];
  status: 'valid' | 'warning' | 'error';
  isDuplicateInCSV?: boolean;
  existingProductId?: string;
  action?: 'create' | 'update' | 'skip';
}

export type ImportConflictResolution =
  | 'update_existing'
  | 'skip_existing'
  | 'create_new_sku';

export interface ImportOptions {
  conflictResolution: ImportConflictResolution;
  updatePrices: boolean;
  updateImages: boolean;
  updateStock: boolean;
  defaultCategory: string;
}

export interface ParsedCSVResult {
  headers: string[];
  rows: ParsedCSVRow[];
  totalRows: number;
  validRowsCount: number;
  warningRowsCount: number;
  errorRowsCount: number;
  duplicatesCount: number;
  existingMatchCount: number;
  delimiter: string;
}

// --- Image Association Types (Fase 2) ---

export interface CandidateImage {
  id: string;
  filename: string;
  cleanName: string;
  extension: string;
  eanExtracted: string | null;
  dataUrl: string;
  sizeBytes: number;
  matchedProductId?: string;
  matchStatus: ImageMatchStatus;
  ambiguousMatches?: string[];
}

// --- Service Contracts ---

export interface IProductService {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | undefined>;
  filter(query: {
    search?: string;
    category?: string;
    active?: boolean;
    hasImage?: boolean;
    imageStatus?: ImageMatchStatus;
  }): Promise<Product[]>;
  create(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product>;
  update(id: string, updates: Partial<Product>): Promise<Product>;
  delete(id: string): Promise<boolean>;
  bulkDelete(ids: string[]): Promise<number>;
  bulkUpdateStatus(ids: string[], active: boolean): Promise<number>;
  bulkUpdateCategory(ids: string[], categoryId: string, categoryName: string): Promise<number>;
  getCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  importProducts(
    rows: ParsedCSVRow[],
    options: ImportOptions,
    fileName: string,
    onProgress?: (percent: number, current: number, total: number) => void
  ): Promise<ImportRecord>;
  associateImages(candidates: CandidateImage[]): Promise<{ matched: number; updated: number }>;
}

export interface ICatalogService {
  getCatalogs(): Promise<Catalog[]>;
  getCatalogById(id: string): Promise<Catalog | undefined>;
  getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined>;
  getPublishedCatalogs(): Promise<Catalog[]>;
  createCatalog(catalog: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>): Promise<Catalog>;
  updateCatalog(id: string, updates: Partial<Catalog>): Promise<Catalog>;
  duplicateCatalog(id: string): Promise<Catalog>;
  deleteCatalog(id: string): Promise<boolean>;
  publishCatalog(id: string): Promise<Catalog>;
  unpublishCatalog(id: string): Promise<Catalog>;
}

export interface IImportService {
  getHistory(): Promise<ImportRecord[]>;
  addRecord(record: ImportRecord): Promise<void>;
}

export interface IOrderService {
  getOrders(): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | undefined>;
  createOrder(order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>): Promise<Order>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;
  deleteOrder(id: string): Promise<boolean>;
}

export interface ISettingsService {
  getSettings(): Promise<BusinessSettings>;
  saveSettings(settings: BusinessSettings): Promise<void>;
}

// --- Multi-Tenant & Auth Types (Fase 5) ---

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logoUrl?: string;
  whatsappNumber: string;
  contactEmail?: string;
  currency: SupportedCurrency;
  language: SupportedLanguage;
  theme: ThemeMode;
  customDomain?: string;
  settingsJson?: CatalogPreferences;
  createdAt?: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  profile?: Profile;
}

