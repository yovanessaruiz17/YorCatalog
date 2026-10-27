/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CONTEXTO DE AUTENTICACIÓN Y MULTI-TENANCY (FASE 5)
 * Gestiona la sesión de usuario de Supabase Auth, los perfiles,
 * la pertenencia a múltiples workspaces y el control de acceso por roles.
 * Incluye modo de demostración para entornos sin credenciales configuradas.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Profile, Workspace, WorkspaceRole, WorkspaceMember } from '../types';

interface AuthContextType {
  user: any | null;
  profile: Profile | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  role: WorkspaceRole;
  loading: boolean;
  isLiveSupabase: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string, workspaceName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  switchWorkspace: (workspaceId: string) => void;
  loginAsDemo: () => void;
}

const DEFAULT_DEMO_WORKSPACE: Workspace = {
  id: 'ws-demo-01',
  name: 'Café & Alquimia Gourmet',
  slug: 'cafe-alquimia-gourmet',
  tagline: 'Cafés de especialidad y accesorios de barismo',
  whatsappNumber: '+573001234567',
  contactEmail: 'contacto@yorcatalog.com',
  currency: 'COP',
  language: 'es',
  theme: 'light',
  createdAt: '2026-10-01T00:00:00Z',
};

const DEFAULT_DEMO_PROFILE: Profile = {
  id: 'usr-demo-01',
  email: 'admin@yorcatalog.com',
  fullName: 'Administrador Demo',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_DEMO_WORKSPACE]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(DEFAULT_DEMO_WORKSPACE);
  const [role, setRole] = useState<WorkspaceRole>('owner');
  const [loading, setLoading] = useState(true);

  const isLive = isSupabaseConfigured();

  // Cargar sesión inicial
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (isLive && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && isMounted) {
            setUser(session.user);
            await loadUserData(session.user.id);
          } else {
            // Verificar si hay sesión demo guardada
            checkLocalDemoSession();
          }
        } catch (e) {
          console.warn('Error iniciando Supabase Auth:', e);
          checkLocalDemoSession();
        }
      } else {
        checkLocalDemoSession();
      }

      if (isMounted) setLoading(false);
    }

    // Escuchar cambios de estado en Supabase Auth
    let authListener: any = null;
    if (isLive && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        if (session?.user) {
          setUser(session.user);
          await loadUserData(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          checkLocalDemoSession();
        }
        setLoading(false);
      });
      authListener = data.subscription;
    }

    initAuth();

    return () => {
      isMounted = false;
      if (authListener) authListener.unsubscribe();
    };
  }, [isLive]);

  const checkLocalDemoSession = () => {
    try {
      const saved = localStorage.getItem('yorcatalog_demo_session');
      if (saved === 'true') {
        setUser({ id: DEFAULT_DEMO_PROFILE.id, email: DEFAULT_DEMO_PROFILE.email });
        setProfile(DEFAULT_DEMO_PROFILE);
        setCurrentWorkspace(DEFAULT_DEMO_WORKSPACE);
        setWorkspaces([DEFAULT_DEMO_WORKSPACE]);
        setRole('owner');
      } else {
        setUser(null);
        setProfile(null);
        setCurrentWorkspace(DEFAULT_DEMO_WORKSPACE);
      }
    } catch {
      // ignore
    }
  };

  const loadUserData = async (userId: string) => {
    if (!supabase) return;
    try {
      // 1. Cargar Perfil
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (prof) {
        setProfile({
          id: prof.id,
          email: prof.email,
          fullName: prof.full_name,
          avatarUrl: prof.avatar_url,
          createdAt: prof.created_at,
        });
      }

      // 2. Cargar Workspaces a los que pertenece
      const { data: memberships } = await supabase
        .from('workspace_members')
        .select('role, workspaces(*)')
        .eq('user_id', userId);

      if (memberships && memberships.length > 0) {
        const wsList = memberships
          .map((m: any) => m.workspaces)
          .filter(Boolean) as Workspace[];

        setWorkspaces(wsList);
        setCurrentWorkspace(wsList[0]);
        setRole((memberships[0].role as WorkspaceRole) || 'member');
      }
    } catch (err) {
      console.error('Error cargando perfil y workspaces:', err);
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (isLive && supabase) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        return {};
      } catch (e: any) {
        return { error: e.message || 'Error de autenticación' };
      }
    } else {
      // Modo local / demo
      if (email.toLowerCase().includes('demo') || password.length >= 6) {
        loginAsDemo();
        return {};
      }
      return { error: 'Ingresa una contraseña de al menos 6 caracteres para modo local.' };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    workspaceName?: string
  ): Promise<{ error?: string }> => {
    if (isLive && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              workspace_name: workspaceName || 'Mi Negocio',
            },
          },
        });
        if (error) return { error: error.message };
        return {};
      } catch (e: any) {
        return { error: e.message || 'Error al crear la cuenta' };
      }
    } else {
      loginAsDemo();
      return {};
    }
  };

  const signOut = async () => {
    if (isLive && supabase) {
      await supabase.auth.signOut();
    }
    try {
      localStorage.removeItem('yorcatalog_demo_session');
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    if (isLive && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) return { error: error.message };
      return {};
    }
    return {};
  };

  const switchWorkspace = (workspaceId: string) => {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) {
      setCurrentWorkspace(found);
    }
  };

  const loginAsDemo = () => {
    try {
      localStorage.setItem('yorcatalog_demo_session', 'true');
    } catch {
      // ignore
    }
    setUser({ id: DEFAULT_DEMO_PROFILE.id, email: DEFAULT_DEMO_PROFILE.email });
    setProfile(DEFAULT_DEMO_PROFILE);
    setCurrentWorkspace(DEFAULT_DEMO_WORKSPACE);
    setWorkspaces([DEFAULT_DEMO_WORKSPACE]);
    setRole('owner');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentWorkspace,
        workspaces,
        role,
        loading,
        isLiveSupabase: isLive,
        signIn,
        signUp,
        signOut,
        resetPassword,
        switchWorkspace,
        loginAsDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
