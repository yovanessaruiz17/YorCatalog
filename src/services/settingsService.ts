/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BusinessSettings, ISettingsService } from '../types';

const STORAGE_KEY = 'yorcatalog_business_settings_v1';

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Café & Alquimia Gourmet',
  tagline: 'Cafés de especialidad, accesorios para barismo y experiencias sensoriales',
  logoUrl: '',
  whatsappNumber: '+573001234567',
  contactEmail: 'contacto@yorcatalog.com',
  currency: 'COP',
  language: 'es',
  theme: 'light',
  catalogPreferences: {
    showPrices: true,
    showStock: false,
    defaultTemplate: 'editorial-magazine-01',
    allowDirectOrder: true,
    includeQrCode: true,
  },
};

export class SettingsService implements ISettingsService {
  async getSettings(): Promise<BusinessSettings> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch {
      // Fallback to defaults
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: BusinessSettings): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Silently handle storage limits
    }
  }
}

export const settingsService = new SettingsService();
