/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GUARDIA DE RUTAS PROTEGIDAS CLOUD-ONLY (FASE R2.3.1)
 * Bloquea explícitamente:
 * 1. Entorno Firebase no configurado / configuración inválida.
 * 2. Usuarios no autenticados (redirige a /login).
 * 3. Usuarios autenticados con correo sin verificar (`emailVerified === false`) con controles de reenvío/comprobación/cierre.
 * 4. Sesiones expiradas (`connectionState === 'session_expired'`).
 * 5. Usuarios autenticados y verificados sin workspace activo (invitaciones pendientes, error Cloud o creación explícita; cero datos simulados).
 */

import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  MailCheck,
  RefreshCw,
  LogOut,
  AlertCircle,
  Building2,
  UserPlus,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CloudConnectionCode, getFirebaseEnvironmentInfo } from '../../services/firebaseClient';
import { CloudOnlyNotice } from '../common/CloudOnlyNotice';
import { Workspace, WorkspaceInvitation } from '../../types';

export type RouteAccessGate =
  | 'loading'
  | 'not_configured'
  | 'unauthenticated'
  | 'email_unverified'
  | 'session_expired'
  | 'no_workspace'
  | 'allowed';

export interface RouteAccessInput {
  loading: boolean;
  connectionState: CloudConnectionCode;
  user: { uid: string; emailVerified: boolean } | null;
  currentWorkspace: Workspace | null;
}

export function resolveRouteAccessGate(input: RouteAccessInput): RouteAccessGate {
  if (input.loading) return 'loading';
  if (input.connectionState === 'not_configured') return 'not_configured';
  if (!input.user) return 'unauthenticated';
  if (input.connectionState === 'session_expired') return 'session_expired';
  if (!input.user.emailVerified) return 'email_unverified';
  if (!input.currentWorkspace) return 'no_workspace';
  return 'allowed';
}

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    currentWorkspace,
    pendingInvitations,
    loading,
    connectionState,
    connectionError,
    retryConnection,
    resendEmailVerification,
    refreshEmailVerification,
    acceptInvitation,
    ensurePersonalWorkspace,
    signOut,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const gate = resolveRouteAccessGate({
    loading,
    connectionState,
    user: user ? { uid: user.uid, emailVerified: user.emailVerified } : null,
    currentWorkspace,
  });

  if (gate === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-emerald-600 flex items-center justify-center text-white mb-4 animate-bounce">
          <BookOpen className="w-6 h-6" />
        </div>
        <p className="text-xs text-slate-500">Verificando sesión segura en Firebase...</p>
      </div>
    );
  }

  if (gate === 'not_configured') {
    const envInfo = getFirebaseEnvironmentInfo();
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4">
          <CloudOnlyNotice
            variant="card"
            message={
              envInfo.configError ||
              connectionError ||
              'Firebase no está configurado correctamente para el entorno activo.'
            }
          />
        </div>
      </div>
    );
  }

  if (gate === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (gate === 'session_expired') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-5 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Sesión expirada en Firebase
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {connectionError ||
                'Tu token de autenticación venció o fue revocado. Inicia sesión nuevamente para continuar.'}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            className="w-full py-2.5 px-4 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  if (gate === 'email_unverified') {
    const handleResend = async () => {
      setBusy(true);
      setFeedback(null);
      const res = await resendEmailVerification();
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({
          type: 'success',
          message: `Enlace de verificación enviado a ${user?.email || 'tu correo'}. Revisa bandeja de entrada o spam.`,
        });
      }
      setBusy(false);
    };

    const handleRefreshCheck = async () => {
      setBusy(true);
      setFeedback(null);
      const res = await refreshEmailVerification();
      if (!res.verified) {
        setFeedback({
          type: 'error',
          message:
            res.error ||
            'Tu correo todavía aparece sin verificar en Firebase Auth. Abre el enlace enviado a tu correo y vuelve a comprobar.',
        });
      }
      setBusy(false);
    };

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <MailCheck className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Verificación de correo requerida
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Las reglas de seguridad de Cloud Firestore y Firebase Storage bloquean el acceso administrativo hasta verificar tu dirección{' '}
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {user?.email || 'registrada'}
              </span>
              .
            </p>
          </div>

          {feedback && (
            <div
              role="alert"
              className={`p-3 rounded-2xl text-xs flex items-start gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleRefreshCheck}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              <span>Ya verifiqué mi correo (Comprobar)</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleResend}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition"
            >
              Reenviar correo de verificación
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión e intentar con otra cuenta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gate === 'no_workspace') {
    const handleAcceptInvite = async (inv: WorkspaceInvitation) => {
      setBusy(true);
      setFeedback(null);
      const res = await acceptInvitation(inv);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      }
      setBusy(false);
    };

    const handleCreateWorkspace = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setFeedback(null);
      const res = await ensurePersonalWorkspace(newWorkspaceName.trim() || undefined);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      }
      setBusy(false);
    };

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {pendingInvitations.length > 0
                  ? 'Invitaciones pendientes a un Workspace'
                  : 'Sin workspace comercial activo'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {pendingInvitations.length > 0
                  ? 'Acepta una invitación para unirte como colaborador o crea un espacio comercial independiente.'
                  : 'No se encontró una membresía activa en Cloud Firestore para tu usuario. Puedes crear tu propio workspace o solicitar una invitación al administrador de tu empresa.'}
              </p>
            </div>
          </div>

          {(connectionError || feedback?.type === 'error') && (
            <div
              role="alert"
              className="p-3 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-2 text-xs text-rose-700 dark:text-rose-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{feedback?.message || connectionError}</span>
            </div>
          )}

          {pendingInvitations.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Invitaciones disponibles para {user?.email}
              </p>
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {inv.workspaceName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Rol asignado: <span className="font-mono font-semibold">{inv.role}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleAcceptInvite(inv)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shrink-0 transition"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Aceptar</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateWorkspace} className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Crear nuevo espacio comercial propio
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Ej. Café & Alquimia Gourmet"
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shrink-0"
              >
                {busy ? 'Procesando...' : 'Crear Workspace'}
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={busy}
              onClick={() => void retryConnection()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reintentar verificación</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
