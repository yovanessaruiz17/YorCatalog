/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GUARDIA DE RUTAS PROTEGIDAS (FASE 5)
 * Redirige usuarios no autenticados al inicio de sesión y permite acceso directo si hay sesión activa.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BookOpen } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-emerald-600 flex items-center justify-center text-white mb-4 animate-bounce">
          <BookOpen className="w-6 h-6" />
        </div>
        <p className="text-xs text-slate-500">Verificando sesión segura...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
