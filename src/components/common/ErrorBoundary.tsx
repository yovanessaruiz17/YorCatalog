/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error?.message || 'Error inesperado en la aplicación.';
    if (readable.startsWith('{') && readable.includes('"operationType"')) {
      readable =
        'Se produjo un error de permisos o acceso a datos en Cloud Firestore. Verifica tu sesión y permisos de workspace.';
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturó un error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-3xl p-8 text-center shadow-xl space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Error de Integridad en Pantalla
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Recargar Aplicación</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
