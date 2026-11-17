/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * COMPONENTE DE ESTADO DIFERENCIADO DE CONSULTA / CONEXIÓN (FASE R2.2 BLOQUE 1)
 * Evita mostrar "0 registros" o listas vacías engañosas cuando la consulta a Firebase falló
 * por falta de configuración, pérdida de conexión, sesión expirada, permisos o error de persistencia.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  WifiOff,
  ShieldAlert,
  Lock,
  AlertTriangle,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import { CloudConnectionCode } from '../../services/firebaseClient';

export interface QueryErrorState {
  code: CloudConnectionCode;
  message: string;
}

interface QueryStateAlertProps {
  error: QueryErrorState | null;
  onRetry?: () => void;
  title?: string;
}

export const QueryStateAlert: React.FC<QueryStateAlertProps> = ({
  error,
  onRetry,
  title,
}) => {
  if (!error) return null;

  const meta = (() => {
    switch (error.code) {
      case 'not_configured':
        return {
          icon: CloudOff,
          badge: 'Firebase no configurado',
          heading: title || 'Conexión a Firebase no configurada',
          tone: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200',
          iconWrap: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
        };
      case 'unreachable':
        return {
          icon: WifiOff,
          badge: 'Servicio temporalmente inaccesible',
          heading: title || 'No pudimos conectar con Firebase Firestore',
          tone: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200',
          iconWrap: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
        };
      case 'session_expired':
        return {
          icon: Lock,
          badge: 'Sesión expirada',
          heading: title || 'Tu sesión de usuario expiró o no está activa',
          tone: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200',
          iconWrap: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
        };
      case 'unauthorized':
        return {
          icon: ShieldAlert,
          badge: 'Sin permisos',
          heading: title || 'Acceso denegado por reglas de seguridad del workspace',
          tone: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200',
          iconWrap: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
        };
      default:
        return {
          icon: AlertTriangle,
          badge: 'Error de persistencia',
          heading: title || 'No se pudo completar la operación en la nube',
          tone: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200',
          iconWrap: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
        };
    }
  })();

  const Icon = meta.icon;

  return (
    <div
      role="alert"
      className={`p-5 border rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${meta.tone}`}
    >
      <div className="flex items-start gap-3.5">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconWrap}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-white/70 dark:bg-black/30">
              {meta.badge}
            </span>
          </div>
          <h3 className="font-bold text-sm">{meta.heading}</h3>
          <p className="opacity-90 leading-relaxed">{error.message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {error.code === 'session_expired' && (
          <Link
            to="/login"
            className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition"
          >
            Iniciar Sesión
          </Link>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar</span>
          </button>
        )}
      </div>
    </div>
  );
};
