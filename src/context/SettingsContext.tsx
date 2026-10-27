/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { BusinessSettings, SupportedCurrency, SupportedLanguage, ThemeMode } from '../types';
import { DEFAULT_SETTINGS, settingsService } from '../services/settingsService';
import { translations } from '../utils/i18n';
import { formatCurrency, formatDate as fmtDate } from '../utils/formatters';

interface SettingsContextValue {
  settings: BusinessSettings;
  t: (typeof translations)['es'];
  theme: ThemeMode;
  currency: SupportedCurrency;
  language: SupportedLanguage;
  updateSettings: (newSettings: Partial<BusinessSettings>) => Promise<void>;
  formatPrice: (amount: number) => string;
  formatDate: (isoDate: string) => string;
  isDark: boolean;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // Load initial settings
    settingsService.getSettings().then((loaded) => {
      setSettings(loaded);
    });
  }, []);

  // Sync theme with DOM
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

  const updateSettings = async (partial: Partial<BusinessSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await settingsService.saveSettings(updated);
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
        updateSettings,
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
