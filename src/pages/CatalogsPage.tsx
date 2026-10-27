/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DISEÑADOR DE CATÁLOGOS, PLANTILLAS Y GENERADOR REAL DE PDF (FASE 3)
 * Incluye:
 * - Gestión completa de catálogos (crear, duplicar, editar, archivar, publicar y eliminar).
 * - Selector avanzado de productos del inventario con filtros, reordenamiento manual y eliminación no destructiva.
 * - Editor visual dividido en 3 áreas: configuración por pestañas, simulador de páginas interiores y barra de exportación.
 * - Soporte para 4 plantillas (Minimalista, Editorial Luxe, Promocional y Catálogo por Categorías).
 * - Exportación nativa a PDF con portada, paginación, cálculo de descuentos y códigos QR.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Eye,
  FileDown,
  Layers,
  Sparkles,
  Search,
  Check,
  Trash2,
  Copy,
  Sliders,
  Palette,
  LayoutGrid,
  FileText,
  QrCode,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Calendar,
  AlertTriangle,
  Send,
  Globe,
  Tag,
  CheckCircle2,
  Share2,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { mockDataService } from '../services/mockDataService';
import { CATALOG_TEMPLATES, DEFAULT_VISUAL_SETTINGS } from '../services/templateCatalog';
import { generateCatalogPDF, PDFGenerationProgress } from '../services/pdfGenerator';
import QRCode from 'qrcode';
import { buildPublicCatalogUrl } from '../utils/url';
import {
  Catalog,
  CatalogProductItem,
  CatalogStatus,
  CatalogTemplateId,
  CatalogVisualSettings,
  Category,
  Product,
} from '../types';

export const CatalogsPage: React.FC = () => {
  const { t, formatDate, formatPrice, settings } = useSettings();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Editor View (null means list view, catalog object means editor view)
  const [activeCatalog, setActiveCatalog] = useState<Catalog | null>(null);
  const [editorTab, setEditorTab] = useState<'info' | 'products' | 'style' | 'visibility'>('info');

  // Estados de Compartir y Despublicar (Fase 4)
  const [shareModalCatalog, setShareModalCatalog] = useState<Catalog | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [unpublishCatalogTarget, setUnpublishCatalogTarget] = useState<Catalog | null>(null);

  // Generar código QR dinámico cuando se abre el modal de compartir
  useEffect(() => {
    if (shareModalCatalog) {
      const url = buildPublicCatalogUrl(shareModalCatalog.shareToken || shareModalCatalog.slug);
      QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
        .then((data) => setQrCodeDataUrl(data))
        .catch(() => setQrCodeDataUrl(null));
    } else {
      setQrCodeDataUrl(null);
    }
  }, [shareModalCatalog]);

  // Previewer Page Navigation in Editor
  const [previewPage, setPreviewPage] = useState<number>(1);

  // PDF Export Modal State
  const [exportingProgress, setExportingProgress] = useState<PDFGenerationProgress | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Product Selector Filters
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerOnlyWithImages, setPickerOnlyWithImages] = useState(false);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, prods, catList] = await Promise.all([
        mockDataService.getCatalogs(),
        mockDataService.getAll(),
        mockDataService.getCategories(),
      ]);
      setCatalogs(cats);
      setInventoryProducts(prods);
      setCategories(catList);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --- CRUD ACTIONS ---

  const handleCreateNewCatalog = (initialTemplate: CatalogTemplateId = 'editorial') => {
    const templateDef = CATALOG_TEMPLATES.find((t) => t.id === initialTemplate) || CATALOG_TEMPLATES[0];
    const initialVisualSettings: CatalogVisualSettings = {
      ...DEFAULT_VISUAL_SETTINGS,
      ...(templateDef.defaultSettings as any),
    };

    // Pre-select first 4 active products as a starting draft
    const initialItems: CatalogProductItem[] = inventoryProducts
      .filter((p) => p.active)
      .slice(0, 4)
      .map((p, idx) => ({
        productId: p.id,
        orderIndex: idx,
        snapshot: p,
      }));

    const newCat: Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'> = {
      internalName: `Nuevo Catálogo #${catalogs.length + 1}`,
      title: 'Catálogo de Colección Exclusiva',
      subtitle: 'Selección de Temporada Gourmet',
      slug: `catalogo-coleccion-${Date.now().toString().slice(-4)}`,
      description: 'Selección de productos destacados listos para ordenar.',
      status: 'draft',
      version: 1,
      itemsCount: initialItems.length,
      coverImage: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=80',
      templateId: initialTemplate,
      visualSettings: initialVisualSettings,
      products: initialItems,
    };

    mockDataService.createCatalog(newCat).then((created) => {
      setActiveCatalog(created);
      setEditorTab('products');
      setPreviewPage(1);
      loadData();
      showToast('Nuevo catálogo creado en borrador.');
    });
  };

  const handleDuplicateCatalog = async (id: string) => {
    const dup = await mockDataService.duplicateCatalog(id);
    await loadData();
    showToast(`Catálogo duplicado como "${dup.internalName}".`);
  };

  const handleDeleteCatalog = async (id: string) => {
    await mockDataService.deleteCatalog(id);
    setDeleteConfirmId(null);
    if (activeCatalog?.id === id) setActiveCatalog(null);
    await loadData();
    showToast('Catálogo eliminado.');
  };

  const handlePublishCatalog = async (id: string) => {
    const published = await mockDataService.publishCatalog(id);
    if (activeCatalog?.id === id) {
      setActiveCatalog(published);
    }
    await loadData();
    showToast(`¡Catálogo publicado con éxito como versión v${published.version}.0! La revista virtual pública se encuentra activa.`);
  };

  const handleUnpublishCatalog = (id: string) => {
    const cat = catalogs.find((c) => c.id === id) || (activeCatalog?.id === id ? activeCatalog : null);
    if (cat) {
      setUnpublishCatalogTarget(cat);
    }
  };

  const confirmUnpublish = async () => {
    if (!unpublishCatalogTarget) return;
    const id = unpublishCatalogTarget.id;
    const unpublished = await mockDataService.unpublishCatalog(id);
    if (activeCatalog?.id === id) {
      setActiveCatalog(unpublished);
    }
    setUnpublishCatalogTarget(null);
    await loadData();
    showToast('Catálogo despublicado. El enlace público ahora figura como no disponible.');
  };

  const handleCopyPublicLink = (cat: Catalog) => {
    const url = buildPublicCatalogUrl(cat.shareToken || cat.slug);
    navigator.clipboard.writeText(url);
    showToast('Enlace comercial copiado (sin localhost).');
  };

  const handleSaveCatalog = async () => {
    if (!activeCatalog) return;
    const updated = await mockDataService.updateCatalog(activeCatalog.id, activeCatalog);
    setActiveCatalog(updated);
    await loadData();
    showToast('Catálogo guardado correctamente.');
  };

  // --- PRODUCT PICKER HANDLERS ---

  const filteredPickerProducts = useMemo(() => {
    return inventoryProducts.filter((p) => {
      if (pickerSearch.trim()) {
        const q = pickerSearch.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchEan = p.ean ? p.ean.toLowerCase().includes(q) : false;
        if (!matchName && !matchSku && !matchEan) return false;
      }
      if (pickerCategory !== 'all') {
        if (p.categoryId !== pickerCategory && p.categoryName !== pickerCategory) return false;
      }
      if (pickerOnlyWithImages && !p.imageUrl) {
        return false;
      }
      return true;
    });
  }, [inventoryProducts, pickerSearch, pickerCategory, pickerOnlyWithImages]);

  const selectedProductIds = useMemo(() => {
    return new Set(activeCatalog?.products.map((item) => item.productId) || []);
  }, [activeCatalog]);

  const toggleSelectProduct = (product: Product) => {
    if (!activeCatalog) return;

    if (selectedProductIds.has(product.id)) {
      // Remove without affecting inventory
      const updatedProducts = activeCatalog.products
        .filter((item) => item.productId !== product.id)
        .map((item, idx) => ({ ...item, orderIndex: idx }));

      setActiveCatalog({
        ...activeCatalog,
        products: updatedProducts,
        itemsCount: updatedProducts.length,
      });
    } else {
      // Add with snapshot
      const newItem: CatalogProductItem = {
        productId: product.id,
        orderIndex: activeCatalog.products.length,
        snapshot: product,
      };
      const updatedProducts = [...activeCatalog.products, newItem];
      setActiveCatalog({
        ...activeCatalog,
        products: updatedProducts,
        itemsCount: updatedProducts.length,
      });
    }
  };

  const selectAllFilteredProducts = () => {
    if (!activeCatalog) return;
    const currentList = [...activeCatalog.products];
    const existingIds = new Set(currentList.map((i) => i.productId));

    for (const p of filteredPickerProducts) {
      if (!existingIds.has(p.id)) {
        currentList.push({
          productId: p.id,
          orderIndex: currentList.length,
          snapshot: p,
        });
        existingIds.add(p.id);
      }
    }

    setActiveCatalog({
      ...activeCatalog,
      products: currentList,
      itemsCount: currentList.length,
    });
  };

  const removeAllSelectedProducts = () => {
    if (!activeCatalog) return;
    setActiveCatalog({
      ...activeCatalog,
      products: [],
      itemsCount: 0,
    });
  };

  const moveProductOrder = (index: number, direction: 'up' | 'down') => {
    if (!activeCatalog) return;
    const items = [...activeCatalog.products];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    const reordered = items.map((it, idx) => ({ ...it, orderIndex: idx }));
    setActiveCatalog({ ...activeCatalog, products: reordered });
  };

  // --- PDF EXPORT HANDLER ---

  const handleExportPDF = async (catalogToExport: Catalog) => {
    setExportingProgress({ percent: 5, stage: 'Iniciando generador vectorial PDF...' });

    try {
      const pdfBlob = await generateCatalogPDF(
        catalogToExport,
        settings.businessName,
        settings.whatsappNumber,
        (p) => setExportingProgress(p)
      );

      // Download trigger
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `catalogo-${catalogToExport.slug}-v${catalogToExport.version}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('PDF exportado exitosamente.');
    } catch (err: any) {
      alert(`Error al generar PDF: ${err?.message || err}`);
    } finally {
      setExportingProgress(null);
    }
  };

  // --- TEMPLATE SWITCHER HANDLER ---

  const applyTemplate = (templateId: CatalogTemplateId) => {
    if (!activeCatalog) return;
    const tpl = CATALOG_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;

    setActiveCatalog({
      ...activeCatalog,
      templateId,
      visualSettings: {
        ...activeCatalog.visualSettings,
        ...(tpl.defaultSettings as any),
      },
    });
    showToast(`Plantilla "${tpl.name}" aplicada.`);
  };

  // Pagination calculation for Editor Previewer
  const previewItemsPerPage = activeCatalog?.visualSettings.productsPerPage || 4;
  const previewTotalProductPages = activeCatalog ? Math.ceil(activeCatalog.products.length / previewItemsPerPage) : 0;
  const previewTotalPages = 1 + (previewTotalProductPages || 1); // 1 cover + product pages

  // Products for the current preview page (Page 1 is Cover)
  const previewCurrentProducts = useMemo(() => {
    if (!activeCatalog || previewPage <= 1) return [];
    const startIndex = (previewPage - 2) * previewItemsPerPage;
    return activeCatalog.products.slice(startIndex, startIndex + previewItemsPerPage);
  }, [activeCatalog, previewPage, previewItemsPerPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 dark:border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: CATALOG LIST VIEW (If no active catalog is being edited)
  // =========================================================================
  if (!activeCatalog) {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-xl text-xs font-semibold animate-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 rounded-md">
                Fase 3 Activa
              </span>
              <span className="text-xs text-slate-400 font-mono">Diseñador & Generador PDF</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              {t.catalogs.title}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Crea ediciones comerciales independientes del inventario, diseña portadas y exporta como PDF listo para compartir
            </p>
          </div>

          <button
            onClick={() => handleCreateNewCatalog('editorial')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Nuevo Catálogo</span>
          </button>
        </div>

        {/* Catalogs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {catalogs.map((catalog) => {
            const templateInfo = CATALOG_TEMPLATES.find((t) => t.id === catalog.templateId) || CATALOG_TEMPLATES[0];

            return (
              <div
                key={catalog.id}
                className="overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col hover:border-slate-400 dark:hover:border-slate-700 transition"
              >
                {/* Cover Banner */}
                <div className="relative h-48 bg-slate-900 overflow-hidden">
                  {catalog.coverImage ? (
                    <img
                      src={catalog.coverImage}
                      alt={catalog.title}
                      className="w-full h-full object-cover opacity-85"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600">
                      <BookOpen className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                  {/* Status & Version Badges */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${
                        catalog.status === 'published'
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'bg-slate-800/90 text-slate-200 backdrop-blur-xs'
                      }`}
                    >
                      {catalog.status === 'published' ? 'Publicado' : 'Borrador'}
                    </span>

                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-white/90 text-slate-900 rounded-md backdrop-blur-xs">
                      v{catalog.version}.0
                    </span>

                    <span className="px-2 py-0.5 text-[10px] font-medium bg-black/60 text-slate-200 rounded-md backdrop-blur-xs">
                      {templateInfo.name}
                    </span>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <h3 className="text-lg font-bold truncate">{catalog.title}</h3>
                    <p className="text-xs text-slate-200 truncate mt-0.5">
                      {catalog.subtitle || catalog.description}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {catalog.products.length} productos
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDate(catalog.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setActiveCatalog(catalog);
                          setEditorTab('products');
                          setPreviewPage(1);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 rounded-xl transition"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Editar Diseño</span>
                      </button>

                      <button
                        onClick={() => handleExportPDF(catalog)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl transition"
                        title="Descargar PDF"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {catalog.status === 'draft' ? (
                        <button
                          onClick={() => handlePublishCatalog(catalog.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg transition"
                        >
                          Publicar
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <a
                            href={`/m/${catalog.shareToken || catalog.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-lg transition"
                            title="Abrir Revista Pública"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => handleCopyPublicLink(catalog)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-lg transition"
                            title="Copiar Enlace Comercial"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleUnpublishCatalog(catalog.id)}
                            className="px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                            title="Despublicar catálogo"
                          >
                            Despublicar
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => handleDuplicateCatalog(catalog.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                        title="Duplicar catálogo"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeleteConfirmId(catalog.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        title="Eliminar catálogo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Delete confirmation modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                ¿Eliminar este catálogo?
              </h3>
              <p className="text-xs text-slate-500">
                Los productos del catálogo continuarán existiendo en tu inventario general.
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteCatalog(deleteConfirmId)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FULL VISUAL CATALOG EDITOR & PAGE SPREAD PREVIEW
  // =========================================================================
  const activeTemplateDef = CATALOG_TEMPLATES.find((t) => t.id === activeCatalog.templateId) || CATALOG_TEMPLATES[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-xl text-xs font-semibold animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Editor Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveCatalog(null)}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            title="Volver a la lista"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-sm">
                {activeCatalog.internalName}
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                  activeCatalog.status === 'published'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {activeCatalog.status === 'published' ? `Publicado v${activeCatalog.version}.0` : 'Borrador'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Plantilla: <strong>{activeTemplateDef.name}</strong> • {activeCatalog.products.length} productos incluidos
            </p>
          </div>
        </div>

        {/* Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveCatalog}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl transition"
          >
            <span>Guardar Borrador</span>
          </button>

          {activeCatalog.status === 'draft' ? (
            <button
              onClick={() => handlePublishCatalog(activeCatalog.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Publicar Versión Oficial</span>
            </button>
          ) : (
            <>
              <a
                href={`/m/${activeCatalog.shareToken || activeCatalog.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver Revista Pública</span>
              </a>

              <button
                onClick={() => handleCopyPublicLink(activeCatalog)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl transition"
                title="Copiar enlace comercial no predecible"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Copiar Enlace</span>
              </button>

              <button
                onClick={() => handleUnpublishCatalog(activeCatalog.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl transition"
              >
                <span>Despublicar</span>
              </button>

              <button
                onClick={() => handlePublishCatalog(activeCatalog.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl transition"
                title="Crea una nueva versión inmutable"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualizar Versión (v{activeCatalog.version + 1})</span>
              </button>
            </>
          )}

          <button
            onClick={() => handleExportPDF(activeCatalog)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Exportar PDF Real</span>
          </button>
        </div>
      </div>

      {/* Editor Main Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Tabs (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden flex flex-col">
          {/* Tab Navigation */}
          <div className="grid grid-cols-4 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500">
            <button
              onClick={() => setEditorTab('info')}
              className={`py-3 text-center border-b-2 transition ${
                editorTab === 'info'
                  ? 'border-slate-900 text-slate-900 dark:border-emerald-500 dark:text-white'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Portada
            </button>
            <button
              onClick={() => setEditorTab('products')}
              className={`py-3 text-center border-b-2 transition ${
                editorTab === 'products'
                  ? 'border-slate-900 text-slate-900 dark:border-emerald-500 dark:text-white'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Productos ({activeCatalog.products.length})
            </button>
            <button
              onClick={() => setEditorTab('style')}
              className={`py-3 text-center border-b-2 transition ${
                editorTab === 'style'
                  ? 'border-slate-900 text-slate-900 dark:border-emerald-500 dark:text-white'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Plantilla
            </button>
            <button
              onClick={() => setEditorTab('visibility')}
              className={`py-3 text-center border-b-2 transition ${
                editorTab === 'visibility'
                  ? 'border-slate-900 text-slate-900 dark:border-emerald-500 dark:text-white'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Opciones
            </button>
          </div>

          <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4 text-xs">
            {/* TAB 1: INFO & COVER */}
            {editorTab === 'info' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Nombre Interno del Catálogo
                  </label>
                  <input
                    type="text"
                    value={activeCatalog.internalName}
                    onChange={(e) => setActiveCatalog({ ...activeCatalog, internalName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Título Principal en Portada
                  </label>
                  <input
                    type="text"
                    value={activeCatalog.title}
                    onChange={(e) => setActiveCatalog({ ...activeCatalog, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Subtítulo de Portada
                  </label>
                  <input
                    type="text"
                    value={activeCatalog.subtitle || ''}
                    onChange={(e) => setActiveCatalog({ ...activeCatalog, subtitle: e.target.value })}
                    placeholder="ej. Selección Premium de Temporada"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    URL Imagen de Portada
                  </label>
                  <input
                    type="url"
                    value={activeCatalog.coverImage || ''}
                    onChange={(e) => setActiveCatalog({ ...activeCatalog, coverImage: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Descripción / Nota Editorial
                  </label>
                  <textarea
                    rows={3}
                    value={activeCatalog.description || ''}
                    onChange={(e) => setActiveCatalog({ ...activeCatalog, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: PRODUCT SELECTOR & ORDER */}
            {editorTab === 'products' && (
              <div className="space-y-4">
                {/* Search & Filter Toolbar */}
                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Buscar en inventario..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={pickerCategory}
                      onChange={(e) => setPickerCategory(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <option value="all">Todas las categorías</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pickerOnlyWithImages}
                        onChange={(e) => setPickerOnlyWithImages(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-emerald-600"
                      />
                      <span>Con imagen</span>
                    </label>
                  </div>

                  <div className="flex justify-between items-center pt-1 text-[11px]">
                    <span className="text-slate-500">
                      Disponibles: {filteredPickerProducts.length} productos
                    </span>
                    <button
                      onClick={selectAllFilteredProducts}
                      className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                    >
                      + Seleccionar todos
                    </button>
                  </div>
                </div>

                {/* Available Inventory List */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl p-2">
                  {filteredPickerProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleSelectProduct(p)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                            : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-3.5 h-3.5 rounded text-emerald-600"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 dark:text-white truncate block">
                              {p.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              SKU: {p.sku} • {formatPrice(p.price)}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 rounded">
                            En catálogo
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Selected Products Order List */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Orden en el Catálogo ({activeCatalog.products.length} productos)
                    </span>
                    {activeCatalog.products.length > 0 && (
                      <button
                        onClick={removeAllSelectedProducts}
                        className="text-[11px] text-rose-600 hover:underline"
                      >
                        Vaciar selección
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {activeCatalog.products.map((item, idx) => (
                      <div
                        key={item.productId}
                        className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-white dark:bg-slate-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-white truncate">
                            {item.snapshot.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => moveProductOrder(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveProductOrder(idx, 'down')}
                            disabled={idx === activeCatalog.products.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => toggleSelectProduct(item.snapshot)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Quitar del catálogo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TEMPLATES & STYLE */}
            {editorTab === 'style' && (
              <div className="space-y-4">
                <span className="font-bold text-slate-900 dark:text-white block">
                  Elige una Plantilla Base:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {CATALOG_TEMPLATES.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl.id)}
                      className={`p-3 rounded-2xl border cursor-pointer transition ${
                        activeCatalog.templateId === tpl.id
                          ? 'border-slate-900 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/80 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">
                          {tpl.badge}
                        </span>
                        {activeCatalog.templateId === tpl.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white block">
                        {tpl.name}
                      </span>
                      <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">
                        {tpl.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Color Primario
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={activeCatalog.visualSettings.primaryColor}
                          onChange={(e) =>
                            setActiveCatalog({
                              ...activeCatalog,
                              visualSettings: {
                                ...activeCatalog.visualSettings,
                                primaryColor: e.target.value,
                              },
                            })
                          }
                          className="w-8 h-8 rounded-lg cursor-pointer border-0"
                        />
                        <span className="font-mono text-[11px]">
                          {activeCatalog.visualSettings.primaryColor}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Color Acento
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={activeCatalog.visualSettings.secondaryColor}
                          onChange={(e) =>
                            setActiveCatalog({
                              ...activeCatalog,
                              visualSettings: {
                                ...activeCatalog.visualSettings,
                                secondaryColor: e.target.value,
                              },
                            })
                          }
                          className="w-8 h-8 rounded-lg cursor-pointer border-0"
                        />
                        <span className="font-mono text-[11px]">
                          {activeCatalog.visualSettings.secondaryColor}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Tipografía
                      </label>
                      <select
                        value={activeCatalog.visualSettings.fontFamily}
                        onChange={(e) =>
                          setActiveCatalog({
                            ...activeCatalog,
                            visualSettings: {
                              ...activeCatalog.visualSettings,
                              fontFamily: e.target.value as any,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        <option value="sans">Moderna Sans-Serif</option>
                        <option value="serif">Editorial Clásica (Serif)</option>
                        <option value="mono">Técnica Monoespaciada</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Productos / Página
                      </label>
                      <select
                        value={activeCatalog.visualSettings.productsPerPage}
                        onChange={(e) =>
                          setActiveCatalog({
                            ...activeCatalog,
                            visualSettings: {
                              ...activeCatalog.visualSettings,
                              productsPerPage: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        <option value="2">2 productos (Gran detalle)</option>
                        <option value="4">4 productos (Equilibrado)</option>
                        <option value="6">6 productos (Alta densidad)</option>
                        <option value="8">8 productos (Compacto)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Columnas de Cuadrícula
                      </label>
                      <select
                        value={activeCatalog.visualSettings.gridColumns}
                        onChange={(e) =>
                          setActiveCatalog({
                            ...activeCatalog,
                            visualSettings: {
                              ...activeCatalog.visualSettings,
                              gridColumns: Number(e.target.value) as any,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        <option value="1">1 Columna (Lista vertical)</option>
                        <option value="2">2 Columnas (Estándar folio)</option>
                        <option value="3">3 Columnas (Cuadrícula comercial)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">
                        Formato de Página
                      </label>
                      <select
                        value={activeCatalog.visualSettings.pageSize}
                        onChange={(e) =>
                          setActiveCatalog({
                            ...activeCatalog,
                            visualSettings: {
                              ...activeCatalog.visualSettings,
                              pageSize: e.target.value as any,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      >
                        <option value="a4">A4 Internacional (210 x 297 mm)</option>
                        <option value="magazine_letter">Revista Carta (216 x 279 mm)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: VISIBILITY & PRICING */}
            {editorTab === 'visibility' && (
              <div className="space-y-3">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">
                  Visibilidad de Precios y Metadatos:
                </span>

                {[
                  { key: 'showPrices', label: 'Mostrar precios de venta' },
                  { key: 'showDiscounts', label: 'Destacar porcentaje de descuento (% OFF)' },
                  { key: 'showDescription', label: 'Mostrar descripción del producto' },
                  { key: 'showBrand', label: 'Mostrar marca o productor' },
                  { key: 'showSku', label: 'Mostrar código SKU' },
                  { key: 'showEan', label: 'Mostrar código EAN (con ceros preservados)' },
                  { key: 'showPageNumbers', label: 'Numeración de páginas automática' },
                  { key: 'includeQrCode', label: 'Incluir código QR para pedidos WhatsApp' },
                  { key: 'groupByCategory', label: 'Agrupar productos por categoría' },
                ].map((toggle) => (
                  <label
                    key={toggle.key}
                    className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer"
                  >
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {toggle.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={(activeCatalog.visualSettings as any)[toggle.key]}
                      onChange={(e) =>
                        setActiveCatalog({
                          ...activeCatalog,
                          visualSettings: {
                            ...activeCatalog.visualSettings,
                            [toggle.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                    />
                  </label>
                ))}

                <div className="pt-2 space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Encabezado Superior de Páginas
                  </label>
                  <input
                    type="text"
                    value={activeCatalog.visualSettings.headerText}
                    onChange={(e) =>
                      setActiveCatalog({
                        ...activeCatalog,
                        visualSettings: {
                          ...activeCatalog.visualSettings,
                          headerText: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Pie de Página Inferior
                  </label>
                  <input
                    type="text"
                    value={activeCatalog.visualSettings.footerText}
                    onChange={(e) =>
                      setActiveCatalog({
                        ...activeCatalog,
                        visualSettings: {
                          ...activeCatalog.visualSettings,
                          footerText: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Page Spread Previewer (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden flex flex-col">
          {/* Previewer Header & Navigation Controls */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                Simulador de Impresión y Folio
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage <= 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono font-semibold px-2">
                {previewPage === 1 ? 'Portada' : `Pág. ${previewPage} de ${previewTotalPages}`}
              </span>

              <button
                onClick={() => setPreviewPage((p) => Math.min(previewTotalPages, p + 1))}
                disabled={previewPage >= previewTotalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* SIMULATED PRINT SHEET (A4 / Letter Aspect Ratio 1 : 1.41) */}
          <div className="p-6 bg-slate-200/60 dark:bg-slate-950 flex justify-center">
            <div
              className={`w-full max-w-md min-h-[580px] bg-white text-slate-900 rounded-xl shadow-2xl p-6 flex flex-col justify-between border border-slate-300 relative transition-all ${
                activeCatalog.visualSettings.fontFamily === 'serif'
                  ? 'font-serif'
                  : activeCatalog.visualSettings.fontFamily === 'mono'
                  ? 'font-mono'
                  : 'font-sans'
              }`}
            >
              {/* PAGE 1: COVER PREVIEW */}
              {previewPage === 1 ? (
                <div className="flex-1 flex flex-col justify-between">
                  {/* Brand Header */}
                  <div
                    className="p-6 -mx-6 -mt-6 rounded-t-xl text-white"
                    style={{ backgroundColor: activeCatalog.visualSettings.primaryColor }}
                  >
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 block">
                      {(settings.businessName || 'YORCATALOG').toUpperCase()}
                    </span>
                    <h1 className="text-2xl font-black mt-2 leading-tight">
                      {activeCatalog.title || 'Catálogo Comercial'}
                    </h1>
                    {activeCatalog.subtitle && (
                      <p className="text-xs text-slate-300 mt-1">
                        {activeCatalog.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Cover Photo */}
                  <div className="my-4 h-56 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                    {activeCatalog.coverImage ? (
                      <img
                        src={activeCatalog.coverImage}
                        alt="Portada"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Sin imagen de portada</span>
                    )}
                  </div>

                  {/* Cover Footer & QR */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <span className="font-bold block text-slate-900">
                        PEDIDOS DIRECTOS POR WHATSAPP
                      </span>
                      <span>{settings.whatsappNumber}</span>
                      <span className="block text-[10px] text-slate-400">
                        v{activeCatalog.version}.0 • {activeCatalog.products.length} productos
                      </span>
                    </div>

                    {activeCatalog.visualSettings.includeQrCode && (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 text-slate-700">
                          <QrCode className="w-9 h-9" />
                        </div>
                        <span className="text-[8px] text-slate-400 mt-0.5">ESCANEA</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* INTERIOR PAGES PREVIEW */
                <div className="flex-1 flex flex-col justify-between">
                  {/* Running Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
                    <span className="font-bold text-slate-800">
                      {activeCatalog.visualSettings.headerText || activeCatalog.title}
                    </span>
                    <span>{settings.businessName}</span>
                  </div>

                  {/* Product Cards Grid */}
                  <div
                    className={`grid gap-3 my-auto py-2 ${
                      activeCatalog.visualSettings.gridColumns === 1
                        ? 'grid-cols-1'
                        : activeCatalog.visualSettings.gridColumns === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2'
                    }`}
                  >
                    {previewCurrentProducts.map((item) => {
                      const prod = item.snapshot;
                      const hasDiscount =
                        activeCatalog.visualSettings.showDiscounts &&
                        prod.compareAtPrice &&
                        prod.compareAtPrice > prod.price;

                      return (
                        <div
                          key={item.productId}
                          className="p-2 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs relative"
                        >
                          {/* Photo */}
                          <div className="h-24 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative border border-slate-100">
                            {prod.imageUrl ? (
                              <img
                                src={prod.imageUrl}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[9px] text-slate-400">Sin foto</span>
                            )}

                            {hasDiscount && (
                              <span
                                className="absolute top-1 left-1 px-1.5 py-0.5 text-[8px] font-bold text-white rounded"
                                style={{ backgroundColor: activeCatalog.visualSettings.secondaryColor }}
                              >
                                -{Math.round(((prod.compareAtPrice! - prod.price) / prod.compareAtPrice!) * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="mt-2 text-[10px] space-y-0.5">
                            {activeCatalog.visualSettings.showBrand && prod.brand && (
                              <span
                                className="font-bold text-[8px] uppercase tracking-wider block"
                                style={{ color: activeCatalog.visualSettings.secondaryColor }}
                              >
                                {prod.brand}
                              </span>
                            )}

                            <span className="font-bold text-slate-900 leading-tight line-clamp-2 block">
                              {item.customTitle || prod.name}
                            </span>

                            {(activeCatalog.visualSettings.showSku || activeCatalog.visualSettings.showEan) && (
                              <div className="font-mono text-[8px] text-slate-400">
                                {activeCatalog.visualSettings.showSku && `SKU: ${prod.sku}`}
                                {activeCatalog.visualSettings.showEan && prod.ean && ` | EAN: ${prod.ean}`}
                              </div>
                            )}

                            {/* Price */}
                            {activeCatalog.visualSettings.showPrices && (
                              <div className="pt-1 flex items-baseline gap-1.5">
                                <span className="font-bold text-xs text-slate-900 font-mono">
                                  {formatPrice(item.customPrice !== undefined ? item.customPrice : prod.price)}
                                </span>
                                {hasDiscount && (
                                  <span className="text-[8px] text-slate-400 line-through font-mono">
                                    {formatPrice(prod.compareAtPrice!)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Running Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[9px] text-slate-500">
                    <span>{activeCatalog.visualSettings.footerText}</span>
                    {activeCatalog.visualSettings.showPageNumbers && (
                      <span className="font-bold font-mono">
                        Pág. {previewPage} de {previewTotalPages}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PDF Export Progress Modal */}
      {exportingProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 mx-auto rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-emerald-600 animate-spin" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Exportando Catálogo a PDF Real
            </h3>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${exportingProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {exportingProgress.stage} ({exportingProgress.percent}%)
            </p>
          </div>
        </div>
      )}
      {/* ──────────────── MODAL DE COMPARTIR Y QR (FASE 4) ──────────────── */}
      {shareModalCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Compartir Revista Virtual
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Versión publicada v{shareModalCatalog.version}.0
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShareModalCatalog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Código QR */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Código QR del Catálogo"
                  className="w-44 h-44 rounded-xl shadow-xs bg-white p-2"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">
                  Generando código QR...
                </div>
              )}
              <span className="text-[11px] text-slate-500 mt-2 font-mono">
                Escanea para abrir la revista pública
              </span>
            </div>

            {/* Enlace Comercial Real */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                Enlace Público Comercial (Listo para WhatsApp & Redes):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={buildPublicCatalogUrl(shareModalCatalog.shareToken || shareModalCatalog.slug)}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 select-all"
                />
                <button
                  onClick={() => {
                    const url = buildPublicCatalogUrl(shareModalCatalog.shareToken || shareModalCatalog.slug);
                    navigator.clipboard.writeText(url);
                    setCopiedShareUrl(true);
                    setTimeout(() => setCopiedShareUrl(false), 2000);
                  }}
                  className="px-3 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                >
                  {copiedShareUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedShareUrl ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `¡Hola! Te invito a explorar nuestra revista virtual comercial: ${buildPublicCatalogUrl(shareModalCatalog.shareToken || shareModalCatalog.slug)}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar por WhatsApp</span>
              </a>

              <a
                href={buildPublicCatalogUrl(shareModalCatalog.shareToken || shareModalCatalog.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir en Nueva Pestaña</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL DE CONFIRMACIÓN PARA DESPUBLICAR (FASE 4) ──────────────── */}
      {unpublishCatalogTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                ¿Despublicar "{unpublishCatalogTarget.title}"?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                El enlace público comercial dejará de ser accesible de inmediato. Los clientes que visiten la URL verán el mensaje de catálogo despublicado.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <div>• El catálogo volverá al estado <strong>Borrador</strong>.</div>
              <div>• Podrás volver a publicarlo o actualizar su contenido en cualquier momento.</div>
              <div>• Los pedidos ya enviados por WhatsApp no se verán afectados.</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setUnpublishCatalogTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmUnpublish}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                Sí, Despublicar Catálogo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
