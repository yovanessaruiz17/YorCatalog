/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Upload,
  Image as ImageIcon,
  BookOpen,
  LayoutTemplate,
  Sparkles,
  ShoppingBag,
  Settings,
  Sun,
  Moon,
  Globe,
  Database,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface SidebarProps {
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const { t, theme, updateSettings, language, settings, isDark } = useSettings();
  const { currentWorkspace, isLiveSupabase } = useAuth();

  const navItems = [
    { to: '/', label: t.nav.dashboard, icon: LayoutDashboard, exact: true, badge: undefined },
    { to: '/products', label: t.nav.products, icon: Package, badge: undefined },
    { to: '/import', label: t.nav.import, icon: Upload, badge: 'CSV', phase: false },
    { to: '/images', label: t.nav.images, icon: ImageIcon, badge: 'EAN', phase: false },
    { to: '/catalogs', label: t.nav.catalogs, icon: BookOpen, badge: 'PDF', phase: false },
    { to: '/templates', label: t.nav.templates, icon: LayoutTemplate, badge: '4', phase: false },
    { to: '/magazine', label: t.nav.magazine, icon: Sparkles, badge: 'Live', phase: false },
    { to: '/orders', label: t.nav.orders, icon: ShoppingBag, badge: 'WhatsApp', phase: false },
    { to: '/settings', label: t.nav.settings, icon: Settings, badge: undefined },
  ];

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: nextTheme });
  };

  const toggleLanguage = () => {
    const nextLang = language === 'es' ? 'en' : 'es';
    updateSettings({ language: nextLang });
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800/80 transition-colors z-30 select-none font-sans">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 h-18 border-b border-slate-100 dark:border-slate-800/60">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-950 dark:bg-emerald-600 text-white shadow-xs">
          <BookOpen className="w-5 h-5 text-emerald-400 dark:text-white" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
            YorCatalog
          </span>
          <span className="text-[10px] font-medium tracking-wide uppercase text-slate-400 dark:text-slate-500 truncate flex items-center gap-1">
            <Building2 className="w-2.5 h-2.5" />
            <span className="truncate">{currentWorkspace?.name || settings.businessName || 'Comercial PWA'}</span>
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
          {language === 'es' ? 'Menú Principal' : 'Main Menu'}
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'bg-slate-950 text-white dark:bg-emerald-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                }`
              }
            >
              <div className="flex items-center gap-3 truncate">
                <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide rounded-md transition-colors ${
                    item.phase
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Fase 5 Status Card */}
      <div className="px-4 py-3 mx-3 my-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              Fase 5: Producción
            </span>
          </div>
          <span
            className={`w-2 h-2 rounded-full ${
              isLiveSupabase ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'
            }`}
          />
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
          {isLiveSupabase
            ? 'PostgreSQL multi-tenant con RLS y Storage en Supabase.'
            : 'Modo local activo. Listo para conectar Supabase.'}
        </p>
      </div>

      {/* PWA Install Area */}
      <div className="px-3 pb-2">
        <PWAInstallButton variant="full" className="w-full justify-center" />
      </div>

      {/* Footer Controls: Language & Theme */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 text-xs text-slate-500">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2 py-1 hover:text-slate-900 dark:hover:text-white rounded-md transition"
          title="Cambiar idioma / Switch language"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="font-semibold uppercase text-[11px]">{language}</span>
        </button>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md transition"
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
          <span className="text-[11px] font-medium">{isDark ? 'Dark' : 'Light'}</span>
        </button>

        <span className="text-[10px] font-mono text-slate-400">v5.0</span>
      </div>
    </aside>
  );
};
