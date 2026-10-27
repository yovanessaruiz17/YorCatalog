/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * INVENTARIO REAL DE PRODUCTOS (FASE 2)
 * Gestión completa CRUD:
 * - Creación y edición manual de productos.
 * - Validación decimal en precios y EAN tratado estrictamente como texto.
 * - Activación / desactivación y eliminación con confirmación.
 * - Operaciones masivas seguras (activar, desactivar, borrar, cambiar categoría).
 * - Búsqueda multicriterio (Nombre, SKU, EAN), filtros, ordenamiento y paginación.
 * - Gestión de categorías y vista detallada de ficha técnica.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Barcode,
  X,
  Eye,
  Edit2,
  Trash2,
  ChevronDown,
  ArrowUpDown,
  Layers,
  Check,
  Tag,
  Save,
  Power,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { mockDataService } from '../services/mockDataService';
import { Category, ImageMatchStatus, Product } from '../types';
import { useSettings } from '../context/SettingsContext';
import { Link } from 'react-router-dom';

type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc' | 'recent';

export const ProductsPage: React.FC = () => {
  const { t, formatPrice } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedActive, setSelectedActive] = useState<string>('all');
  const [imageFilter, setImageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection for bulk operations
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Modals state
  const [inspectProduct, setInspectProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form state for creation / edition
  const [formData, setFormData] = useState<{
    name: string;
    sku: string;
    ean: string;
    categoryId: string;
    categoryName: string;
    brand: string;
    price: string;
    compareAtPrice: string;
    stock: string;
    description: string;
    imageUrl: string;
    active: boolean;
  }>({
    name: '',
    sku: '',
    ean: '',
    categoryId: '',
    categoryName: '',
    brand: '',
    price: '',
    compareAtPrice: '',
    stock: '10',
    description: '',
    imageUrl: '',
    active: true,
  });

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        mockDataService.getAll(),
        mockDataService.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchName = p.name.toLowerCase().includes(q);
          const matchSku = p.sku.toLowerCase().includes(q);
          const matchEan = p.ean ? p.ean.toLowerCase().includes(q) : false;
          const matchBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
          if (!matchName && !matchSku && !matchEan && !matchBrand) return false;
        }

        if (selectedCategory !== 'all') {
          if (p.categoryId !== selectedCategory && p.categoryName !== selectedCategory) {
            return false;
          }
        }

        if (selectedActive === 'active' && !p.active) return false;
        if (selectedActive === 'inactive' && p.active) return false;

        if (imageFilter === 'with_image' && !p.imageUrl) return false;
        if (imageFilter === 'without_image' && p.imageUrl) return false;
        if (imageFilter === 'verified' && (!p.imageUrl || !p.imageVerified)) return false;
        if (imageFilter === 'pending' && (!p.imageUrl || p.imageVerified)) return false;

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name_asc':
            return a.name.localeCompare(b.name);
          case 'name_desc':
            return b.name.localeCompare(a.name);
          case 'price_asc':
            return a.price - b.price;
          case 'price_desc':
            return b.price - a.price;
          case 'stock_asc':
            return (a.stock || 0) - (b.stock || 0);
          case 'stock_desc':
            return (b.stock || 0) - (a.stock || 0);
          case 'recent':
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [products, search, selectedCategory, selectedActive, imageFilter, sortBy]);

  // Paginated view
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, selectedActive, imageFilter, sortBy, pageSize]);

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProductIds(new Set(paginatedProducts.map((p) => p.id)));
    } else {
      setSelectedProductIds(new Set());
    }
  };

  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk actions
  const handleBulkToggleActive = async (active: boolean) => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    await mockDataService.bulkUpdateStatus(ids, active);
    await loadData();
    setSelectedProductIds(new Set());
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    await mockDataService.bulkDelete(ids);
    setBulkDeleteConfirm(false);
    setSelectedProductIds(new Set());
    await loadData();
  };

  // Single delete
  const handleDeleteProduct = async (id: string) => {
    await mockDataService.delete(id);
    setDeleteConfirmId(null);
    await loadData();
  };

  // Toggle active single
  const handleToggleActive = async (p: Product) => {
    await mockDataService.update(p.id, { active: !p.active });
    await loadData();
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    const firstCat = categories[0] || { id: 'cat-gen', name: 'General' };
    setFormData({
      name: '',
      sku: `YOR-${Date.now().toString().slice(-4)}`,
      ean: '',
      categoryId: firstCat.id,
      categoryName: firstCat.name,
      brand: '',
      price: '',
      compareAtPrice: '',
      stock: '10',
      description: '',
      imageUrl: '',
      active: true,
    });
    setFormError(null);
    setIsCreatingProduct(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku,
      ean: p.ean || '',
      categoryId: p.categoryId,
      categoryName: p.categoryName || '',
      brand: p.brand || '',
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice ? p.compareAtPrice.toString() : '',
      stock: p.stock !== undefined ? p.stock.toString() : '0',
      description: p.description || '',
      imageUrl: p.imageUrl || '',
      active: p.active,
    });
    setFormError(null);
  };

  // Save product (Create or Edit)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNum = parseFloat(formData.price.replace(/,/g, '.'));
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('El precio debe ser un número positivo válido.');
      return;
    }

    let compareNum: number | undefined = undefined;
    if (formData.compareAtPrice.trim()) {
      const parsed = parseFloat(formData.compareAtPrice.replace(/,/g, '.'));
      if (!isNaN(parsed) && parsed >= 0) compareNum = parsed;
    }

    const stockNum = parseInt(formData.stock, 10);
    const validStock = isNaN(stockNum) ? 0 : Math.max(0, stockNum);

    // Strict EAN clean text
    const cleanEan = formData.ean.trim() || null;

    try {
      const selectedCat = categories.find((c) => c.id === formData.categoryId);
      const catName = selectedCat ? selectedCat.name : formData.categoryName || 'General';

      if (editingProduct) {
        await mockDataService.update(editingProduct.id, {
          name: formData.name.trim(),
          sku: formData.sku.trim(),
          ean: cleanEan,
          categoryId: formData.categoryId,
          categoryName: catName,
          brand: formData.brand.trim() || undefined,
          price: priceNum,
          compareAtPrice: compareNum,
          stock: validStock,
          description: formData.description.trim() || undefined,
          imageUrl: formData.imageUrl.trim() || undefined,
          active: formData.active,
        });
        setEditingProduct(null);
      } else {
        await mockDataService.create({
          name: formData.name.trim(),
          sku: formData.sku.trim(),
          ean: cleanEan,
          categoryId: formData.categoryId,
          categoryName: catName,
          brand: formData.brand.trim() || undefined,
          price: priceNum,
          compareAtPrice: compareNum,
          currency: 'COP',
          stock: validStock,
          description: formData.description.trim() || undefined,
          imageUrl: formData.imageUrl.trim() || undefined,
          imageVerified: false,
          imageMatchStatus: formData.imageUrl ? 'pending_review' : 'no_image',
          active: formData.active,
        });
        setIsCreatingProduct(false);
      }

      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Error al guardar el producto.');
    }
  };

  // Add new Category handler
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const created = await mockDataService.createCategory(newCategoryName);
    setNewCategoryName('');
    const cats = await mockDataService.getCategories();
    setCategories(cats);
    setFormData((prev) => ({ ...prev, categoryId: created.id, categoryName: created.name }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 dark:border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.products.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Administración de productos, códigos EAN, inventario y disponibilidad
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/import"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>{t.products.importCsvBtn}</span>
          </Link>

          <button
            onClick={() => setShowCategoryManager(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition"
          >
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span>Categorías</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.products.createProductBtn}</span>
          </button>
        </div>
      </div>

      {/* Search, Filter & Sorter Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Nombre, SKU, Marca o Código EAN..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            />
          </div>

          {/* Category Dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            >
              <option value="all">Todas las categorías ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </select>
          </div>

          {/* Image Status Dropdown */}
          <div className="md:col-span-2">
            <select
              value={imageFilter}
              onChange={(e) => setImageFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            >
              <option value="all">Imágenes: Todas</option>
              <option value="verified">Imagen Verificada</option>
              <option value="pending">Imagen Pendiente</option>
              <option value="without_image">Sin Imagen</option>
            </select>
          </div>

          {/* Sorter Dropdown */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            >
              <option value="recent">Más recientes</option>
              <option value="name_asc">Nombre (A-Z)</option>
              <option value="name_desc">Nombre (Z-A)</option>
              <option value="price_asc">Precio (Menor a Mayor)</option>
              <option value="price_desc">Precio (Mayor a Menor)</option>
              <option value="stock_desc">Mayor Stock</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar (Visible when items selected) */}
        {selectedProductIds.size > 0 && (
          <div className="p-3 bg-slate-900 text-white dark:bg-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {selectedProductIds.size} productos seleccionados
              </span>
              <button
                onClick={() => setSelectedProductIds(new Set())}
                className="text-slate-400 hover:text-white underline text-[11px]"
              >
                Deseleccionar
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkToggleActive(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
              >
                Activar
              </button>
              <button
                onClick={() => handleBulkToggleActive(false)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              >
                Desactivar
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition"
              >
                Eliminar Selección
              </button>
            </div>
          </div>
        )}

        {/* Counter and Page Controls */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            Mostrando <strong>{paginatedProducts.length}</strong> de {filteredProducts.length} productos
          </div>

          <div className="flex items-center gap-2">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl">
          <Filter className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {t.products.emptyTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t.products.emptyDesc}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
                setSelectedActive('all');
                setImageFilter('all');
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl"
            >
              Limpiar Filtros
            </button>
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-xl"
            >
              Crear Nuevo Producto
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          paginatedProducts.length > 0 &&
                          paginatedProducts.every((p) => selectedProductIds.has(p.id))
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                      />
                    </th>
                    <th className="py-3 px-3">{t.products.colImage}</th>
                    <th className="py-3 px-4">{t.products.colProduct}</th>
                    <th className="py-3 px-4 font-mono">{t.products.colSku}</th>
                    <th className="py-3 px-4 font-mono">{t.products.colEan}</th>
                    <th className="py-3 px-4">{t.products.colCategory}</th>
                    <th className="py-3 px-4 text-right">{t.products.colPrice}</th>
                    <th className="py-3 px-4 text-center">{t.products.colStock}</th>
                    <th className="py-3 px-4 text-center">{t.products.colStatus}</th>
                    <th className="py-3 px-4 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {paginatedProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p.id);

                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectProduct(p.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                          />
                        </td>

                        {/* Thumbnail */}
                        <td className="py-3 px-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-700">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* Product Info */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {p.brand ? `${p.brand} • ` : ''}
                            {p.description || 'Sin descripción'}
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {p.sku}
                        </td>

                        {/* EAN - Strictly preserved string */}
                        <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {p.ean ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-[11px]">
                              <Barcode className="w-3.5 h-3.5 text-slate-400" />
                              {p.ean}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Sin EAN</span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[11px]">
                            {p.categoryName || 'General'}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white font-mono">
                            {formatPrice(p.price)}
                          </div>
                          {p.compareAtPrice && (
                            <div className="text-[10px] text-slate-400 line-through font-mono">
                              {formatPrice(p.compareAtPrice)}
                            </div>
                          )}
                        </td>

                        {/* Stock */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-medium">
                          {p.stock !== undefined ? (
                            <span className={p.stock <= 5 ? 'text-amber-600 font-bold' : ''}>
                              {p.stock}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* Status Toggle */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleToggleActive(p)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg transition ${
                              p.active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {p.active ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setInspectProduct(p)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
                              title="Inspeccionar ficha"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(p)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg transition"
                              title="Editar producto"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(p.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg transition"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {paginatedProducts.map((p) => (
              <div
                key={p.id}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-3"
              >
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                      {p.categoryName || 'General'}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {p.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">
                        {formatPrice(p.price)}
                      </span>
                      {p.compareAtPrice && (
                        <span className="text-xs text-slate-400 line-through font-mono">
                          {formatPrice(p.compareAtPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  <div>SKU: {p.sku}</div>
                  <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <Barcode className="w-3.5 h-3.5" />
                    <span>{p.ean || 'Sin EAN'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleToggleActive(p)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      p.active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {p.active ? 'Activo' : 'Inactivo'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setInspectProduct(p)}
                      className="p-1 text-slate-500 hover:text-slate-900 rounded"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(p)}
                      className="p-1 text-slate-500 hover:text-blue-600 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(p.id)}
                      className="p-1 text-slate-500 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold px-3 py-1">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {(isCreatingProduct || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
              </h3>
              <button
                onClick={() => {
                  setIsCreatingProduct(false);
                  setEditingProduct(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Nombre del Producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ej. Café Especial Geisha Huila 340g"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    SKU (Código Interno) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="ej. YOR-CAFE-01"
                    className="w-full font-mono px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Código EAN (Texto estricto, conserva ceros)
                  </label>
                  <input
                    type="text"
                    value={formData.ean}
                    onChange={(e) => setFormData({ ...formData, ean: e.target.value })}
                    placeholder="ej. 0770200100456"
                    className="w-full font-mono px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-emerald-600 font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Categoría *
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.id === e.target.value);
                      setFormData({
                        ...formData,
                        categoryId: e.target.value,
                        categoryName: cat ? cat.name : '',
                      });
                    }}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Marca / Productor
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="ej. Finca La Esperanza"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Precio de Venta ($ COP) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="48000"
                    className="w-full font-mono font-bold px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Precio Anterior (Opcional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.compareAtPrice}
                    onChange={(e) => setFormData({ ...formData, compareAtPrice: e.target.value })}
                    placeholder="55000"
                    className="w-full font-mono px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Cantidad en Stock
                  </label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full font-mono px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    URL de Imagen
                  </label>
                  <input
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Descripción del Producto
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Notas de cata, perfil, empaque..."
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                    />
                    <span>Producto Activo para Venta en Catálogos</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingProduct(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingProduct ? 'Actualizar Producto' : 'Guardar Producto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY MANAGER MODAL */}
      {showCategoryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Gestión de Categorías
              </h3>
              <button
                onClick={() => setShowCategoryManager(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nueva categoría..."
                className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
              <button
                onClick={handleCreateCategory}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 rounded-xl"
              >
                Crear
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
              {categories.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white">{c.name}</span>
                  <span className="text-slate-400 text-[11px] font-mono">
                    {c.productCount} productos
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM SINGLE DELETE MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              ¿Eliminar este producto?
            </h3>
            <p className="text-xs text-slate-500">
              Esta acción eliminará el producto del inventario general. Esta operación no puede deshacerse.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteProduct(deleteConfirmId)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM BULK DELETE MODAL */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              ¿Eliminar {selectedProductIds.size} productos seleccionados?
            </h3>
            <p className="text-xs text-slate-500">
              Se eliminarán de forma permanente del inventario todos los productos seleccionados.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDeleteConfirm}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl"
              >
                Confirmar Eliminación Masiva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT INSPECTION MODAL */}
      {inspectProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Ficha Técnica del Producto
              </h3>
              <button
                onClick={() => setInspectProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                  {inspectProduct.imageUrl ? (
                    <img
                      src={inspectProduct.imageUrl}
                      alt={inspectProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                    {inspectProduct.categoryName || 'General'}
                  </span>
                  <h4 className="font-bold text-lg text-slate-900 dark:text-white">
                    {inspectProduct.name}
                  </h4>
                  <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                    {formatPrice(inspectProduct.price)}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">ID del Sistema:</span>
                  <span className="font-mono text-slate-400">{inspectProduct.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SKU:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {inspectProduct.sku}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Código EAN (Texto):</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {inspectProduct.ean || 'Sin EAN asignado'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Stock Disponible:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {inspectProduct.stock || 0} unidades
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado de Imagen:</span>
                  <span className="font-medium">
                    {inspectProduct.imageUrl
                      ? inspectProduct.imageVerified
                        ? 'Verificada por operador'
                        : 'Pendiente de verificación'
                      : 'Sin imagen'}
                  </span>
                </div>
              </div>

              {inspectProduct.description && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Descripción
                  </h5>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {inspectProduct.description}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-between">
              <button
                onClick={() => {
                  const p = inspectProduct;
                  setInspectProduct(null);
                  handleOpenEditModal(p);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Editar este producto
              </button>
              <button
                onClick={() => setInspectProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
