/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  Building2,
  Phone,
  Coins,
  Globe,
  Palette,
  Sliders,
  QrCode,
  Sparkles,
  AlertCircle,
  Users,
  UserPlus,
  Trash2,
  XCircle,
  Shield,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { formatCloudErrorForUser, getFirebaseEnvironmentInfo } from '../services/firebaseClient';
import { firebaseDataService } from '../services/firebaseDataService';
import { SupportedCurrency, SupportedLanguage, ThemeMode, WorkspaceInvitation, WorkspaceMember } from '../types';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, t } = useSettings();
  const {
    user,
    currentWorkspace,
    role,
    isLiveFirebase,
    connectionState,
    pendingInvitations,
    acceptInvitation,
  } = useAuth();
  const [formData, setFormData] = useState(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Team & Collaborators state
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  const canManageSettings = role === 'owner' || role === 'admin';
  const envInfo = getFirebaseEnvironmentInfo();

  const loadTeamData = async (wsId: string) => {
    setLoadingTeam(true);
    try {
      const [memberList, invList] = await Promise.all([
        firebaseDataService.listWorkspaceMembers(wsId),
        canManageSettings ? firebaseDataService.listWorkspaceInvitations(wsId) : Promise.resolve([]),
      ]);
      setMembers(memberList);
      setInvitations(invList);
    } catch {
      // Silenciar si el rol actual no tiene permisos de listado de invitaciones
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    setFormData(settings);
    setActionError(null);
    setSavedSuccess(false);
    if (currentWorkspace?.id && isLiveFirebase) {
      void loadTeamData(currentWorkspace.id);
    } else {
      setMembers([]);
      setInvitations([]);
    }
  }, [settings, currentWorkspace?.id, role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setActionError(null);
    try {
      await updateSettings(formData, currentWorkspace?.id);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setActionError(formatCloudErrorForUser(err, 'No se pudo guardar la configuración en Cloud Firestore.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            {t.settings.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t.settings.subtitle}
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t.settings.saveSuccess}</span>
          </div>
        )}
      </div>

      {!canManageSettings && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200">
          <Shield className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Tu rol en este workspace es <strong className="font-mono">{role}</strong>. Solo los roles{' '}
            <strong className="font-mono">owner</strong> y <strong className="font-mono">admin</strong> pueden modificar la configuración comercial o gestionar colaboradores.
          </span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Business Profile */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.businessSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.businessNameLabel}
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                required
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.taglineLabel}
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.contactEmailLabel}
              </label>
              <input
                type="email"
                value={formData.contactEmail || ''}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                URL del Logotipo (Opcional)
              </label>
              <input
                type="url"
                value={formData.logoUrl || ''}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: WhatsApp Channel */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.whatsappSection}
            </h2>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.settings.whatsappLabel}
            </label>
            <input
              type="text"
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              required
              placeholder="+573001234567"
              className="w-full max-w-md px-3.5 py-2 font-mono text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t.settings.whatsappHelp}
            </p>
          </div>
        </div>

        {/* Section 3: Currency & Language */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.localizationSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.currencyLabel}
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value as SupportedCurrency })
                }
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              >
                <option value="COP">COP ($ Pesos Colombianos)</option>
                <option value="USD">USD ($ Dólares Americanos)</option>
                <option value="EUR">EUR (€ Euros)</option>
                <option value="MXN">MXN ($ Pesos Mexicanos)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.settings.languageLabel}
              </label>
              <select
                value={formData.language}
                onChange={(e) =>
                  setFormData({ ...formData, language: e.target.value as SupportedLanguage })
                }
                className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              >
                <option value="es">Español (Predeterminado)</option>
                <option value="en">English (US)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Visual Theme */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Palette className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.themeSection}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'light', label: t.settings.themeLight },
              { id: 'dark', label: t.settings.themeDark },
              { id: 'system', label: t.settings.themeSystem },
            ].map((option) => (
              <label
                key={option.id}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                  formData.theme === option.id
                    ? 'border-slate-950 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/80 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  checked={formData.theme === option.id}
                  onChange={() => setFormData({ ...formData, theme: option.id as ThemeMode })}
                  className="w-4 h-4 text-slate-950 dark:text-emerald-500 focus:ring-0"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Section 5: Catalog Preferences */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t.settings.catalogPrefsSection}
            </h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.showPricesLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.showPrices}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      showPrices: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.showStockLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.showStock}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      showStock: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.allowOrdersLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.allowDirectOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      allowDirectOrder: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                {t.settings.includeQrLabel}
              </span>
              <input
                type="checkbox"
                checked={formData.catalogPreferences.includeQrCode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    catalogPreferences: {
                      ...formData.catalogPreferences,
                      includeQrCode: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Section 6: Firebase Cloud-Only & Multi-Tenant Infrastructure */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                ⚡
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Infraestructura Cloud-Only (Firebase & Multi-Tenant)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
              {isLiveFirebase ? `Conectado (${connectionState})` : 'No Configurado'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">
                Estado del Motor de Persistencia:
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isLiveFirebase ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Arquitectura Cloud-Only: Cloud Firestore + Firebase Auth + Storage
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Toda la información comercial del workspace se sincroniza en tiempo real exclusivamente contra Firebase. No existe persistencia comercial en localStorage, sessionStorage ni IndexedDB.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
              <span className="font-bold font-sans text-slate-900 dark:text-white block mb-1">
                Entorno Activo y Reglas Versionadas:
              </span>
              <div className="text-slate-600 dark:text-slate-300">
                ✓ Entorno: {envInfo.environment} ({envInfo.source}) — Proyecto: {envInfo.projectId || 'sin configurar'}
              </div>
              {envInfo.usingSharedAppletFallback && (
                <div className="text-amber-600 dark:text-amber-400">
                  ⚠ Desarrollo usa firebase-applet-config.json; define VITE_FIREBASE_DEV_* para aislar proyectos.
                </div>
              )}
              <div className="text-slate-600 dark:text-slate-300">✓ firestore.rules & storage.rules (Aislamiento multi-tenant)</div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !canManageSettings}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t.common.saving : t.common.save}</span>
          </button>
        </div>
      </form>

      {/* Section 7: Team & Collaborators Management */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Equipo y Colaboradores Multi-Tenant
            </h2>
          </div>
          <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Tu rol: {role}
          </span>
        </div>

        {teamMessage && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-2xl text-xs text-emerald-800 dark:text-emerald-200">
            {teamMessage}
          </div>
        )}

        {pendingInvitations.length > 0 && (
          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-2.5">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              Tienes invitaciones pendientes para unirte a otros workspaces:
            </p>
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-900"
              >
                <div className="text-xs">
                  <span className="font-bold text-slate-900 dark:text-white block">
                    {inv.workspaceName}
                  </span>
                  <span className="text-slate-500 font-mono">Rol asignado: {inv.role}</span>
                </div>
                <button
                  type="button"
                  disabled={teamBusy}
                  onClick={async () => {
                    setTeamBusy(true);
                    setActionError(null);
                    const res = await acceptInvitation(inv);
                    if (res.error) setActionError(res.error);
                    else setTeamMessage(`Te uniste a "${inv.workspaceName}" como ${inv.role}.`);
                    setTeamBusy(false);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition"
                >
                  Aceptar
                </button>
              </div>
            ))}
          </div>
        )}

        {canManageSettings && currentWorkspace && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
            <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Invitar colaborador al workspace</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                className="flex-1 px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
              <select
                value={role === 'owner' ? inviteRole : 'member'}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                disabled={role !== 'owner'}
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="member">member (Operación)</option>
                {role === 'owner' && <option value="admin">admin (Gestión)</option>}
              </select>
              <button
                type="button"
                disabled={teamBusy || !inviteEmail.trim()}
                onClick={async () => {
                  if (!currentWorkspace?.id) return;
                  setTeamBusy(true);
                  setActionError(null);
                  setTeamMessage(null);
                  try {
                    await firebaseDataService.createWorkspaceInvitation({
                      workspaceId: currentWorkspace.id,
                      workspaceName: currentWorkspace.name,
                      email: inviteEmail,
                      role: role === 'owner' ? inviteRole : 'member',
                    });
                    setInviteEmail('');
                    setTeamMessage('Invitación registrada en Firestore. El colaborador podrá aceptarla al iniciar sesión con su correo verificado.');
                    await loadTeamData(currentWorkspace.id);
                  } catch (err) {
                    setActionError(formatCloudErrorForUser(err, 'No se pudo enviar la invitación.').message);
                  } finally {
                    setTeamBusy(false);
                  }
                }}
                className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shrink-0"
              >
                Enviar Invitación
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Miembros activos ({members.length})
          </p>
          {loadingTeam ? (
            <p className="text-xs text-slate-400">Cargando miembros desde Firestore...</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl">
              {members.map((m) => (
                <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {m.fullName || m.email || m.userId}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {m.email || m.userId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {m.role}
                    </span>
                    {m.role !== 'owner' &&
                      m.userId !== user?.uid &&
                      (role === 'owner' || (role === 'admin' && m.role === 'member')) && (
                        <button
                          type="button"
                          disabled={teamBusy}
                          onClick={async () => {
                            if (!currentWorkspace?.id) return;
                            setTeamBusy(true);
                            try {
                              await firebaseDataService.removeWorkspaceMember(currentWorkspace.id, m.userId);
                              await loadTeamData(currentWorkspace.id);
                            } catch (err) {
                              setActionError(formatCloudErrorForUser(err, 'No se pudo remover al miembro.').message);
                            } finally {
                              setTeamBusy(false);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="Remover colaborador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canManageSettings && invitations.filter((i) => i.status === 'pending').length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Invitaciones pendientes enviadas
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl">
              {invitations
                .filter((i) => i.status === 'pending')
                .map((inv) => (
                  <div key={inv.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{inv.email}</p>
                      <p className="text-[11px] font-mono text-slate-500">Rol: {inv.role}</p>
                    </div>
                    <button
                      type="button"
                      disabled={teamBusy}
                      onClick={async () => {
                        if (!currentWorkspace?.id) return;
                        setTeamBusy(true);
                        try {
                          await firebaseDataService.revokeWorkspaceInvitation(currentWorkspace.id, inv.id);
                          await loadTeamData(currentWorkspace.id);
                        } catch (err) {
                          setActionError(formatCloudErrorForUser(err, 'No se pudo revocar la invitación.').message);
                        } finally {
                          setTeamBusy(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Revocar</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
