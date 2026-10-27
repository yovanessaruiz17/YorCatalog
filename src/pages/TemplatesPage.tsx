/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BIBLIOTECA DE PLANTILLAS EDITORIALES Y COMERCIALES (FASE 3)
 * Muestra las 4 plantillas requeridas:
 * - Minimalista Nórdico
 * - Editorial Revista Luxe
 * - Promocional & Ofertas
 * - Catálogo por Categorías (B2B)
 */

import React from 'react';
import { LayoutTemplate, Check, Sparkles, FileText, QrCode, ArrowRight } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { CATALOG_TEMPLATES } from '../services/templateCatalog';
import { Link, useNavigate } from 'react-router-dom';

export const TemplatesPage: React.FC = () => {
  const { t } = useSettings();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 rounded-md">
              Fase 3 Activa
            </span>
            <span className="text-xs text-slate-400 font-mono">4 Diseños Reales</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.templates.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Diseños editoriales, cuadrículas comerciales de alta densidad y composiciones de revista listas para exportación PDF
          </p>
        </div>

        <Link
          to="/catalogs"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition"
        >
          <span>Ir al Diseñador de Catálogos</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {CATALOG_TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 transition"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {tpl.category}
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  {tpl.badge}
                </span>
              </div>

              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                {tpl.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {tpl.description}
              </p>

              {/* Visual mini-spec box */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 mb-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Cuadrícula</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {tpl.defaultSettings.gridColumns} columnas
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Por Página</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {tpl.defaultSettings.productsPerPage} productos
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Tipografía</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {tpl.defaultSettings.fontFamily}
                  </span>
                </div>
              </div>

              {/* Feature items */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {tpl.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-400">
                Template ID: {tpl.id}
              </span>
              <Link
                to="/catalogs"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
              >
                <span>Usar en Diseñador →</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
