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
  X,
  Globe,
  Sun,
  Moon,
  Database,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ isOpen, onClose }) => {
  const { t, theme, updateSettings, language, settings, isDark } = useSettings();

  if (!isOpen) return null;

  const navItems = [
    { to: '/', label: t.nav.dashboard, icon: LayoutDashboard, exact: true },
    { to: '/products', label: t.nav.products, icon: Package },
    { to: '/import', label: t.nav.import, icon: Upload, badge: 'CSV' },
    { to: '/images', label: t.nav.images, icon: ImageIcon, badge: 'EAN' },
    { to: '/catalogs', label: t.nav.catalogs, icon: BookOpen, badge: 'PDF' },
    { to: '/templates', label: t.nav.templates, icon: LayoutTemplate, badge: '4' },
    { to: '/magazine', label: t.nav.magazine, icon: Sparkles, badge: 'Live' },
    { to: '/orders', label: t.nav.orders, icon: ShoppingBag, badge: 'WhatsApp' },
    { to: '/settings', label: t.nav.settings, icon: Settings },
  ];

  const toggleTheme = () => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  };

  const toggleLanguage = () => {
    updateSettings({ language: language === 'es' ? 'en' : 'es' });
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-950 shadow-2xl flex flex-col z-50 border-r border-slate-200 dark:border-slate-800">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-950 dark:bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
              Y
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900 dark:text-white">
                YorCatalog
              </span>
              <p className="text-[10px] text-slate-400 truncate max-w-36">
                {settings.businessName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 text-xs font-medium rounded-xl transition ${
                    isActive
                      ? 'bg-slate-950 text-white dark:bg-emerald-600 dark:text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Demo Adapter Alert */}
        <div className="p-3 mx-3 mb-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 mb-1">
            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Fase 4: Revistas & Pedidos</span>
          </div>
          <p className="text-[10px]">Revistas públicas, carrito y recepción por WhatsApp.</p>
        </div>

        {/* Install PWA in Mobile Drawer */}
        <div className="px-3 pb-3">
          <PWAInstallButton variant="full" className="w-full justify-center" />
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 py-1 px-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 rounded-md"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase text-[11px] font-semibold">{language}</span>
          </button>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 py-1 px-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 rounded-md"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium">{isDark ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
