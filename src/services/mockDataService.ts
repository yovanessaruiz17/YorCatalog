/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ADAPTADOR DE DATOS Y PERSISTENCIA DE DESARROLLO (FASE 2)
 * Proporciona persistencia local en memoria y sincronización con localStorage para pruebas
 * continuas sin pérdida de datos en recargas. Implementa todos los contratos de servicio:
 * IProductService, ICatalogService, IImportService e IOrderService.
 * Está claramente identificado como adaptador de desarrollo, listo para reemplazo por Supabase en Fase 5.
 */

import {
  Product,
  Category,
  Catalog,
  ImportRecord,
  Order,
  OrderStatus,
  IProductService,
  ICatalogService,
  IImportService,
  IOrderService,
  ProductStatus,
  ParsedCSVRow,
  ImportOptions,
  CandidateImage,
  ImageMatchStatus,
} from '../types';

export const IS_DEMO_ADAPTER = true;

const STORAGE_KEY_PRODUCTS = 'yorcatalog_dev_products_v2';
const STORAGE_KEY_CATEGORIES = 'yorcatalog_dev_categories_v2';
const STORAGE_KEY_IMPORTS = 'yorcatalog_dev_imports_v2';
const STORAGE_KEY_CATALOGS = 'yorcatalog_dev_catalogs_v3';
const STORAGE_KEY_ORDERS = 'yorcatalog_dev_orders_v4';

const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-gourmet', name: 'Gourmet', description: 'Cafés de especialidad y alimentos artesanales' },
  { id: 'cat-accesorios', name: 'Accesorios', description: 'Equipamiento de barismo y cafetería' },
  { id: 'cat-infusiones', name: 'Infusiones', description: 'Tés y mezclas botánicas' },
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    sku: 'YOR-CAFE-01',
    ean: '0770200100456', // Treated strictly as string, preserving leading zero
    name: 'Café Especial Geisha Huila 340g',
    description: 'Café de origen premium cultivado a 1.850 msnm. Notas florales a jazmín, melocotón y miel de caña.',
    categoryId: 'cat-gourmet',
    categoryName: 'Gourmet',
    brand: 'Finca El Paraíso',
    price: 48000,
    compareAtPrice: 55000,
    currency: 'COP',
    stock: 24,
    imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
    imageVerified: true,
    imageMatchStatus: 'confirmed',
    active: true,
    createdAt: '2026-10-15T09:30:00Z',
    updatedAt: '2026-10-20T14:15:00Z',
  },
  {
    id: 'prod-002',
    sku: 'YOR-ACC-02',
    ean: '0770200100789',
    name: 'Prensa Francesa Acero Mate 600ml',
    description: 'Estructura en acero inoxidable de doble pared con émbolo de microfiltro de alta precisión.',
    categoryId: 'cat-accesorios',
    categoryName: 'Accesorios',
    brand: 'Barista Lab',
    price: 89000,
    compareAtPrice: 99000,
    currency: 'COP',
    stock: 12,
    imageUrl: 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=600&auto=format&fit=crop&q=80',
    imageVerified: true,
    imageMatchStatus: 'confirmed',
    active: true,
    createdAt: '2026-10-16T11:20:00Z',
    updatedAt: '2026-10-21T10:00:00Z',
  },
  {
    id: 'prod-003',
    sku: 'YOR-CAFE-03',
    ean: '0770200100912',
    name: 'Café Tueste Medio Nariño 500g',
    description: 'Cuerpo balanceado con acidez cítrica brillante y notas de chocolate semiamargo y panela.',
    categoryId: 'cat-gourmet',
    categoryName: 'Gourmet',
    brand: 'Origen Andino',
    price: 38500,
    currency: 'COP',
    stock: 45,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    imageVerified: true,
    imageMatchStatus: 'confirmed',
    active: true,
    createdAt: '2026-10-18T16:00:00Z',
    updatedAt: '2026-10-22T08:30:00Z',
  },
  {
    id: 'prod-004',
    sku: 'YOR-TEA-04',
    ean: '0770200101148',
    name: 'Infusión Botánica Lavanda & Manzanilla',
    description: 'Mezcla relajante 100% natural libre de teína en pirámides biodegradables. 20 unidades.',
    categoryId: 'cat-infusiones',
    categoryName: 'Infusiones',
    brand: 'Herbal Zen',
    price: 26000,
    compareAtPrice: 30000,
    currency: 'COP',
    stock: 18,
    imageUrl: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&auto=format&fit=crop&q=80',
    imageVerified: true,
    imageMatchStatus: 'confirmed',
    active: true,
    createdAt: '2026-10-19T13:45:00Z',
    updatedAt: '2026-10-23T11:10:00Z',
  },
  {
    id: 'prod-005',
    sku: 'YOR-ACC-05',
    ean: '0770200101566',
    name: 'Molinillo Manual Muelas Cerámicas',
    description: 'Ajuste micrométrico para espresso, moka, prensa francesa y métodos de goteo.',
    categoryId: 'cat-accesorios',
    categoryName: 'Accesorios',
    brand: 'Barista Lab',
    price: 115000,
    currency: 'COP',
    stock: 8,
    imageUrl: undefined,
    imageVerified: false,
    imageMatchStatus: 'no_image',
    active: false, // Inactive/Draft
    createdAt: '2026-10-20T17:10:00Z',
    updatedAt: '2026-10-24T09:20:00Z',
  },
  {
    id: 'prod-006',
    sku: 'YOR-SWEET-06',
    ean: '0770200101887',
    name: 'Chocolatina Fina 70% Cacao Tumaco',
    description: 'Tableta artesanal premiada con notas de frutos rojos y aroma persistente.',
    categoryId: 'cat-gourmet',
    categoryName: 'Gourmet',
    brand: 'Cacao Ancestral',
    price: 16500,
    currency: 'COP',
    stock: 50,
    imageUrl: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=600&auto=format&fit=crop&q=80',
    imageVerified: false,
    imageMatchStatus: 'pending_review',
    active: true,
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-25T15:40:00Z',
  },
  {
    id: 'prod-007',
    sku: 'YOR-MUG-07',
    ean: '0770200102006',
    name: 'Taza Cerámica Hecha a Mano 300ml',
    description: 'Esmaltada en tono verde salvia con arcilla refractaria local.',
    categoryId: 'cat-accesorios',
    categoryName: 'Accesorios',
    brand: 'Artesanías Andinas',
    price: 34000,
    currency: 'COP',
    stock: 15,
    imageUrl: undefined,
    imageVerified: false,
    imageMatchStatus: 'no_image',
    active: true,
    createdAt: '2026-10-22T08:15:00Z',
    updatedAt: '2026-10-22T08:15:00Z',
  },
];

const INITIAL_CATALOGS: Catalog[] = [
  {
    id: 'cat-01',
    internalName: 'Temporada Fin de Año 2026',
    title: 'Catálogo Temporada Fin de Año 2026',
    subtitle: 'Edición Gourmet & Cafés de Especialidad',
    slug: 'temporada-fin-ano-2026',
    description: 'Selección exclusiva de cafés de especialidad, estuches de regalo y accesorios artesanales para barismo.',
    status: 'published',
    version: 2,
    itemsCount: 4,
    coverImage: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
    templateId: 'editorial',
    visualSettings: {
      primaryColor: '#1e1b4b',
      secondaryColor: '#d97706',
      fontFamily: 'serif',
      gridColumns: 2,
      productsPerPage: 4,
      cardSpacing: 'relaxed',
      showDescription: true,
      showBrand: true,
      showSku: true,
      showEan: true,
      showPrices: true,
      showDiscounts: true,
      showPageNumbers: true,
      headerText: 'Edición Exclusiva Gourmet',
      footerText: 'YorCatalog Folio Edition',
      groupByCategory: false,
      pageSize: 'a4',
      includeQrCode: true,
    },
    products: [
      {
        productId: 'prod-001',
        orderIndex: 0,
        featured: true,
        snapshot: INITIAL_PRODUCTS[0],
      },
      {
        productId: 'prod-002',
        orderIndex: 1,
        snapshot: INITIAL_PRODUCTS[1],
      },
      {
        productId: 'prod-003',
        orderIndex: 2,
        snapshot: INITIAL_PRODUCTS[2],
      },
      {
        productId: 'prod-004',
        orderIndex: 3,
        snapshot: INITIAL_PRODUCTS[3],
      },
    ],
    publishedAt: '2026-10-24T18:00:00Z',
    shareToken: 'pub_gourmet_2026',
    publishedUrl: typeof window !== 'undefined' ? `${window.location.origin}/m/pub_gourmet_2026` : 'https://yorcatalog.app/m/pub_gourmet_2026',
    publishedSnapshot: {
      version: 2,
      publishedAt: '2026-10-24T18:00:00Z',
      products: [
        { productId: 'prod-001', orderIndex: 0, featured: true, snapshot: INITIAL_PRODUCTS[0] },
        { productId: 'prod-002', orderIndex: 1, snapshot: INITIAL_PRODUCTS[1] },
        { productId: 'prod-003', orderIndex: 2, snapshot: INITIAL_PRODUCTS[2] },
        { productId: 'prod-004', orderIndex: 3, snapshot: INITIAL_PRODUCTS[3] },
      ],
      visualSettings: {
        primaryColor: '#1e1b4b',
        secondaryColor: '#d97706',
        fontFamily: 'serif',
        gridColumns: 2,
        productsPerPage: 4,
        cardSpacing: 'relaxed',
        showDescription: true,
        showBrand: true,
        showSku: true,
        showEan: true,
        showPrices: true,
        showDiscounts: true,
        showPageNumbers: true,
        headerText: 'Edición Exclusiva Gourmet',
        footerText: 'YorCatalog Folio Edition',
        groupByCategory: false,
        pageSize: 'a4',
        includeQrCode: true,
      },
      templateId: 'editorial',
      publicUrl: typeof window !== 'undefined' ? `${window.location.origin}/m/pub_gourmet_2026` : 'https://yorcatalog.app/m/pub_gourmet_2026',
    },
    createdAt: '2026-10-24T10:00:00Z',
    updatedAt: '2026-10-24T18:00:00Z',
  },
  {
    id: 'cat-02',
    internalName: 'Colección Mayorista B2B',
    title: 'Colección Mayorista & Barismo',
    subtitle: 'Línea de Suministros para Cafeterías',
    slug: 'coleccion-mayorista-barismo',
    description: 'Línea institucional de suministros para cafeterías y clientes corporativos con precios preferenciales.',
    status: 'draft',
    version: 1,
    itemsCount: 3,
    coverImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop&q=80',
    templateId: 'minimal',
    visualSettings: {
      primaryColor: '#0f172a',
      secondaryColor: '#059669',
      fontFamily: 'sans',
      gridColumns: 2,
      productsPerPage: 4,
      cardSpacing: 'normal',
      showDescription: true,
      showBrand: false,
      showSku: true,
      showEan: true,
      showPrices: true,
      showDiscounts: false,
      showPageNumbers: true,
      headerText: 'Catálogo Institucional B2B',
      footerText: 'Suministros directos de cafetería',
      groupByCategory: false,
      pageSize: 'a4',
      includeQrCode: false,
    },
    products: [
      {
        productId: 'prod-001',
        orderIndex: 0,
        snapshot: INITIAL_PRODUCTS[0],
      },
      {
        productId: 'prod-002',
        orderIndex: 1,
        snapshot: INITIAL_PRODUCTS[1],
      },
      {
        productId: 'prod-006',
        orderIndex: 2,
        snapshot: INITIAL_PRODUCTS[5],
      },
    ],
    createdAt: '2026-10-25T11:20:00Z',
    updatedAt: '2026-10-25T11:20:00Z',
  },
];

const INITIAL_IMPORTS: ImportRecord[] = [
  {
    id: 'imp-01',
    fileName: 'inventario_inicial_octubre.csv',
    fileSize: 4520,
    totalRows: 7,
    importedCount: 7,
    updatedCount: 0,
    skippedCount: 0,
    duplicatesCount: 0,
    errorsCount: 0,
    status: 'completed',
    conflictResolution: 'update_existing',
    createdAt: '2026-10-15T09:00:00Z',
  },
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-01',
    orderNumber: 'PED-2026-0041',
    catalogId: 'cat-01',
    catalogTitle: 'Catálogo Temporada Fin de Año 2026',
    catalogVersion: 2,
    customerName: 'Carolina Morales',
    customerPhone: '+573001234567',
    customerCity: 'Bogotá D.C.',
    customerAddress: 'Calle 93 # 12-45 Apto 402',
    items: [
      {
        productId: 'prod-001',
        sku: 'YOR-CAFE-01',
        ean: '0770200100456',
        name: 'Café Especial Geisha Huila 340g',
        price: 48000,
        quantity: 2,
        subtotal: 96000,
        imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=200&auto=format&fit=crop&q=80',
      },
      {
        productId: 'prod-002',
        sku: 'YOR-ACC-02',
        ean: '0770200100789',
        name: 'Prensa Francesa Acero Mate 600ml',
        price: 89000,
        quantity: 1,
        subtotal: 89000,
        imageUrl: 'https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=200&auto=format&fit=crop&q=80',
      },
    ],
    itemsCount: 3,
    totalAmount: 185000,
    currency: 'COP',
    status: 'prepared',
    notes: 'Por favor incluir bolsa de regalo y tarjeta.',
    createdAt: '2026-10-26T11:15:00Z',
    updatedAt: '2026-10-26T11:15:00Z',
  },
  {
    id: 'ord-02',
    orderNumber: 'PED-2026-0042',
    catalogId: 'cat-01',
    catalogTitle: 'Catálogo Temporada Fin de Año 2026',
    catalogVersion: 2,
    customerName: 'Santiago Vélez',
    customerPhone: '+573159876543',
    customerCity: 'Medellín',
    customerAddress: 'Carrera 43A # 1Sur-220',
    items: [
      {
        productId: 'prod-003',
        sku: 'YOR-CAFE-03',
        ean: '0770200100912',
        name: 'Café Tueste Medio Nariño 500g',
        price: 38500,
        quantity: 3,
        subtotal: 115500,
        imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop&q=80',
      },
    ],
    itemsCount: 3,
    totalAmount: 115500,
    currency: 'COP',
    status: 'whatsapp_opened',
    notes: 'Confirmar si tienen disponibilidad para entrega inmediata.',
    createdAt: '2026-10-26T14:30:00Z',
    updatedAt: '2026-10-26T14:30:00Z',
  },
];

export class MockDataService implements IProductService, ICatalogService, IImportService, IOrderService {
  private products: Product[] = [];
  private categories: Category[] = [];
  private catalogs: Catalog[] = [...INITIAL_CATALOGS];
  private imports: ImportRecord[] = [];
  private orders: Order[] = [...INITIAL_ORDERS];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedProds = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY_PRODUCTS);
      if (storedProds) {
        this.products = JSON.parse(storedProds);
      } else {
        this.products = [...INITIAL_PRODUCTS];
        this.saveProductsToStorage();
      }

      const storedCategories = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (storedCategories) {
        this.categories = JSON.parse(storedCategories);
      } else {
        this.categories = [...INITIAL_CATEGORIES];
        this.saveCategoriesToStorage();
      }

      const storedImps = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY_IMPORTS);
      if (storedImps) {
        this.imports = JSON.parse(storedImps);
      } else {
        this.imports = [...INITIAL_IMPORTS];
      }

      const storedCatalogs = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY_CATALOGS);
      if (storedCatalogs) {
        this.catalogs = JSON.parse(storedCatalogs);
      } else {
        this.catalogs = [...INITIAL_CATALOGS];
        this.saveCatalogsToStorage();
      }

      const storedOrders = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY_ORDERS);
      if (storedOrders) {
        this.orders = JSON.parse(storedOrders);
      } else {
        this.orders = [...INITIAL_ORDERS];
        this.saveOrdersToStorage();
      }
    } catch {
      this.products = [...INITIAL_PRODUCTS];
      this.categories = [...INITIAL_CATEGORIES];
      this.imports = [...INITIAL_IMPORTS];
      this.catalogs = [...INITIAL_CATALOGS];
      this.orders = [...INITIAL_ORDERS];
    }
  }

  private saveProductsToStorage() {
    try {
      typeof localStorage !== "undefined" && localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(this.products));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage (límite de cuota alcanzado)', e);
    }
  }

  private saveCategoriesToStorage() {
    try {
      typeof localStorage !== "undefined" && localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(this.categories));
    } catch (e) {
      console.warn('No se pudo guardar categorías en localStorage', e);
    }
  }

  private saveImportsToStorage() {
    try {
      typeof localStorage !== "undefined" && localStorage.setItem(STORAGE_KEY_IMPORTS, JSON.stringify(this.imports));
    } catch (e) {
      console.warn('No se pudo guardar importaciones en localStorage', e);
    }
  }

  private saveCatalogsToStorage() {
    try {
      typeof localStorage !== "undefined" && localStorage.setItem(STORAGE_KEY_CATALOGS, JSON.stringify(this.catalogs));
    } catch (e) {
      console.warn('No se pudo guardar catálogos en localStorage', e);
    }
  }

  private saveOrdersToStorage() {
    try {
      typeof localStorage !== "undefined" && localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(this.orders));
    } catch (e) {
      console.warn('No se pudo guardar pedidos en localStorage', e);
    }
  }

  // --- IProductService Methods ---

  async getAll(): Promise<Product[]> {
    return [...this.products];
  }

  async getById(id: string): Promise<Product | undefined> {
    return this.products.find((p) => p.id === id);
  }

  async filter(query: {
    search?: string;
    category?: string;
    active?: boolean;
    hasImage?: boolean;
    imageStatus?: ImageMatchStatus;
  }): Promise<Product[]> {
    return this.products.filter((p) => {
      if (query.search) {
        const s = query.search.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(s);
        const matchSku = p.sku.toLowerCase().includes(s);
        const matchEan = p.ean ? p.ean.toLowerCase().includes(s) : false;
        const matchBrand = p.brand ? p.brand.toLowerCase().includes(s) : false;
        if (!matchName && !matchSku && !matchEan && !matchBrand) return false;
      }

      if (query.category && query.category !== 'all') {
        if (p.categoryId !== query.category && p.categoryName !== query.category) {
          return false;
        }
      }

      if (query.active !== undefined && p.active !== query.active) {
        return false;
      }

      if (query.hasImage !== undefined) {
        const hasImg = Boolean(p.imageUrl);
        if (query.hasImage !== hasImg) return false;
      }

      if (query.imageStatus && p.imageMatchStatus !== query.imageStatus) {
        return false;
      }

      return true;
    });
  }

  async create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    // Check SKU duplicate
    const skuLower = data.sku.toLowerCase().trim();
    if (this.products.some((p) => p.sku.toLowerCase().trim() === skuLower)) {
      throw new Error(`Ya existe un producto con el SKU "${data.sku}".`);
    }

    const now = new Date().toISOString();
    const newProduct: Product = {
      ...data,
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.products.unshift(newProduct);
    this.saveProductsToStorage();
    return newProduct;
  }

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Producto con ID ${id} no encontrado.`);
    }

    // If changing SKU, check uniqueness
    if (updates.sku) {
      const skuLower = updates.sku.toLowerCase().trim();
      const existing = this.products.find((p) => p.id !== id && p.sku.toLowerCase().trim() === skuLower);
      if (existing) {
        throw new Error(`El SKU "${updates.sku}" ya está en uso por otro producto.`);
      }
    }

    const updated = {
      ...this.products[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.products[idx] = updated;
    this.saveProductsToStorage();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const initialLen = this.products.length;
    this.products = this.products.filter((p) => p.id !== id);
    const deleted = this.products.length < initialLen;
    if (deleted) {
      this.saveProductsToStorage();
    }
    return deleted;
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const idSet = new Set(ids);
    const before = this.products.length;
    this.products = this.products.filter((p) => !idSet.has(p.id));
    const count = before - this.products.length;
    if (count > 0) {
      this.saveProductsToStorage();
    }
    return count;
  }

  async bulkUpdateStatus(ids: string[], active: boolean): Promise<number> {
    const idSet = new Set(ids);
    let count = 0;
    const now = new Date().toISOString();

    this.products = this.products.map((p) => {
      if (idSet.has(p.id)) {
        count++;
        return { ...p, active, updatedAt: now };
      }
      return p;
    });

    if (count > 0) {
      this.saveProductsToStorage();
    }
    return count;
  }

  async bulkUpdateCategory(ids: string[], categoryId: string, categoryName: string): Promise<number> {
    const idSet = new Set(ids);
    let count = 0;
    const now = new Date().toISOString();

    this.products = this.products.map((p) => {
      if (idSet.has(p.id)) {
        count++;
        return { ...p, categoryId, categoryName, updatedAt: now };
      }
      return p;
    });

    if (count > 0) {
      this.saveProductsToStorage();
    }
    return count;
  }

  async getCategories(): Promise<Category[]> {
    // Count products per category
    return this.categories.map((c) => ({
      ...c,
      productCount: this.products.filter((p) => p.categoryId === c.id || p.categoryName === c.name).length,
    }));
  }

  async createCategory(name: string): Promise<Category> {
    const trimmed = name.trim();
    const existing = this.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: trimmed,
      productCount: 0,
    };
    this.categories.push(newCat);
    this.saveCategoriesToStorage();
    return newCat;
  }

  // --- CSV Import Execution ---

  async importProducts(
    rows: ParsedCSVRow[],
    options: ImportOptions,
    fileName: string,
    onProgress?: (percent: number, current: number, total: number) => void
  ): Promise<ImportRecord> {
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    const errorLog: string[] = [];
    const total = rows.length;
    const now = new Date().toISOString();

    // Map existing products by SKU (case insensitive)
    const existingMap = new Map<string, Product>();
    for (const p of this.products) {
      existingMap.set(p.sku.toLowerCase().trim(), p);
    }

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      if (onProgress && i % 5 === 0) {
        onProgress(Math.round(((i + 1) / total) * 100), i + 1, total);
      }

      // If row has validation errors, log and skip
      if (row.status === 'error' || !row.mapped.name || !row.mapped.sku || row.mapped.price === undefined) {
        errorsCount++;
        errorLog.push(`Fila ${row.rowNumber} omitida por errores: ${row.errors.join(', ')}`);
        continue;
      }

      const skuKey = row.mapped.sku.toLowerCase().trim();
      const existing = existingMap.get(skuKey);

      // Category resolution
      let catName = row.mapped.category || options.defaultCategory || 'General';
      let matchedCat = this.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      if (!matchedCat) {
        matchedCat = await this.createCategory(catName);
      }

      if (existing) {
        // Conflict resolution
        if (options.conflictResolution === 'skip_existing') {
          skippedCount++;
          continue;
        }

        if (options.conflictResolution === 'create_new_sku') {
          // Generate derivative SKU
          const newSku = `${row.mapped.sku}-N`;
          const newProd: Product = {
            id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: row.mapped.name,
            sku: newSku,
            ean: row.mapped.ean || null,
            categoryId: matchedCat.id,
            categoryName: matchedCat.name,
            brand: row.mapped.brand || existing.brand,
            price: row.mapped.price,
            compareAtPrice: row.mapped.compareAtPrice,
            currency: 'COP',
            stock: row.mapped.stock !== undefined ? row.mapped.stock : 0,
            description: row.mapped.description || '',
            imageUrl: row.mapped.imageUrl,
            imageVerified: false,
            imageMatchStatus: row.mapped.imageUrl ? 'pending_review' : 'no_image',
            active: row.mapped.active !== undefined ? row.mapped.active : true,
            createdAt: now,
            updatedAt: now,
          };
          this.products.unshift(newProd);
          existingMap.set(newSku.toLowerCase().trim(), newProd);
          importedCount++;
          continue;
        }

        // Default: update_existing
        const updatedProduct: Product = {
          ...existing,
          name: row.mapped.name,
          ean: row.mapped.ean !== undefined ? row.mapped.ean : existing.ean,
          categoryId: matchedCat.id,
          categoryName: matchedCat.name,
          brand: row.mapped.brand || existing.brand,
          price: options.updatePrices ? row.mapped.price : existing.price,
          compareAtPrice: options.updatePrices
            ? row.mapped.compareAtPrice !== undefined
              ? row.mapped.compareAtPrice
              : existing.compareAtPrice
            : existing.compareAtPrice,
          stock: options.updateStock && row.mapped.stock !== undefined ? row.mapped.stock : existing.stock,
          description: row.mapped.description || existing.description,
          imageUrl: options.updateImages && row.mapped.imageUrl ? row.mapped.imageUrl : existing.imageUrl,
          active: row.mapped.active !== undefined ? row.mapped.active : existing.active,
          updatedAt: now,
        };

        const idx = this.products.findIndex((p) => p.id === existing.id);
        if (idx !== -1) {
          this.products[idx] = updatedProduct;
          existingMap.set(skuKey, updatedProduct);
          updatedCount++;
        }
      } else {
        // Create brand new product
        const newProd: Product = {
          id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: row.mapped.name,
          sku: row.mapped.sku,
          ean: row.mapped.ean || null,
          categoryId: matchedCat.id,
          categoryName: matchedCat.name,
          brand: row.mapped.brand || '',
          price: row.mapped.price,
          compareAtPrice: row.mapped.compareAtPrice,
          currency: 'COP',
          stock: row.mapped.stock !== undefined ? row.mapped.stock : 0,
          description: row.mapped.description || '',
          imageUrl: row.mapped.imageUrl,
          imageVerified: false,
          imageMatchStatus: row.mapped.imageUrl ? 'pending_review' : 'no_image',
          active: row.mapped.active !== undefined ? row.mapped.active : true,
          createdAt: now,
          updatedAt: now,
        };

        this.products.unshift(newProd);
        existingMap.set(skuKey, newProd);
        importedCount++;
      }
    }

    if (onProgress) {
      onProgress(100, total, total);
    }

    this.saveProductsToStorage();

    // Register import record
    const record: ImportRecord = {
      id: `imp-${Date.now()}`,
      fileName,
      totalRows: total,
      importedCount,
      updatedCount,
      skippedCount,
      duplicatesCount: rows.filter((r) => r.isDuplicateInCSV).length,
      errorsCount,
      status: errorsCount === total ? 'failed' : 'completed',
      conflictResolution: options.conflictResolution,
      errorLog,
      createdAt: now,
    };

    this.imports.unshift(record);
    this.saveImportsToStorage();
    return record;
  }

  // --- Image Association Execution ---

  async associateImages(candidates: CandidateImage[]): Promise<{ matched: number; updated: number }> {
    let matched = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const cand of candidates) {
      if (!cand.matchedProductId || cand.matchStatus === 'invalid_image' || cand.matchStatus === 'no_image') {
        continue;
      }

      matched++;
      const prodIdx = this.products.findIndex((p) => p.id === cand.matchedProductId);
      if (prodIdx !== -1) {
        this.products[prodIdx] = {
          ...this.products[prodIdx],
          imageUrl: cand.dataUrl,
          imageVerified: true,
          imageMatchStatus: 'confirmed',
          updatedAt: now,
        };
        updated++;
      }
    }

    if (updated > 0) {
      this.saveProductsToStorage();
    }

    return { matched, updated };
  }

  // --- ICatalogService Methods ---
  async getCatalogs(): Promise<Catalog[]> {
    return [...this.catalogs];
  }

  async getCatalogById(id: string): Promise<Catalog | undefined> {
    return this.catalogs.find((c) => c.id === id);
  }

  async createCatalog(data: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>): Promise<Catalog> {
    const now = new Date().toISOString();
    const newCatalog: Catalog = {
      ...data,
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      itemsCount: data.products.length,
      createdAt: now,
      updatedAt: now,
    };

    this.catalogs.unshift(newCatalog);
    this.saveCatalogsToStorage();
    return newCatalog;
  }

  async updateCatalog(id: string, updates: Partial<Catalog>): Promise<Catalog> {
    const idx = this.catalogs.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error(`Catálogo con ID ${id} no encontrado.`);
    }

    const updated: Catalog = {
      ...this.catalogs[idx],
      ...updates,
      itemsCount: updates.products ? updates.products.length : this.catalogs[idx].itemsCount,
      updatedAt: new Date().toISOString(),
    };

    this.catalogs[idx] = updated;
    this.saveCatalogsToStorage();
    return updated;
  }

  async duplicateCatalog(id: string): Promise<Catalog> {
    const original = this.catalogs.find((c) => c.id === id);
    if (!original) {
      throw new Error(`Catálogo con ID ${id} no encontrado.`);
    }

    const now = new Date().toISOString();
    const duplicated: Catalog = {
      ...original,
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      internalName: `${original.internalName} (Copia)`,
      title: `${original.title} (Copia)`,
      slug: `${original.slug}-copia-${Date.now().toString().slice(-4)}`,
      status: 'draft',
      version: 1,
      publishedAt: undefined,
      publishedUrl: undefined,
      publishedSnapshot: undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.catalogs.unshift(duplicated);
    this.saveCatalogsToStorage();
    return duplicated;
  }

  async deleteCatalog(id: string): Promise<boolean> {
    const initialLen = this.catalogs.length;
    this.catalogs = this.catalogs.filter((c) => c.id !== id);
    const deleted = this.catalogs.length < initialLen;
    if (deleted) {
      this.saveCatalogsToStorage();
    }
    return deleted;
  }

  async publishCatalog(id: string): Promise<Catalog> {
    const idx = this.catalogs.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error(`Catálogo con ID ${id} no encontrado.`);
    }

    const cat = this.catalogs[idx];
    const now = new Date().toISOString();
    const newVersion = (cat.version || 1) + 1;
    
    // Generar token público único y no predecible
    const token = cat.shareToken || `pub_${Math.random().toString(36).substring(2, 8)}${Math.random().toString(36).substring(2, 8)}`;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yorcatalog.app';
    const publicUrl = `${baseUrl}/m/${token}`;

    const published: Catalog = {
      ...cat,
      status: 'published',
      version: newVersion,
      shareToken: token,
      publishedAt: now,
      publishedUrl: publicUrl,
      publishedSnapshot: {
        version: newVersion,
        publishedAt: now,
        products: JSON.parse(JSON.stringify(cat.products)),
        visualSettings: JSON.parse(JSON.stringify(cat.visualSettings)),
        templateId: cat.templateId,
        publicUrl,
      },
      updatedAt: now,
    };

    this.catalogs[idx] = published;
    this.saveCatalogsToStorage();
    return published;
  }

  async unpublishCatalog(id: string): Promise<Catalog> {
    const idx = this.catalogs.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error(`Catálogo con ID ${id} no encontrado.`);
    }

    const cat = this.catalogs[idx];
    const now = new Date().toISOString();

    const unpublished: Catalog = {
      ...cat,
      status: 'draft',
      publishedAt: undefined,
      publishedUrl: undefined,
      shareToken: undefined,
      publishedSnapshot: undefined,
      updatedAt: now,
    };

    this.catalogs[idx] = unpublished;
    this.saveCatalogsToStorage();
    return unpublished;
  }

  async getByShareToken(tokenOrSlug: string): Promise<Catalog | undefined> {
    if (!tokenOrSlug) return undefined;
    const clean = tokenOrSlug.trim().toLowerCase();
    return this.catalogs.find(
      (c) =>
        c.status === 'published' &&
        (c.shareToken?.toLowerCase() === clean ||
          c.slug?.toLowerCase() === clean ||
          c.id?.toLowerCase() === clean)
    );
  }

  async getPublishedCatalogs(): Promise<Catalog[]> {
    return this.catalogs.filter((c) => c.status === 'published');
  }

  // --- IImportService Methods ---
  async getHistory(): Promise<ImportRecord[]> {
    return [...this.imports];
  }

  async addRecord(record: ImportRecord): Promise<void> {
    this.imports.unshift(record);
    this.saveImportsToStorage();
  }

  // --- IOrderService Methods ---
  async getOrders(): Promise<Order[]> {
    return [...this.orders];
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    return this.orders.find((o) => o.id === id);
  }

  async createOrder(data: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>): Promise<Order> {
    const now = new Date().toISOString();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newOrder: Order = {
      ...data,
      id: `ord-${Date.now()}`,
      orderNumber: `PED-${new Date().getFullYear()}-${randomSuffix}`,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(newOrder);
    this.saveOrdersToStorage();
    return newOrder;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      throw new Error(`Pedido con ID ${id} no encontrado.`);
    }

    const updated: Order = {
      ...this.orders[idx],
      status,
      updatedAt: new Date().toISOString(),
    };

    this.orders[idx] = updated;
    this.saveOrdersToStorage();
    return updated;
  }

  async deleteOrder(id: string): Promise<boolean> {
    const initialLen = this.orders.length;
    this.orders = this.orders.filter((o) => o.id !== id);
    const deleted = this.orders.length < initialLen;
    if (deleted) {
      this.saveOrdersToStorage();
    }
    return deleted;
  }
}

export const mockDataService = new MockDataService();
