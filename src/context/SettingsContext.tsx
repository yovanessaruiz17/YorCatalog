/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { BusinessSettings, SupportedCurrency, SupportedLanguage, ThemeMode } from '../types';
import { DEFAULT_SETTINGS, settingsService } from '../services/settingsService';
import { useAuth } from './AuthContext';
import { translations } from '../utils/i18n';
import { formatCurrency, formatDate as fmtDate } from '../utils/formatters';

interface SettingsContextValue {
  settings: BusinessSettings;
  t: (typeof translations)['es'];
  theme: ThemeMode;
  currency: SupportedCurrency;
  language: SupportedLanguage;
  settingsError: string | null;
  updateSettings: (newSettings: Partial<BusinessSettings>, workspaceId?: string) => Promise<void>;
  loadWorkspaceSettings: (workspaceId: string) => Promise<void>;
  formatPrice: (amount: number) => string;
  formatDate: (isoDate: string) => string;
  isDark: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, currentWorkspace } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);

  const loadWorkspaceSettings = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    setSettingsError(null);
    try {
      const loaded = await settingsService.getSettings(workspaceId);
      setSettings(loaded);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la configuración del workspace desde Firestore.';
      setSettingsError(msg);
      throw err;
    }
  }, []);

  // Limpiar configuración privada al cerrar sesión y recargar al cambiar de workspace
  useEffect(() => {
    if (!user || !currentWorkspace?.id) {
      setSettings(DEFAULT_SETTINGS);
      setSettingsError(null);
      return;
    }
    void loadWorkspaceSettings(currentWorkspace.id).catch(() => {
      // El estado settingsError ya queda registrado para la UI
    });
  }, [user, currentWorkspace?.id, loadWorkspaceSettings]);

  // Sincronizar tema con el DOM
  useEffect(() => {
    const applyTheme = () => {
      let dark = false;
      if (settings.theme === 'dark') {
        dark = true;
      } else if (settings.theme === 'system') {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      setIsDark(dark);
      if (dark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  /**
   * Bloque 2 (R2.2): Persiste primero en Firestore antes de confirmar el estado en React.
   * Si no hay workspaceId (ej. visitante o sin workspace), actualiza solo preferencia visual en memoria de sesión.
   */
  const updateSettings = async (partial: Partial<BusinessSettings>, workspaceId?: string) => {
    const targetWorkspaceId = workspaceId || currentWorkspace?.id;
    const updated = { ...settings, ...partial };
    setSettingsError(null);

    if (targetWorkspaceId) {
      try {
        await settingsService.saveSettings(updated, targetWorkspaceId);
        setSettings(updated);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Error al guardar ajustes en Firestore.';
        setSettingsError(msg);
        throw err;
      }
    } else {
      // Preferencia visual temporal de UI sin workspace autenticado
      setSettings(updated);
    }
  };

  const t = translations[settings.language] || translations.es;

  const formatPrice = (amount: number) => {
    return formatCurrency(amount, settings.currency, settings.language);
  };

  const formatDate = (isoDate: string) => {
    return fmtDate(isoDate, settings.language);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        t,
        theme: settings.theme,
        currency: settings.currency,
        language: settings.language,
        settingsError,
        updateSettings,
        loadWorkspaceSettings,
        formatPrice,
        formatDate,
        isDark,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
