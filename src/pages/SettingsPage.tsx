/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  Building2,
  Phone,
  Coins,
  Globe,
  Palette,
  Sliders,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { SupportedCurrency, SupportedLanguage, ThemeMode } from '../types';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();
  const [formData, setFormData] = useState(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.settings.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t.settings.subtitle}
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t.settings.saveSuccess}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Business Profile */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.businessSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.businessNameLabel}
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                required
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.taglineLabel}
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.contactEmailLabel}
              </label>
              <input
                type="email"
                value={formData.contactEmail || ''}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                URL del Logotipo (Opcional)
              </label>
              <input
                type="url"
                value={formData.logoUrl || ''}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: WhatsApp Channel */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.whatsappSection}
            </h2>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.settings.whatsappLabel}
            </label>
            <input
              type="text"
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              required
              placeholder="+573001234567"
              className="w-full max-w-md px-3.5 py-2 font-mono text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t.settings.whatsappHelp}
            </p>
          </div>
        </div>

        {/* Section 3: Currency & Language */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.localizationSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.currencyLabel}
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value as SupportedCurrency })
                }
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              >
                <option value="COP">COP ($ Pesos Colombianos)</option>
                <option value="USD">USD ($ Dólares Americanos)</option>
                <option value="EUR">EUR (€ Euros)</option>
                <option value="MXN">MXN ($ Pesos Mexicanos)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.languageLabel}
              </label>
              <select
                value={formData.language}
                onChange={(e) =>
                  setFormData({ ...formData, language: e.target.value as SupportedLanguage })
                }
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              >
                <option value="es">Español (Predeterminado)</option>
                <option value="en">English (US)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Visual Theme */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Palette className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.themeSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'light', label: t.settings.themeLight },
              { id: 'dark', label: t.settings.themeDark },
              { id: 'system', label: t.settings.themeSystem },
            ].map((option) => (
              <label
                key={option.id}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                  formData.theme === option.id
                    ? 'border-slate-950 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/80 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  checked={formData.theme === option.id}
                  onChange={() => setFormData({ ...formData, theme: option.id as ThemeMode })}
                  className="w-4 h-4 text-slate-950 dark:text-emerald-500 focus:ring-0"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Section 5: Catalog Preferences */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.catalogPrefsSection}
            </h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.showPricesLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.showPrices}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      showPrices: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.showStockLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.showStock}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      showStock: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.allowOrdersLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.allowDirectOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      allowDirectOrder: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.includeQrLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.includeQrCode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      includeQrCode: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Section 6: Supabase & Production Infrastructure (Fase 5) */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                ⚡
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Infraestructura y Persistencia (Supabase & Multi-Tenant)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
              Fase 5 Integrada
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">
                Estado del Motor de Persistencia:
              </span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Arquitectura Dual: Supabase PostgreSQL + Adaptador Local
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Cuando configuras <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>, la aplicación sincroniza directamente con tu instancia de base de datos relacional y storage. En ausencia de llaves remotas, conmuta al adaptador seguro local sin interrupciones.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
              <span className="font-bold font-sans text-slate-900 dark:text-white block mb-1">
                Migraciones SQL Versionadas:
              </span>
              <div className="text-slate-600 dark:text-slate-300">✓ 001_initial_schema.sql (13 tablas multi-tenant)</div>
              <div className="text-slate-600 dark:text-slate-300">✓ 002_multi_tenant_rls.sql (Políticas RLS y acceso anónimo a catálogos publicados)</div>
              <div className="text-slate-600 dark:text-slate-300">✓ 003_storage_buckets.sql (catalog-images, workspace-assets, import-temp)</div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t.common.saving : t.common.save}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
