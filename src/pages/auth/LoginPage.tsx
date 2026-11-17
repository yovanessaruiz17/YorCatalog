/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PÁGINA DE INICIO DE SESIÓN CLOUD-ONLY (FIREBASE AUTH)
 */

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, Lock, Mail, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { CloudOnlyNotice } from '../../components/common/CloudOnlyNotice';

export const LoginPage: React.FC = () => {
  const { signIn, signInWithGoogle, isLiveFirebase, connectionState, connectionError, retryConnection } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await signInWithGoogle();
      if (res.error) {
        setError(res.error);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión con Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const statusMeta = (() => {
    switch (connectionState) {
      case 'connected':
        return { dot: 'bg-emerald-500 animate-pulse', text: 'Firebase Firestore & Auth Activo' };
      case 'checking':
        return { dot: 'bg-sky-500 animate-pulse', text: 'Verificando conexión Firebase...' };
      case 'unreachable':
        return { dot: 'bg-amber-500', text: 'Firebase temporalmente inaccesible' };
      case 'not_configured':
        return { dot: 'bg-rose-500', text: 'Firebase no configurado' };
      case 'session_expired':
        return { dot: 'bg-rose-500', text: 'Sesión expirada' };
      case 'unauthorized':
        return { dot: 'bg-rose-500', text: 'Cuenta sin permisos verificados' };
      default:
        return { dot: 'bg-amber-500', text: 'Error de persistencia en la nube' };
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-slate-950 dark:bg-emerald-600 flex items-center justify-center text-white shadow-xl shadow-emerald-500/10">
          <BookOpen className="w-7 h-7" />
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          YorCatalog Backoffice
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Accede al panel de gestión comercial de tus revistas virtuales y pedidos
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-6">
          {/* Indicador de Estado Cloud-Only (6 estados R2.2) */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dot}`} />
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                {statusMeta.text}
              </span>
            </div>
            {connectionState === 'unreachable' ? (
              <button
                type="button"
                onClick={() => void retryConnection()}
                className="inline-flex items-center gap-1 font-bold text-emerald-600 hover:underline shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reintentar</span>
              </button>
            ) : (
              <span className="font-mono text-slate-400">Cloud-Only</span>
            )}
          </div>

          {!isLiveFirebase && <CloudOnlyNotice variant="card" />}

          {(error || connectionError) && (
            <div
              role="alert"
              className="p-3 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error || connectionError}</span>
            </div>
          )}

          {/* Botón Principal Google Auth */}
          <button
            type="button"
            disabled={loading || !isLiveFirebase}
            onClick={handleGoogleLogin}
            className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2.5 transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{loading ? 'Conectando...' : 'Continuar con Google'}</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 font-semibold">
                o correo electrónico
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tu-comercio.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Contraseña
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isLiveFirebase}
              className="w-full py-2.5 px-4 bg-slate-950 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition"
            >
              <span>{loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center pt-2">
            <p className="text-xs text-slate-500">
              ¿No tienes una cuenta de comercio?{' '}
              <Link to="/register" className="font-bold text-emerald-600 hover:text-emerald-500">
                Registra tu negocio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
