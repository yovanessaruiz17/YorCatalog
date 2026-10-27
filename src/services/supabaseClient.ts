/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CLIENTE OFICIAL DE SUPABASE (FASE 5)
 * Inicializa el SDK de Supabase con persistencia de sesión segura en navegador.
 * Verifica la presencia de credenciales públicas (URL y anon key).
 * NUNCA incluye ni requiere la clave service_role en el cliente.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

/**
 * Indica si el entorno cuenta con credenciales reales válidas de Supabase.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    typeof supabaseUrl === 'string' &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder') &&
    supabaseAnonKey.length > 20
  );
}

/**
 * Instancia del cliente Supabase para operaciones en la nube.
 * Es null si no se han configurado las variables de entorno.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
