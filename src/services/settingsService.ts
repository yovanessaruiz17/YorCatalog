/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SERVICIO DE CONFIGURACIÓN COMERCIAL CLOUD-ONLY (FIREBASE FIRESTORE)
 * Persiste la configuración del negocio exclusivamente en /workspaces/{workspaceId} de Firestore.
 * Se prohíbe el uso de localStorage, sessionStorage o fallback silencioso ante errores de red o permisos.
 */

import { BusinessSettings } from '../types';
import { CloudOperationError, isFirebaseConfigured } from './firebaseClient';
import { firebaseDataService } from './firebaseDataService';

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Mi Negocio Comercial',
  tagline: 'Catálogos comerciales digitales y pedidos por WhatsApp',
  logoUrl: '',
  whatsappNumber: '+573001234567',
  contactEmail: 'contacto@yorcatalog.com',
  currency: 'COP',
  language: 'es',
  theme: 'light',
  catalogPreferences: {
    showPrices: true,
    showStock: false,
    defaultTemplate: 'editorial',
    allowDirectOrder: true,
    includeQrCode: true,
  },
};

export class CloudSettingsService {
  async getSettings(workspaceId?: string): Promise<BusinessSettings> {
    if (!isFirebaseConfigured()) {
      throw new CloudOperationError(
        'not_configured',
        'Firebase no está configurado. No es posible cargar la configuración del workspace.'
      );
    }
    if (!workspaceId) {
      return { ...DEFAULT_SETTINGS };
    }
    return firebaseDataService.getWorkspaceSettings(workspaceId);
  }

  async saveSettings(settings: BusinessSettings, workspaceId?: string): Promise<void> {
    if (!isFirebaseConfigured()) {
      throw new CloudOperationError(
        'not_configured',
        'Firebase no está configurado. No es posible guardar los ajustes en la nube.'
      );
    }
    if (!workspaceId) {
      throw new CloudOperationError(
        'unauthorized',
        'Se requiere un workspace activo para guardar la configuración comercial.'
      );
    }
    await firebaseDataService.updateWorkspaceSettings(workspaceId, settings);
  }
}

export const settingsService = new CloudSettingsService();
