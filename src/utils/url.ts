/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UTILIDAD DE RESOLUCIÓN DE URLS PÚBLICAS Y COMERCIALES (FASE 4)
 * Garantiza que los enlaces compartidos y códigos QR nunca apunten a localhost,
 * sino a la URL real desplegada del comercio o dominio configurado.
 */

// URL de producción / despliegue en Cloud Run como fallback si se ejecuta en localhost
export const DEFAULT_PRODUCTION_URL = 'https://ais-pre-kxtjg5h4q6tpxufuf4o7mc-106517983204.us-east5.run.app';

/**
 * Obtiene la URL base pública adecuada para enlaces comerciales y códigos QR.
 * Evita estrictamente generar enlaces con "localhost" o "127.0.0.1".
 */
export function getPublicAppBaseUrl(customDomain?: string): string {
  // 1. Si el comercio configuró un dominio o URL personalizada en ajustes
  if (customDomain && customDomain.trim().startsWith('http')) {
    return customDomain.trim().replace(/\/+$/, '');
  }

  // 2. Si existe variable de entorno de Vite
  const envUrl = (import.meta as any).env?.VITE_APP_URL || (import.meta as any).env?.APP_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http') && !envUrl.includes('localhost')) {
    return envUrl.replace(/\/+$/, '');
  }

  // 3. Inspección del navegador actual
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    // Si NO estamos en localhost, window.location.origin es la URL real desplegada
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.local')) {
      return window.location.origin;
    }
  }

  // 4. Fallback a la URL de despliegue Cloud Run oficial
  return DEFAULT_PRODUCTION_URL;
}

/**
 * Construye la URL pública y canónica de una revista virtual dada su token o slug.
 */
export function buildPublicCatalogUrl(shareTokenOrSlug: string, customDomain?: string): string {
  const baseUrl = getPublicAppBaseUrl(customDomain);
  const cleanToken = encodeURIComponent(shareTokenOrSlug.trim());
  return `${baseUrl}/m/${cleanToken}`;
}
