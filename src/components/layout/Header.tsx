/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, Sun, Moon, Globe, ShoppingBag, LogOut, Building2, RefreshCw } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { theme, updateSettings, language, settings, isDark } = useSettings();
  const {
    user,
    profile,
    currentWorkspace,
    workspaces,
    switchWorkspace,
    signOut,
    connectionState,
    retryConnection,
  } = useAuth();
  const [headerNotice, setHeaderNotice] = useState<string | null>(null);

  const toggleTheme = async () => {
    setHeaderNotice(null);
    try {
      await updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
    } catch (err) {
      setHeaderNotice(
        err instanceof Error ? err.message : 'No se pudo guardar la preferencia de tema.'
      );
    }
  };

  const toggleLanguage = async () => {
    setHeaderNotice(null);
    try {
      await updateSettings({ language: language === 'es' ? 'en' : 'es' });
    } catch (err) {
      setHeaderNotice(
        err instanceof Error ? err.message : 'No se pudo guardar la preferencia de idioma.'
      );
    }
  };

  const statusMeta = (() => {
    switch (connectionState) {
      case 'connected':
        return {
          dot: 'bg-emerald-500 animate-pulse',
          label: 'Firebase Cloud',
          title: 'Conectado a Cloud Firestore, Auth y Storage',
        };
      case 'checking':
        return {
          dot: 'bg-sky-500 animate-pulse',
          label: 'Verificando...',
          title: 'Validando conectividad con Cloud Firestore',
        };
      case 'unreachable':
        return {
          dot: 'bg-amber-500',
          label: 'Sin conexión Cloud',
          title: 'Firebase Firestore temporalmente inaccesible',
        };
      case 'session_expired':
        return {
          dot: 'bg-rose-500',
          label: 'Sesión Expirada',
          title: 'Tu sesión expiró. Inicia sesión nuevamente.',
        };
      case 'unauthorized':
        return {
          dot: 'bg-rose-500',
          label: 'Sin Permisos',
          title: 'Acceso restringido por reglas de seguridad',
        };
      case 'not_configured':
        return {
          dot: 'bg-rose-500',
          label: 'No Configurado',
          title: 'Firebase no está configurado',
        };
      default:
        return {
          dot: 'bg-amber-500',
          label: 'Error Persistencia',
          title: 'Error reciente al sincronizar con Firestore',
        };
    }
  })();

  return (
    <header className="sticky top-0 z-20 flex flex-col bg-white/95 dark:bg-slate-950/95 border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md transition-colors font-sans">
      <div className="flex items-center justify-between h-16 px-4 md:px-8">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand logo for mobile screens */}
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-950 dark:bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              Y
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
              YorCatalog
            </span>
          </Link>

          {/* Workspace Switcher */}
          {workspaces.length > 1 ? (
            <div className="relative inline-flex items-center">
              <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={currentWorkspace?.id || ''}
                onChange={(e) => switchWorkspace(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-semibold">
                {currentWorkspace?.name || settings.businessName}
              </span>
            </div>
          )}

          {/* Firebase Status Indicator (6 estados R2.2) */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-800"
            title={statusMeta.title}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
            <span className="text-slate-500 dark:text-slate-400">{statusMeta.label}</span>
            {connectionState === 'unreachable' && (
              <button
                type="button"
                onClick={() => void retryConnection()}
                className="ml-1 text-emerald-600 hover:text-emerald-500"
                title="Reintentar conexión"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right Tools */}
        <div className="flex items-center gap-2 md:gap-3">
          <PWAInstallButton />

          <button
            onClick={() => void toggleLanguage()}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition"
            title="Cambiar idioma"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase text-[11px]">{language}</span>
          </button>

          <button
            onClick={() => void toggleTheme()}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition"
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            aria-label="Cambiar tema"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          <Link
            to="/orders"
            className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition"
            title="Recepción de Pedidos"
          >
            <ShoppingBag className="w-4 h-4" />
          </Link>

          {/* User Profile & Logout */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden xl:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                  {profile?.fullName || user.email?.split('@')[0]}
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-28 font-mono">
                  {user.email}
                </span>
              </div>

              <button
                onClick={() => void signOut()}
                className="p-2 text-slate-400 hover:text-rose-500 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-rose-200 transition"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {headerNotice && (
        <div
          role="alert"
          className="px-4 md:px-8 py-1.5 bg-rose-50 dark:bg-rose-950/60 border-t border-rose-200 dark:border-rose-900 text-[11px] text-rose-700 dark:text-rose-300 flex items-center justify-between"
        >
          <span>{headerNotice}</span>
          <button
            type="button"
            onClick={() => setHeaderNotice(null)}
            className="font-bold hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}
    </header>
  );
};
