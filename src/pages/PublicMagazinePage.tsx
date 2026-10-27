/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * REVISTA VIRTUAL PÚBLICA, CARRITO Y PEDIDOS POR WHATSAPP (FASE 4)
 * Experiencia de lectura comercial independiente del panel administrativo.
 * - Acceso mediante enlace público único y no predecible (shareToken).
 * - Modo cuadrícula adaptable a móviles y modo pliego de revista editorial (Folio).
 * - Carrito de compras con persistencia por catálogo, validación estricta y diálogo seguro de vaciado.
 * - Formulario de cliente sin fricción ni registro obligatorio.
 * - Generador estructurado de mensajes wa.me con vista previa y aviso de confirmación obligatoria en WhatsApp.
 * - Registro inmutable del pedido con estado transparente 'whatsapp_opened' (sin falsas confirmaciones).
 * - Descarga directa del PDF vectorial correspondiente a la misma versión publicada.
 * - Pantalla de catálogo despublicado o no encontrado con canal directo de contacto.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BookOpen,
  Search,
  ShoppingBag,
  Send,
  FileDown,
  Trash2,
  Plus,
  Minus,
  X,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Tag,
  Phone,
  MapPin,
  User,
  Info,
  Layers,
  ArrowRight,
  ExternalLink,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { mockDataService } from '../services/mockDataService';
import { downloadCatalogPdfFile } from '../services/pdfGenerator';
import {
  buildWhatsAppOrderMessage,
  generateWhatsAppUrl,
  isWhatsAppMessageLong,
} from '../services/whatsappOrderService';
import {
  Catalog,
  Product,
  CartItem,
  CustomerCheckoutData,
  Order,
} from '../types';

export const PublicMagazinePage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { settings, formatPrice, isDark } = useSettings();

  // Estados del Catálogo
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Estados de Navegación, Filtros y Ordenación
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'name_asc'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'spread'>('grid');
  const [spreadPageIndex, setSpreadPageIndex] = useState(0);

  // Estados del Carrito
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  const [customer, setCustomer] = useState<CustomerCheckoutData>({
    name: '',
    phone: '',
    city: '',
    address: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<{ name?: string }>({});

  // Modal de Detalle de Producto
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  // Modal de Confirmación y Vista Previa de WhatsApp
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [isOrderSubmitted, setIsOrderSubmitted] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Exportación a PDF desde vista pública
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  // 1. Cargar el catálogo publicado mediante shareToken
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setNotFound(false);

    if (!shareToken) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    mockDataService.getByShareToken(shareToken).then((found) => {
      if (!isMounted) return;
      if (found && found.status === 'published') {
        setCatalog(found);

        // Cargar carrito persistido para este catálogo específico
        try {
          const savedCart = sessionStorage.getItem(`yor_cart_${found.id}`);
          if (savedCart) {
            setCart(JSON.parse(savedCart));
          }
        } catch {
          // ignore storage parse errors
        }
      } else {
        setNotFound(true);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [shareToken]);

  // Persistir carrito en sessionStorage cuando cambia
  useEffect(() => {
    if (catalog?.id) {
      try {
        sessionStorage.setItem(`yor_cart_${catalog.id}`, JSON.stringify(cart));
      } catch {
        // ignore
      }
    }
  }, [cart, catalog?.id]);

  // Obtener lista de productos desde el snapshot publicado (inmutable)
  const products: Product[] = useMemo(() => {
    if (!catalog) return [];
    if (catalog.publishedSnapshot?.products) {
      return catalog.publishedSnapshot.products
        .map((p) => p.snapshot)
        .filter((p): p is Product => Boolean(p));
    }
    return catalog.products
      .map((p) => p.snapshot)
      .filter((p): p is Product => Boolean(p));
  }, [catalog]);

  // Categorías presentes en los productos publicados
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set).sort();
  }, [products]);

  // Productos filtrados por búsqueda, categoría, ofertas y ordenación
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (selectedCategory !== 'all' && p.categoryName !== selectedCategory) {
        return false;
      }
      if (onlyDiscounted) {
        const hasDiscount = p.compareAtPrice && p.compareAtPrice > p.price;
        if (!hasDiscount) return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(query);
        const matchSku = p.sku.toLowerCase().includes(query);
        const matchEan = p.ean ? p.ean.toLowerCase().includes(query) : false;
        const matchBrand = p.brand ? p.brand.toLowerCase().includes(query) : false;
        if (!matchName && !matchSku && !matchEan && !matchBrand) {
          return false;
        }
      }
      return true;
    });

    // Ordenación
    if (sortBy === 'price_asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [products, selectedCategory, searchTerm, onlyDiscounted, sortBy]);

  // Pliegos para el modo revista (2 productos por pliego)
  const spreadPages = useMemo(() => {
    const pages: Product[][] = [];
    for (let i = 0; i < filteredProducts.length; i += 2) {
      pages.push(filteredProducts.slice(i, i + 2));
    }
    return pages;
  }, [filteredProducts]);

  // Totales del Carrito
  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const totalCartAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  // Configuración visual del catálogo (desde el snapshot publicado si existe)
  const visual = useMemo(() => {
    if (catalog?.publishedSnapshot?.visualSettings) {
      return catalog.publishedSnapshot.visualSettings;
    }
    return catalog?.visualSettings || {
      primaryColor: '#0f172a',
      secondaryColor: '#059669',
      fontFamily: 'sans',
      showPrices: true,
      showDiscounts: true,
      showBrand: true,
      showSku: true,
      showEan: true,
      showDescription: true,
    };
  }, [catalog]);

  // Manejadores del Carrito con validación estricta
  const handleAddToCart = (product: Product, quantity = 1) => {
    const validQty = Math.max(1, Math.floor(quantity));
    setCart((prev) => {
      const existingIdx = prev.findIndex((it) => it.productId === product.id);
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + validQty,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          productId: product.id,
          sku: product.sku,
          ean: product.ean,
          name: product.name,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          quantity: validQty,
          imageUrl: product.imageUrl,
          currency: product.currency || 'COP',
          categoryName: product.categoryName,
        };
        return [...prev, newItem];
      }
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((it) => {
          if (it.productId === productId) {
            const nextQty = it.quantity + delta;
            return nextQty > 0 ? { ...it, quantity: nextQty } : null;
          }
          return it;
        })
        .filter((it): it is CartItem => it !== null);
    });
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((it) => it.productId !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
    setShowClearCartConfirm(false);
  };

  // Mensaje estructurado de WhatsApp
  const whatsAppMessage = useMemo(() => {
    if (!catalog) return '';
    return buildWhatsAppOrderMessage({
      catalog,
      items: cart,
      customer,
      businessName: settings.businessName || 'YORCATALOG',
    });
  }, [catalog, cart, customer, settings.businessName]);

  const whatsAppUrl = useMemo(() => {
    return generateWhatsAppUrl(
      settings.whatsappNumber || '573001234567',
      whatsAppMessage
    );
  }, [settings.whatsappNumber, whatsAppMessage]);

  const isMsgLong = useMemo(() => isWhatsAppMessageLong(whatsAppMessage), [whatsAppMessage]);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(whatsAppMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  // Validar y abrir modal de revisión de WhatsApp
  const handleProceedToWhatsAppReview = () => {
    if (!customer.name.trim()) {
      setFormErrors({ name: 'Por favor ingresa tu nombre completo para identificar el pedido.' });
      return;
    }
    setFormErrors({});
    setIsWhatsAppModalOpen(true);
  };

  // Abrir WhatsApp y Registrar Pedido Inmutable con estado 'whatsapp_opened'
  const handleConfirmAndOpenWhatsApp = async () => {
    if (!catalog) return;
    if (!customer.name.trim()) {
      setFormErrors({ name: 'Por favor ingresa tu nombre completo.' });
      return;
    }

    setIsSubmittingOrder(true);
    try {
      // Registrar el pedido formalmente con estado 'whatsapp_opened' (sin asumir confirmación)
      const newOrder = await mockDataService.createOrder({
        catalogId: catalog.id,
        catalogTitle: catalog.title,
        catalogVersion: catalog.version,
        customerName: customer.name.trim(),
        customerPhone: customer.phone?.trim() || undefined,
        customerCity: customer.city?.trim() || undefined,
        customerAddress: customer.address?.trim() || undefined,
        items: cart.map((it) => ({
          productId: it.productId,
          sku: it.sku,
          ean: it.ean,
          name: it.name,
          price: it.price,
          compareAtPrice: it.compareAtPrice,
          quantity: it.quantity,
          subtotal: it.price * it.quantity,
          imageUrl: it.imageUrl,
        })),
        itemsCount: totalCartCount,
        totalAmount: totalCartAmount,
        currency: cart[0]?.currency || 'COP',
        status: 'whatsapp_opened',
        notes: customer.notes?.trim() || undefined,
        whatsappUrl: whatsAppUrl,
      });

      setLastOrderNumber(newOrder.orderNumber);
      setIsOrderSubmitted(true);
    } catch (err) {
      console.error('Error al registrar pedido para WhatsApp:', err);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Exportar PDF oficial de la misma versión publicada
  const handleDownloadPdf = async () => {
    if (!catalog) return;
    setIsExportingPdf(true);
    setPdfProgress(10);
    try {
      await downloadCatalogPdfFile(
        catalog,
        settings.businessName,
        settings.whatsappNumber,
        (p) => setPdfProgress(p)
      );
    } catch (err) {
      console.error('Error generando PDF de la revista:', err);
    } finally {
      setIsExportingPdf(false);
      setPdfProgress(0);
    }
  };

  // --- RENDER 1: ESTADO DE CARGA ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-emerald-600 flex items-center justify-center text-white mb-4 animate-bounce">
          <BookOpen className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Cargando Revista Virtual...
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Verificando enlace oficial y versión publicada
        </p>
      </div>
    );
  }

  // --- RENDER 2: CATÁLOGO NO ENCONTRADO O DESPUBLICADO ---
  if (notFound || !catalog) {
    const cleanNumber = settings.whatsappNumber ? settings.whatsappNumber.replace(/[^0-9]/g, '') : '';
    const contactMsg = encodeURIComponent(
      'Hola, intenté consultar su catálogo en línea pero figura temporalmente no disponible. ¿Podrían compartirme información actualizada de sus productos?'
    );

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Revista no disponible o despublicada
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              El catálogo que intentas consultar no existe o ha sido despublicado temporalmente por el comercio para actualización de inventario o precios.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-left space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300 block">
              Comercio Emisor:
            </span>
            <p className="font-bold text-slate-900 dark:text-white">
              {settings.businessName || 'YORCATALOG'}
            </p>
            {settings.whatsappNumber && (
              <p className="text-slate-500 font-mono text-[11px]">
                WhatsApp: {settings.whatsappNumber}
              </p>
            )}
          </div>

          <div className="pt-2">
            {cleanNumber ? (
              <a
                href={`https://wa.me/${cleanNumber}?text=${contactMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                <Send className="w-4 h-4" />
                <span>Contactar al Comercio por WhatsApp</span>
              </a>
            ) : (
              <p className="text-xs text-slate-400">
                Consulta directamente con el comercio emisor para obtener el enlace actualizado.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER 3: REVISTA VIRTUAL ACTIVA Y PUBLICADA ---
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* 1. Header Público Comercial */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
          {/* Identidad del Negocio */}
          <div className="flex items-center gap-3 min-w-0">
            {catalog.logoUrl || settings.logoUrl ? (
              <img
                src={catalog.logoUrl || settings.logoUrl}
                alt={settings.businessName}
                className="w-10 h-10 object-contain rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-white"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
                style={{ backgroundColor: visual.primaryColor || '#0f172a' }}
              >
                <BookOpen className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  {settings.businessName || 'YORCATALOG'}
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase bg-emerald-100 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 rounded-md">
                  Oficial v{catalog.version}.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {catalog.title}
              </p>
            </div>
          </div>

          {/* Acciones Superiores: Descargar PDF y Carrito */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition"
              title="Descargar versión PDF vectorial idéntica a esta publicación"
            >
              <FileDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden md:inline">
                {isExportingPdf ? `Generando ${pdfProgress}%` : 'Descargar PDF'}
              </span>
            </button>

            {/* Botón de Carrito en Header */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition hover:brightness-110"
              style={{ backgroundColor: visual.secondaryColor || '#059669' }}
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Mi Pedido</span>
              {totalCartCount > 0 && (
                <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white text-slate-950 font-mono text-[10px] font-black shadow-xs">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. Banner de Portada Editorial del Catálogo */}
      <section className="relative overflow-hidden bg-slate-950 text-white border-b border-slate-800">
        <div className="absolute inset-0 opacity-25">
          {catalog.coverImage ? (
            <img
              src={catalog.coverImage}
              alt={catalog.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-transparent" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Revista Comercial Interactiva</span>
              <span>•</span>
              <span className="text-white/80">Pedidos Directos por WhatsApp</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-serif leading-tight">
              {catalog.title}
            </h1>

            {catalog.subtitle && (
              <p className="text-sm sm:text-base text-slate-300 font-medium">
                {catalog.subtitle}
              </p>
            )}

            {catalog.description && (
              <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 leading-relaxed">
                {catalog.description}
              </p>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400 font-mono">
              <span>{products.length} productos publicados</span>
              <span>•</span>
              <span>Edición v{catalog.version}.0</span>
              {visual.showPrices === false && (
                <>
                  <span>•</span>
                  <span className="text-amber-400 font-semibold">Precios a cotizar</span>
                </>
              )}
            </div>
          </div>

          {/* Quick Order Status Card en Portada */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 max-w-sm w-full space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Artículos en tu orden:</span>
              <span className="font-mono font-bold text-white text-sm">
                {totalCartCount} {totalCartCount === 1 ? 'artículo' : 'artículos'}
              </span>
            </div>
            {visual.showPrices ? (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                <span className="text-slate-300">Total de referencia:</span>
                <span className="font-mono font-extrabold text-emerald-400 text-base">
                  {formatPrice(totalCartAmount)}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                <span className="text-slate-300">Régimen comercial:</span>
                <span className="text-emerald-400 font-semibold italic">Cotización a medida</span>
              </div>
            )}
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Ver Pedido y Enviar por WhatsApp</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. Barra de Búsqueda, Filtros y Modo de Vista */}
      <section className="sticky top-18 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Input de Búsqueda Reactiva */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, SKU, EAN o marca..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition text-slate-900 dark:text-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtros Secundarios y Selector de Modo de Vista */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Filtro Rápido Ofertas */}
              <button
                onClick={() => setOnlyDiscounted(!onlyDiscounted)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition flex items-center gap-1.5 ${
                  onlyDiscounted
                    ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Ofertas</span>
              </button>

              {/* Selector de Ordenación */}
              <div className="relative inline-flex items-center">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="default">Orden de Catálogo</option>
                  <option value="price_asc">Menor Precio</option>
                  <option value="price_desc">Mayor Precio</option>
                  <option value="name_asc">Nombre (A - Z)</option>
                </select>
              </div>

              {/* Selector de Modo de Vista */}
              <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Cuadrícula
                </button>
                <button
                  onClick={() => setViewMode('spread')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    viewMode === 'spread'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Revista Folio
                </button>
              </div>
            </div>
          </div>

          {/* Carrusel de Categorías */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-full shrink-0 transition ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Todos ({products.length})
              </button>
              {categories.map((cat) => {
                const count = products.filter((p) => p.categoryName === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full shrink-0 transition ${
                      selectedCategory === cat
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. Cuerpo Principal de Productos */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md mx-auto space-y-3">
            <Search className="w-8 h-8 mx-auto text-slate-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              No se encontraron productos
            </h3>
            <p className="text-xs text-slate-500">
              Prueba cambiando el término de búsqueda o restableciendo los filtros activos.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setOnlyDiscounted(false);
                setSortBy('default');
              }}
              className="px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition"
            >
              Restablecer Filtros
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* MODO CUADRÍCULA COMERCIAL ADAPTABLE A MÓVIL */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((prod) => {
              const inCartItem = cart.find((it) => it.productId === prod.id);
              const hasDiscount =
                visual.showDiscounts &&
                prod.compareAtPrice &&
                prod.compareAtPrice > prod.price;
              const discountPct = hasDiscount
                ? Math.round(((prod.compareAtPrice! - prod.price) / prod.compareAtPrice!) * 100)
                : 0;

              return (
                <div
                  key={prod.id}
                  className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  {/* Imagen y Badges */}
                  <div
                    className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800/80 cursor-pointer overflow-hidden"
                    onClick={() => {
                      setSelectedProduct(prod);
                      setDetailQuantity(1);
                    }}
                  >
                    {prod.imageUrl ? (
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <BookOpen className="w-8 h-8 stroke-1" />
                        <span className="text-[10px] mt-1 font-mono">Sin imagen</span>
                      </div>
                    )}

                    {/* Descuento Badge */}
                    {hasDiscount && (
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 text-[10px] font-extrabold uppercase bg-rose-600 text-white rounded-md shadow-xs">
                        -{discountPct}% OFF
                      </span>
                    )}

                    {/* Categoría Badge */}
                    {prod.categoryName && (
                      <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 text-[9px] font-semibold bg-slate-900/80 backdrop-blur-xs text-white rounded-md">
                        {prod.categoryName}
                      </span>
                    )}
                  </div>

                  {/* Datos del Producto */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      {visual.showBrand && prod.brand && (
                        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 block">
                          {prod.brand}
                        </span>
                      )}

                      <h3
                        onClick={() => {
                          setSelectedProduct(prod);
                          setDetailQuantity(1);
                        }}
                        className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer transition"
                      >
                        {prod.name}
                      </h3>

                      {visual.showDescription && prod.description && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {prod.description}
                        </p>
                      )}

                      {/* SKU / EAN (Conservando ceros iniciales como string) */}
                      <div className="pt-1 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                        {visual.showSku && prod.sku && <span>SKU: {prod.sku}</span>}
                        {visual.showEan && prod.ean && (
                          <span>EAN: {prod.ean}</span>
                        )}
                      </div>
                    </div>

                    {/* Precios y Botón de Añadir */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                      <div className="flex items-baseline justify-between">
                        {visual.showPrices ? (
                          <div className="space-y-0.5">
                            <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                              {formatPrice(prod.price)}
                            </span>
                            {hasDiscount && (
                              <span className="text-xs text-slate-400 line-through font-mono ml-2">
                                {formatPrice(prod.compareAtPrice!)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 italic">
                            Precio a cotizar
                          </span>
                        )}
                      </div>

                      {/* Acciones de Carrito */}
                      {inCartItem ? (
                        <div className="flex items-center justify-between p-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                          <button
                            onClick={() => handleUpdateQuantity(prod.id, -1)}
                            className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-lg transition"
                            title="Reducir cantidad"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-mono font-bold text-emerald-900 dark:text-emerald-200">
                            {inCartItem.quantity} en pedido
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(prod.id, 1)}
                            className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-lg transition"
                            title="Aumentar cantidad"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(prod, 1)}
                          className="w-full py-2 px-3 text-xs font-bold text-white rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition hover:brightness-105"
                          style={{ backgroundColor: visual.secondaryColor || '#059669' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Añadir al Pedido</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* MODO REVISTA PLIEGO FOLIO */
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Pliego {spreadPageIndex + 1} de {Math.max(1, spreadPages.length)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpreadPageIndex((p) => Math.max(0, p - 1))}
                  disabled={spreadPageIndex === 0}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setSpreadPageIndex((p) =>
                      Math.min(spreadPages.length - 1, p + 1)
                    )
                  }
                  disabled={spreadPageIndex >= spreadPages.length - 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-10 rounded-3xl shadow-lg min-h-[500px]">
              {(spreadPages[spreadPageIndex] || []).map((prod, idx) => (
                <div
                  key={prod.id}
                  className="flex flex-col justify-between p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-4"
                >
                  <div className="relative aspect-16/10 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700">
                    {prod.imageUrl ? (
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <BookOpen className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Página {spreadPageIndex * 2 + idx + 1} • {prod.categoryName || 'Catálogo'}
                    </span>
                    <h2 className="text-lg font-bold font-serif text-slate-900 dark:text-white">
                      {prod.name}
                    </h2>
                    {prod.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {prod.description}
                      </p>
                    )}
                    <div className="text-[10px] font-mono text-slate-400">
                      SKU: {prod.sku} {prod.ean && `| EAN: ${prod.ean}`}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      {visual.showPrices ? (
                        <span className="text-xl font-mono font-extrabold text-slate-900 dark:text-white">
                          {formatPrice(prod.price)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-600">
                          Precio a cotizar
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddToCart(prod, 1)}
                      className="py-2 px-4 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Añadir</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 5. Barra Flotante Inferior de Carrito (Móvil & Desktop) */}
      {totalCartCount > 0 && (
        <div className="sticky bottom-4 z-40 max-w-lg mx-auto w-[92%] animate-in slide-in-from-bottom duration-200">
          <div className="p-3.5 bg-slate-950 text-white rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {totalCartCount}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">
                  {totalCartCount} {totalCartCount === 1 ? 'artículo seleccionado' : 'artículos seleccionados'}
                </span>
                {visual.showPrices ? (
                  <span className="text-xs font-mono font-extrabold text-emerald-400">
                    Total: {formatPrice(totalCartAmount)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300 italic">
                    Cotización por WhatsApp
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition shrink-0"
            >
              <span>Ver Pedido</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL 1: DETALLE DE PRODUCTO ──────────────── */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <BookOpen className="w-12 h-12 stroke-1" />
                </div>
              )}
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                {selectedProduct.brand && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    {selectedProduct.brand}
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedProduct.name}
                </h3>
              </div>

              {selectedProduct.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedProduct.description}
                </p>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-1 font-mono text-slate-500">
                <div>SKU: <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.sku}</strong></div>
                {selectedProduct.ean && (
                  <div>EAN / Código de Barras: <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.ean}</strong></div>
                )}
                {selectedProduct.categoryName && (
                  <div>Categoría: <strong className="text-slate-800 dark:text-slate-200">{selectedProduct.categoryName}</strong></div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-[11px] text-slate-400 block">Precio:</span>
                  {visual.showPrices ? (
                    <span className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatPrice(selectedProduct.price)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-600">
                      Precio a cotizar
                    </span>
                  )}
                </div>

                {/* Stepper Validado */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-sm">
                    {detailQuantity}
                  </span>
                  <button
                    onClick={() => setDetailQuantity((q) => q + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  handleAddToCart(selectedProduct, detailQuantity);
                  setSelectedProduct(null);
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Añadir {detailQuantity} al Pedido</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL 2: CARRITO & FORMULARIO DE CLIENTE ──────────────── */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Header del Carrito */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Mi Pedido
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {totalCartCount} {totalCartCount === 1 ? 'artículo' : 'artículos'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={() => setShowClearCartConfirm(true)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition"
                    title="Vaciar pedido"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Diálogo Seguro de Confirmación para Vaciar Carrito (En la UI, sin window.confirm) */}
            {showClearCartConfirm && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/80 border-b border-rose-200 dark:border-rose-900 flex flex-col gap-2">
                <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                  ¿Deseas vaciar todos los artículos seleccionados del pedido?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearCart}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    Sí, vaciar
                  </button>
                  <button
                    onClick={() => setShowClearCartConfirm(false)}
                    className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Contenido del Carrito */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {cart.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <ShoppingBag className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 stroke-1" />
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    Tu pedido está vacío
                  </h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Explora el catálogo y pulsa "Añadir al Pedido" en los productos que desees consultar o comprar.
                  </p>
                </div>
              ) : (
                <>
                  {/* Lista de Artículos */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Artículos Seleccionados
                    </span>
                    {cart.map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800"
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <BookOpen className="w-5 h-5 stroke-1" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </h4>
                          <div className="text-[10px] font-mono text-slate-400">
                            {visual.showPrices
                              ? formatPrice(item.price)
                              : 'A cotizar'}
                            {item.ean && ` • EAN: ${item.ean}`}
                          </div>

                          {/* Stepper de Cantidad */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleUpdateQuantity(item.productId, -1)}
                              className="p-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-xs font-bold w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateQuantity(item.productId, 1)}
                              className="p-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {visual.showPrices && (
                            <span className="text-xs font-mono font-extrabold text-slate-900 dark:text-white block">
                              {formatPrice(item.price * item.quantity)}
                            </span>
                          )}
                          <button
                            onClick={() => handleRemoveItem(item.productId)}
                            className="p-1 mt-1 text-slate-300 hover:text-rose-500 transition"
                            title="Eliminar artículo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Formulario del Cliente */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Tus Datos de Contacto (Sin Registro Obligatorio)
                    </span>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                        Tu Nombre Completo <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={customer.name}
                          onChange={(e) => {
                            setCustomer((prev) => ({ ...prev, name: e.target.value }));
                            if (formErrors.name) setFormErrors({});
                          }}
                          placeholder="Ej. Carolina Morales"
                          className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                        />
                      </div>
                      {formErrors.name && (
                        <p className="text-[10px] text-rose-500 mt-1">{formErrors.name}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                          Teléfono (Opcional)
                        </label>
                        <div className="relative">
                          <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="tel"
                            value={customer.phone}
                            onChange={(e) =>
                              setCustomer((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            placeholder="Ej. 3001234567"
                            className="w-full pl-7 pr-2 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                          Ciudad (Opcional)
                        </label>
                        <div className="relative">
                          <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={customer.city}
                            onChange={(e) =>
                              setCustomer((prev) => ({ ...prev, city: e.target.value }))
                            }
                            placeholder="Ej. Bogotá"
                            className="w-full pl-7 pr-2 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                        Dirección de entrega (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customer.address}
                        onChange={(e) =>
                          setCustomer((prev) => ({ ...prev, address: e.target.value }))
                        }
                        placeholder="Ej. Calle 93 # 12-45 Apto 402"
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                        Comentarios u Observaciones (Opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={customer.notes}
                        onChange={(e) =>
                          setCustomer((prev) => ({ ...prev, notes: e.target.value }))
                        }
                        placeholder="Indicaciones especiales de entrega o consultas del producto..."
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white resize-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer con Total y Botón de Revisión de WhatsApp */}
            {cart.length > 0 && (
              <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {visual.showPrices ? 'Total Liquidado:' : 'Estado de Precios:'}
                  </span>
                  <span className="text-lg font-mono font-black text-slate-900 dark:text-white">
                    {visual.showPrices ? formatPrice(totalCartAmount) : 'A cotizar'}
                  </span>
                </div>

                <button
                  onClick={handleProceedToWhatsAppReview}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition"
                >
                  <Send className="w-4 h-4" />
                  <span>Revisar y Enviar Pedido por WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── MODAL 3: VISTA PREVIA Y AVISO DE TRANSPARENCIA DE WHATSAPP ──────────────── */}
      {isWhatsAppModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header del Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Vista Previa del Pedido WhatsApp
                </h3>
              </div>
              <button
                onClick={() => setIsWhatsAppModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo con texto formateado */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Aviso Obligatorio de Transparencia de WhatsApp */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Paso requerido:</strong> Al pulsar "Continuar a WhatsApp", se abrirá WhatsApp con el mensaje estructurado listo. <em>El pedido no se considerará recibido hasta que pulses "Enviar" en tu aplicación de WhatsApp</em> y sea confirmado por un asesor comercial.
                </div>
              </div>

              {/* Caja de previsualización del mensaje */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Mensaje codificado para <strong>{settings.whatsappNumber}</strong>:</span>
                  <button
                    onClick={handleCopyMessage}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500"
                  >
                    {copiedMessage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMessage ? 'Copiado' : 'Copiar texto'}</span>
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 text-emerald-400 rounded-2xl text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-56 border border-slate-800 select-all">
                  {whatsAppMessage}
                </pre>
              </div>

              {isMsgLong && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                  ⚠️ Tu pedido contiene varios artículos. Si tu aplicación de WhatsApp recorta el mensaje por longitud, puedes usar el botón <strong>"Copiar texto"</strong> de arriba y pegarlo directamente en la conversación.
                </p>
              )}

              {/* Registro Inmutable Explicado */}
              {isOrderSubmitted && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Pedido Registrado: {lastOrderNumber}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Se ha guardado una instantánea inmutable en el registro del comercio con estado <em>"Enlace WhatsApp abierto"</em>. Tu asesor comercial lo identificará con este código.
                  </p>
                </div>
              )}
            </div>

            {/* Footer con Acciones */}
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                onClick={() => setIsWhatsAppModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Volver a Modificar Pedido
              </button>

              {/* Botón directo de apertura wa.me sin popup-blockers */}
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleConfirmAndOpenWhatsApp}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                <span>Continuar y Abrir WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
