/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * COMPONENTE DE AVISO DE ARQUITECTURA CLOUD-ONLY (FIREBASE)
 * Muestra advertencia clara según el estado real de conexión con Firebase Firestore / Auth.
 */

import React from 'react';
import { CloudOff, AlertTriangle, ShieldAlert, Key, Database, WifiOff, RefreshCw } from 'lucide-react';
import { isFirebaseConfigured } from '../../services/firebaseClient';
import { useAuth } from '../../context/AuthContext';

interface CloudOnlyNoticeProps {
  variant?: 'banner' | 'card' | 'inline';
}

export const CloudOnlyNotice: React.FC<CloudOnlyNoticeProps> = ({ variant = 'banner' }) => {
  const { connectionState, connectionError, retryConnection } = useAuth();
  const configured = isFirebaseConfigured();

  // Si está configurado y conectado o verificando normalmente, no mostrar banner global
  if (configured && (connectionState === 'connected' || connectionState === 'checking')) {
    return null;
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          <strong>Arquitectura Cloud-Only:</strong>{' '}
          {!configured
            ? 'Conexión con Firebase no configurada.'
            : connectionError || 'Firebase temporalmente inaccesible.'}
        </span>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="p-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-3xl text-left space-y-4">
        <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center">
            <CloudOff className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Conexión a Firebase Cloud Requerida</h4>
            <p className="text-xs text-amber-600 dark:text-amber-400/90 font-mono">
              YorCatalog opera exclusivamente en la nube (Cloud-Only)
            </p>
          </div>
        </div>

        <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
          Para garantizar la integridad y aislamiento multiempresa de los datos comerciales, esta aplicación
          no utiliza almacenamiento local simulado (ni localStorage ni mockDataService). Para habilitar el registro,
          inventario, catálogos y pedidos, configura <code className="font-mono">firebase-applet-config.json</code>.
        </p>

        <div className="p-3 bg-amber-100/60 dark:bg-amber-900/40 rounded-2xl font-mono text-[11px] text-amber-950 dark:text-amber-200 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100">
            <Key className="w-3.5 h-3.5" />
            <span>Servicios requeridos:</span>
          </div>
          <p>Cloud Firestore + Firebase Auth + Firebase Storage</p>
        </div>
      </div>
    );
  }

  // Variant: banner (default)
  const isUnreachable = configured && connectionState !== 'not_configured';

  return (
    <aside
      aria-label="Aviso de conexión a Firebase"
      className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-sans font-medium flex items-center justify-between shadow-xs border-b border-amber-600/30"
    >
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isUnreachable ? (
            <WifiOff className="w-4 h-4 shrink-0 text-slate-950" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0 text-slate-950" />
          )}
          <span className="truncate">
            <strong className="font-bold">Modo Cloud-Only:</strong>{' '}
            {!configured
              ? 'Configuración de Firebase pendiente en firebase-applet-config.json.'
              : connectionError || 'No hay conectividad actual con Cloud Firestore.'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isUnreachable && (
            <button
              type="button"
              onClick={() => void retryConnection()}
              className="inline-flex items-center gap-1 bg-slate-950 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold hover:opacity-90"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reintentar</span>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono bg-amber-600/20 px-2 py-0.5 rounded-md">
            <Database className="w-3 h-3" />
            <span>Firestore + Storage</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
