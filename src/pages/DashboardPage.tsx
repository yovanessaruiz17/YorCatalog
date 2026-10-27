/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Image as ImageIcon,
  BookOpen,
  FileText,
  ShoppingBag,
  UploadCloud,
  PlusCircle,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Database,
} from 'lucide-react';
import { mockDataService } from '../services/mockDataService';
import { Product, Catalog, Order, ImportRecord } from '../types';
import { useSettings } from '../context/SettingsContext';

export const DashboardPage: React.FC = () => {
  const { t, formatPrice, formatDate } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [p, c, o, i] = await Promise.all([
          mockDataService.getAll(),
          mockDataService.getCatalogs(),
          mockDataService.getOrders(),
          mockDataService.getHistory(),
        ]);
        setProducts(p);
        setCatalogs(c);
        setOrders(o);
        setImports(i);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const pendingImagesCount = products.filter((p) => !p.imageUrl || !p.imageVerified).length;
  const publishedCatalogs = catalogs.filter((c) => c.status === 'published');
  const draftCatalogs = catalogs.filter((c) => c.status === 'draft');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 dark:border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.dashboard.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t.dashboard.subtitle}
          </p>
        </div>

        {/* Demo Adapter Alert Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-400">
          <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{t.common.demoMode}</span>
        </div>
      </div>

      {/* Quick Action Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/import"
          className="group relative flex items-start gap-4 p-5 bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-400 dark:hover:border-slate-700 transition"
        >
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                {t.dashboard.actionImportTitle}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                Fase 2
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {t.dashboard.actionImportDesc}
            </p>
          </div>
        </Link>

        <Link
          to="/catalogs"
          className="group relative flex items-start gap-4 p-5 bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-400 dark:hover:border-slate-700 transition"
        >
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                {t.dashboard.actionCreateCatalogTitle}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                Fase 3
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {t.dashboard.actionCreateCatalogDesc}
            </p>
          </div>
        </Link>

        <Link
          to="/magazine"
          className="group relative flex items-start gap-4 p-5 bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-400 dark:hover:border-slate-700 transition"
        >
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                {t.dashboard.actionViewMagazineTitle}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                Fase 4
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {t.dashboard.actionViewMagazineDesc}
            </p>
          </div>
        </Link>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          to="/products"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t.dashboard.statProducts}
            </span>
            <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
            {products.length}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            {products.filter((p) => p.active).length} activos para venta
          </span>
        </Link>

        <Link
          to="/images"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t.dashboard.statPendingImages}
            </span>
            <ImageIcon className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {pendingImagesCount}
          </div>
          <span className="mt-1 block text-[11px] text-amber-600/80 dark:text-amber-400/80">
            Requieren EAN o verificación
          </span>
        </Link>

        <Link
          to="/catalogs"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t.dashboard.statCatalogs}
            </span>
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
            {publishedCatalogs.length}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            {draftCatalogs.length} en borrador
          </span>
        </Link>

        <Link
          to="/orders"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              {t.dashboard.statOrders}
            </span>
            <ShoppingBag className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
            {orders.length}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
            Vía catálogo WhatsApp
          </span>
        </Link>
      </div>

      {/* Two Column Layout: Recent Orders & Import History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t.dashboard.recentOrders}
              </h2>
            </div>
            <Link
              to="/orders"
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>{t.dashboard.viewAll}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {orders.map((ord) => (
              <div
                key={ord.id}
                className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {ord.orderNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                        ord.status === 'prepared'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                      }`}
                    >
                      {ord.status === 'prepared' ? 'Preparado' : 'Pendiente WhatsApp'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {ord.customerName} ({ord.itemsCount} productos)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {formatPrice(ord.totalAmount)}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(ord.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Imports */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t.dashboard.recentImports}
              </h2>
            </div>
            <Link
              to="/import"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>{t.dashboard.viewAll}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {imports.map((imp) => (
              <div
                key={imp.id}
                className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {imp.fileName}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 rounded-md">
                      <CheckCircle2 className="w-3 h-3" />
                      Completada
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {imp.importedCount} de {imp.totalRows} filas importadas sin errores
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-400 font-mono">
                  {formatDate(imp.createdAt)}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Informative Notice */}
          <div className="mt-4 p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              En la <strong>Fase 2</strong>, este módulo procesará archivos CSV reales con mapeo visual, deduplicación y preservación de ceros en EAN.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
