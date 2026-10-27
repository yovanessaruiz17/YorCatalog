/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * REVISTA VIRTUAL PÚBLICA & ADMINISTRACIÓN DE PUBLICACIONES (FASE 4)
 * Permite a la empresa previsualizar sus revistas virtuales publicadas,
 * gestionar sus enlaces comerciales no predecibles, probar el simulador de pedidos
 * de WhatsApp y auditar la coherencia entre la versión web y el PDF descargable.
 */

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  ShoppingBag,
  Send,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Globe,
  FileDown,
  Layers,
  Eye,
  AlertTriangle,
  QrCode,
  BookOpen,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { mockDataService } from '../services/mockDataService';
import { downloadCatalogPdfFile } from '../services/pdfGenerator';
import QRCode from 'qrcode';
import { buildPublicCatalogUrl } from '../utils/url';
import { Catalog, Product } from '../types';

export const MagazinePage: React.FC = () => {
  const { t, formatPrice, settings } = useSettings();
  const [publishedCatalogs, setPublishedCatalogs] = useState<Catalog[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<Catalog | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [unpublishTarget, setUnpublishTarget] = useState<Catalog | null>(null);
  const [activeCatalogQr, setActiveCatalogQr] = useState<string | null>(null);

  useEffect(() => {
    if (activeCatalog) {
      const url = buildPublicCatalogUrl(activeCatalog.shareToken || activeCatalog.slug);
      QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
        .then((data) => setActiveCatalogQr(data))
        .catch(() => setActiveCatalogQr(null));
    } else {
      setActiveCatalogQr(null);
    }
  }, [activeCatalog]);

  // Cargar catálogos publicados
  const loadCatalogs = () => {
    mockDataService.getPublishedCatalogs().then((cats) => {
      setPublishedCatalogs(cats);
      if (cats.length > 0 && (!activeCatalog || !cats.some((c) => c.id === activeCatalog.id))) {
        setActiveCatalog(cats[0]);
      }
    });
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  // Productos del catálogo activo
  const activeProducts: Product[] = React.useMemo(() => {
    if (!activeCatalog) return [];
    if (activeCatalog.publishedSnapshot?.products) {
      return activeCatalog.publishedSnapshot.products
        .map((p) => p.snapshot)
        .filter((p): p is Product => Boolean(p));
    }
    return activeCatalog.products
      .map((p) => p.snapshot)
      .filter((p): p is Product => Boolean(p));
  }, [activeCatalog]);

  const handleCopyLink = (cat: Catalog) => {
    const url = buildPublicCatalogUrl(cat.shareToken || cat.slug);
    navigator.clipboard.writeText(url);
    setCopiedToken(cat.id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleUnpublish = (cat: Catalog) => {
    setUnpublishTarget(cat);
  };

  const confirmUnpublish = async () => {
    if (!unpublishTarget) return;
    await mockDataService.unpublishCatalog(unpublishTarget.id);
    setUnpublishTarget(null);
    loadCatalogs();
  };

  const handleDownloadPdf = async (cat: Catalog) => {
    setIsExportingPdf(true);
    setPdfProgress(10);
    try {
      await downloadCatalogPdfFile(
        cat,
        settings.businessName,
        settings.whatsappNumber,
        (p) => setPdfProgress(p)
      );
    } catch (e) {
      console.error(e);
      alert('Error generando el documento PDF.');
    } finally {
      setIsExportingPdf(false);
      setPdfProgress(0);
    }
  };

  const currentProduct = activeProducts[currentSlideIndex];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-md">
              Fase 4 Activa
            </span>
            <span className="text-xs text-slate-400">Revistas Públicas & WhatsApp</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            Revistas Virtuales Públicas
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Administra los enlaces públicos no predecibles, previsualiza el modo revista y verifica la recepción de pedidos comerciales.
          </p>
        </div>

        {activeCatalog && (
          <div className="flex items-center gap-2">
            <a
              href={`/m/${activeCatalog.shareToken || activeCatalog.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir Revista Pública</span>
            </a>
          </div>
        )}
      </div>

      {/* Regla de Consistencia y Seguridad */}
      <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-start gap-3 text-xs text-emerald-900 dark:text-emerald-200">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-sm block">
            Consistencia Garantizada entre PDF y Revista Web:
          </span>
          <p className="leading-relaxed">
            Tanto la Revista Virtual en línea como el PDF descargable consumen exactamente la misma instantánea versionada (Snapshot v{activeCatalog?.version || 1}). Los clientes navegan por la versión oficial sin exponer costos internos ni alterar pedidos en curso.
          </p>
        </div>
      </div>

      {/* Selector de Catálogos Publicados */}
      {publishedCatalogs.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
          <BookOpen className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            No hay catálogos publicados actualmente
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Ve a la sección <strong>Catálogos</strong>, diseña tu catálogo con los productos que deseas comercializar y pulsa <em>"Publicar Catálogo"</em> para generar su URL comercial única.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tarjetas de Catálogos Publicados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {publishedCatalogs.map((cat) => {
              const isSelected = activeCatalog?.id === cat.id;
              const publicUrl = buildPublicCatalogUrl(cat.shareToken || cat.slug);

              return (
                <div
                  key={cat.id}
                  onClick={() => {
                    setActiveCatalog(cat);
                    setCurrentSlideIndex(0);
                  }}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 border-emerald-500 dark:border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                        {cat.coverImage ? (
                          <img
                            src={cat.coverImage}
                            alt={cat.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <BookOpen className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                            {cat.title}
                          </h3>
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded">
                            v{cat.version}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {cat.subtitle || cat.description}
                        </p>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full shrink-0">
                      En Línea
                    </span>
                  </div>

                  {/* URL Pública no predecible */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{publicUrl}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(cat);
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-100 transition shrink-0 flex items-center gap-1"
                    >
                      {copiedToken === cat.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-500" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Acciones de Catálogo */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPdf(cat);
                      }}
                      className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Descargar PDF</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnpublish(cat);
                      }}
                      className="text-rose-600 hover:text-rose-700 text-xs font-medium transition"
                    >
                      Despublicar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Simulador Interactivo de Experiencia del Cliente */}
          {activeCatalog && (
            <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    Previsualización Editorial: {activeCatalog.title} (v{activeCatalog.version})
                  </h3>
                </div>

                {activeProducts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentSlideIndex((p) => Math.max(0, p - 1))
                      }
                      disabled={currentSlideIndex === 0}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono font-semibold">
                      Artículo {currentSlideIndex + 1} de {activeProducts.length}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentSlideIndex((p) =>
                          Math.min(activeProducts.length - 1, p + 1)
                        )
                      }
                      disabled={currentSlideIndex >= activeProducts.length - 1}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Vista previa simulada de tarjeta de pliego */}
              {currentProduct ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 text-white min-h-[380px] flex flex-col md:flex-row">
                  {/* Izquierda: Fotografía del producto */}
                  <div className="w-full md:w-1/2 relative min-h-[240px] md:min-h-full bg-slate-900 flex items-center justify-center">
                    {currentProduct.imageUrl ? (
                      <img
                        src={currentProduct.imageUrl}
                        alt={currentProduct.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <BookOpen className="w-12 h-12 stroke-1" />
                        <span className="text-xs mt-2 font-mono">Sin imagen asociada</span>
                      </div>
                    )}
                  </div>

                  {/* Derecha: Tipografía Editorial & Simulador WhatsApp */}
                  <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between bg-slate-900/95 backdrop-blur-md">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold tracking-widest uppercase text-emerald-400">
                          {currentProduct.categoryName || 'Catálogo Oficial'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          SKU: {currentProduct.sku}
                        </span>
                      </div>

                      <h2 className="text-xl sm:text-2xl font-bold font-serif leading-tight">
                        {currentProduct.name}
                      </h2>

                      {currentProduct.description && (
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                          {currentProduct.description}
                        </p>
                      )}

                      <div className="text-2xl font-extrabold font-mono text-white pt-2">
                        {activeCatalog.visualSettings.showPrices
                          ? formatPrice(currentProduct.price)
                          : 'Precio a cotizar'}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
                      <a
                        href={`/m/${activeCatalog.shareToken || activeCatalog.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Ver Experiencia Completa con Carrito Público</span>
                      </a>
                      <p className="text-[10px] text-center text-slate-400">
                        Los clientes podrán armar su pedido y enviarlo codificado al WhatsApp {settings.whatsappNumber}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Este catálogo no tiene productos incluidos en su snapshot.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación para despublicar */}
      {unpublishTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                ¿Despublicar "{unpublishTarget.title}"?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                El enlace público comercial dejará de estar accesible para los clientes inmediatamente.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setUnpublishTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmUnpublish}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                Confirmar Despublicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};