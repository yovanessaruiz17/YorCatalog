/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CONTEXTO DE AUTENTICACIÓN Y MULTI-TENANCY CLOUD-ONLY (FIREBASE AUTH + FIRESTORE)
 * Conecta exclusivamente con Firebase Auth y Cloud Firestore.
 * Descubrimiento multi-tenant unificado:
 * - Workspaces propios (`where('ownerId', '==', uid)`) + backfill de índice `/users/{uid}/memberships`.
 * - Workspaces colaborativos (`admin` / `member`) descubiertos vía `/users/{uid}/memberships/{workspaceId}`
 *   y validados contra `/workspaces/{workspaceId}/members/{uid}`.
 * - Descubrimiento y aceptación atómica de invitaciones pendientes por correo verificado.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  isFirebaseConfigured,
  testConnection,
  CloudConnectionCode,
  classifyFirebaseError,
  formatCloudErrorForUser,
} from '../services/firebaseClient';
import { firebaseDataService, sanitizeFirestoreId } from '../services/firebaseDataService';
import { clearPrivateAssetUrlCache } from '../services/imageService';
import { Profile, Workspace, WorkspaceInvitation, WorkspaceRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  pendingInvitations: WorkspaceInvitation[];
  role: WorkspaceRole;
  loading: boolean;
  isLiveFirebase: boolean;
  connectionState: CloudConnectionCode;
  connectionError: string | null;
  retryConnection: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  resendEmailVerification: () => Promise<{ error?: string; sent?: boolean }>;
  refreshEmailVerification: () => Promise<{ verified: boolean; error?: string }>;
  acceptInvitation: (invitation: WorkspaceInvitation) => Promise<{ error?: string }>;
  ensurePersonalWorkspace: (workspaceName?: string) => Promise<{ error?: string }>;
  signInWithGoogle: (workspaceName?: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    workspaceName?: string
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  switchWorkspace: (workspaceId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapTimestamp(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  return new Date().toISOString();
}

function mapWorkspaceFromDoc(id: string, data: Record<string, any>): Workspace {
  return {
    id: data.id || id,
    name: data.name || 'Mi Negocio Comercial',
    slug: data.slug || id,
    tagline: data.tagline || undefined,
    logoUrl: data.logoUrl || undefined,
    whatsappNumber: data.whatsappNumber || '',
    contactEmail: data.contactEmail || undefined,
    currency: data.currency || 'COP',
    language: data.language || 'es',
    theme: data.theme || 'light',
    settingsJson: data.settingsJson,
    createdAt: mapTimestamp(data.createdAt),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([]);
  const [workspaceRoles, setWorkspaceRoles] = useState<Record<string, WorkspaceRole>>({});
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [loading, setLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<CloudConnectionCode>(
    isFirebaseConfigured() ? 'checking' : 'not_configured'
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const isLiveFirebase = isFirebaseConfigured();

  const clearPrivateAuthState = useCallback(() => {
    firebaseDataService.clearRuntimeCaches();
    clearPrivateAssetUrlCache();
    setUser(null);
    setProfile(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
    setPendingInvitations([]);
    setWorkspaceRoles({});
    setRole('member');
  }, []);

  const verifyServerConnectivity = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setConnectionState('not_configured');
      setConnectionError('Firebase no está configurado en el proyecto.');
      return;
    }
    setConnectionState('checking');
    const result = await testConnection();
    setConnectionState(result.state);
    setConnectionError(result.message || null);
  }, []);

  const provisionPersonalWorkspace = useCallback(
    async (firebaseUser: User, preferredWorkspaceName?: string): Promise<Workspace | null> => {
      if (!db || !firebaseUser.emailVerified) return null;

      const uid = firebaseUser.uid;
      const email = (firebaseUser.email || `${uid}@yorcatalog.local`).slice(0, 254);
      const displayName = (
        firebaseUser.displayName ||
        email.split('@')[0] ||
        'Administrador'
      )
        .trim()
        .slice(0, 120);

      const defaultWsId = sanitizeFirestoreId(`ws_${uid}`, 'ws');
      const wsRef = doc(db, 'workspaces', defaultWsId);
      const existingDefault = await getDoc(wsRef);

      if (!existingDefault.exists()) {
        const wsName = (preferredWorkspaceName || 'Mi Negocio Comercial').trim().slice(0, 120);
        const wsSlug = sanitizeFirestoreId(
          `${wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uid.slice(0, 6)}`,
          'ws'
        );
        const batch = writeBatch(db);
        batch.set(wsRef, {
          id: defaultWsId,
          ownerId: uid,
          name: wsName,
          slug: wsSlug,
          tagline: 'Catálogos comerciales digitales y pedidos por WhatsApp',
          logoUrl: null,
          whatsappNumber: '+573001234567',
          contactEmail: email,
          currency: 'COP',
          language: 'es',
          theme: 'light',
          settingsJson: {
            showPrices: true,
            showStock: false,
            defaultTemplate: 'editorial',
            allowDirectOrder: true,
            includeQrCode: true,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(doc(db, 'workspaces', defaultWsId, 'members', uid), {
          id: uid,
          workspaceId: defaultWsId,
          userId: uid,
          role: 'owner',
          email,
          fullName: displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(doc(db, 'users', uid, 'memberships', defaultWsId), {
          id: defaultWsId,
          workspaceId: defaultWsId,
          userId: uid,
          workspaceName: wsName,
          role: 'owner',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();

        return {
          id: defaultWsId,
          name: wsName,
          slug: wsSlug,
          tagline: 'Catálogos comerciales digitales y pedidos por WhatsApp',
          whatsappNumber: '+573001234567',
          contactEmail: email,
          currency: 'COP',
          language: 'es',
          theme: 'light',
          createdAt: new Date().toISOString(),
        };
      }

      return mapWorkspaceFromDoc(defaultWsId, existingDefault.data());
    },
    []
  );

  const ensureUserProfileAndWorkspace = useCallback(
    async (
      firebaseUser: User,
      options?: { preferredWorkspaceName?: string; autoProvision?: boolean }
    ) => {
      if (!db) return;

      if (!firebaseUser.emailVerified) {
        setConnectionState('unauthorized');
        setConnectionError(
          'Tu correo electrónico aún no está verificado en Firebase Auth. Verifica tu correo o inicia sesión con Google.'
        );
        setProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          fullName: firebaseUser.displayName || 'Usuario',
          avatarUrl: firebaseUser.photoURL || undefined,
        });
        setWorkspaces([]);
        setPendingInvitations([]);
        setWorkspaceRoles({});
        setCurrentWorkspace(null);
        return;
      }

      const uid = firebaseUser.uid;
      const email = (firebaseUser.email || `${uid}@yorcatalog.local`).slice(0, 254);
      const displayName = (
        firebaseUser.displayName ||
        email.split('@')[0] ||
        'Administrador'
      )
        .trim()
        .slice(0, 120);

      // 1. Cargar o crear perfil en /users/{uid}
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          id: uid,
          email,
          fullName: displayName,
          avatarUrl: firebaseUser.photoURL ? firebaseUser.photoURL.slice(0, 1000) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setProfile({
          id: uid,
          email,
          fullName: displayName,
          avatarUrl: firebaseUser.photoURL || undefined,
          createdAt: new Date().toISOString(),
        });
      } else {
        const pData = userSnap.data();
        setProfile({
          id: pData.id || uid,
          email: pData.email || email,
          fullName: pData.fullName || displayName,
          avatarUrl: pData.avatarUrl || undefined,
          createdAt: mapTimestamp(pData.createdAt),
        });
      }

      // 2. Descubrir workspaces propios + membresías colaborativas (admin / member)
      const [ownedSnap, membershipDocs, pendingInvList] = await Promise.all([
        getDocs(query(collection(db, 'workspaces'), where('ownerId', '==', uid))),
        firebaseDataService.listUserMemberships(uid).catch(() => []),
        firebaseUser.email
          ? firebaseDataService.listPendingInvitationsForEmail(firebaseUser.email).catch(() => [])
          : Promise.resolve([]),
      ]);

      const discoveredMap = new Map<string, Workspace>();
      const rolesMap: Record<string, WorkspaceRole> = {};
      const indexedWorkspaceIds = new Set(membershipDocs.map((m) => m.workspaceId));

      for (const d of ownedSnap.docs) {
        const ws = mapWorkspaceFromDoc(d.id, d.data());
        discoveredMap.set(ws.id, ws);
        rolesMap[ws.id] = 'owner';

        // Backfill no destructivo del índice de membresía para propietarios existentes
        if (!indexedWorkspaceIds.has(ws.id)) {
          try {
            await setDoc(doc(db, 'users', uid, 'memberships', ws.id), {
              id: ws.id,
              workspaceId: ws.id,
              userId: uid,
              workspaceName: ws.name.slice(0, 120),
              role: 'owner',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch {
            // No bloquear acceso si el backfill no pudo escribirse en este ciclo
          }
        }
      }

      // Validar cada membresía colaborativa contra /workspaces/{wsId} y /workspaces/{wsId}/members/{uid}
      for (const membership of membershipDocs) {
        const wsId = membership.workspaceId;
        if (discoveredMap.has(wsId)) continue;

        try {
          const [wsSnap, memberSnap] = await Promise.all([
            getDoc(doc(db, 'workspaces', wsId)),
            getDoc(doc(db, 'workspaces', wsId, 'members', uid)),
          ]);

          if (wsSnap.exists() && memberSnap.exists()) {
            const ws = mapWorkspaceFromDoc(wsSnap.id, wsSnap.data());
            const liveRole = (memberSnap.data().role as WorkspaceRole) || membership.role || 'member';
            discoveredMap.set(ws.id, ws);
            rolesMap[ws.id] = liveRole;
          } else {
            // Membresía revocada o workspace eliminado: limpiar entrada obsoleta del índice
            await deleteDoc(doc(db, 'users', uid, 'memberships', wsId)).catch(() => undefined);
          }
        } catch {
          // Si Firestore Rules rechazan lectura por revocación, omitir silenciosamente este workspace
        }
      }

      let wsList = Array.from(discoveredMap.values());

      // 3. Si no hay workspaces ni invitaciones pendientes y está habilitado el auto-aprovisionamiento,
      // crear workspace personal inicial ws_{uid}
      const shouldAutoProvision = options?.autoProvision ?? true;
      if (wsList.length === 0 && pendingInvList.length === 0 && shouldAutoProvision) {
        const createdWs = await provisionPersonalWorkspace(
          firebaseUser,
          options?.preferredWorkspaceName
        );
        if (createdWs) {
          wsList = [createdWs];
          rolesMap[createdWs.id] = 'owner';
        }
      }

      setPendingInvitations(pendingInvList);
      setWorkspaces(wsList);
      setWorkspaceRoles(rolesMap);

      setCurrentWorkspace((prev) => {
        const stillValid = prev ? wsList.find((w) => w.id === prev.id) : undefined;
        const selected = stillValid || wsList[0] || null;
        if (selected) {
          setRole(rolesMap[selected.id] || 'member');
        } else {
          setRole('member');
        }
        return selected;
      });

      setConnectionState('connected');
      setConnectionError(null);
    },
    [provisionPersonalWorkspace]
  );

  useEffect(() => {
    let isMounted = true;

    void verifyServerConnectivity();

    if (!isLiveFirebase || !auth) {
      clearPrivateAuthState();
      setConnectionState('not_configured');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!isMounted) return;
        if (firebaseUser) {
          setUser(firebaseUser);
          try {
            await ensureUserProfileAndWorkspace(firebaseUser);
          } catch (err) {
            const formatted = formatCloudErrorForUser(
              err,
              'No se pudo cargar tu perfil o workspace desde Cloud Firestore.'
            );
            setConnectionState(formatted.code);
            setConnectionError(formatted.message);
          }
        } else {
          clearPrivateAuthState();
          const res = await testConnection();
          if (isMounted) {
            setConnectionState(res.state);
            setConnectionError(res.message || null);
          }
        }
        if (isMounted) {
          setLoading(false);
        }
      },
      (error) => {
        if (!isMounted) return;
        const classified = classifyFirebaseError(error, 'session_expired');
        setConnectionState(classified.code);
        setConnectionError(classified.userMessage);
        clearPrivateAuthState();
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isLiveFirebase, verifyServerConnectivity, ensureUserProfileAndWorkspace, clearPrivateAuthState]);

  const mapAuthErrorMessage = (err: unknown): string => {
    const code = ((err as { code?: string })?.code || '').toLowerCase();
    if (code.includes('auth/operation-not-allowed')) {
      return 'El inicio de sesión con correo/contraseña no está habilitado en este proyecto Firebase. Utiliza el botón "Continuar con Google".';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return 'La ventana de inicio de sesión con Google se cerró antes de completar el acceso.';
    }
    if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (code.includes('auth/user-not-found')) {
      return 'No existe una cuenta registrada con ese correo.';
    }
    if (code.includes('auth/email-already-in-use')) {
      return 'Este correo ya se encuentra registrado en Firebase Auth.';
    }
    if (code.includes('auth/network-request-failed')) {
      return 'Error de red al conectar con Firebase Authentication. Verifica tu conexión.';
    }
    if (code.includes('auth/too-many-requests')) {
      return 'Demasiados intentos fallidos. Espera unos minutos antes de reintentar.';
    }
    return err instanceof Error ? err.message : 'Error al autenticar con Firebase.';
  };

  const signInWithGoogle = async (workspaceName?: string): Promise<{ error?: string }> => {
    if (!isLiveFirebase || !auth) {
      return { error: 'Firebase Auth no está configurado en el entorno.' };
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      if (credential.user) {
        await ensureUserProfileAndWorkspace(credential.user, {
          preferredWorkspaceName: workspaceName,
          autoProvision: true,
        });
      }
      return {};
    } catch (err) {
      return { error: mapAuthErrorMessage(err) };
    }
  };

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!isLiveFirebase || !auth) {
      return { error: 'Firebase Auth no está configurado en el entorno.' };
    }
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (credential.user && !credential.user.emailVerified) {
        await sendEmailVerification(credential.user).catch(() => undefined);
        return {
          error:
            'Tu correo aún no está verificado. Te enviamos un enlace de verificación a tu bandeja de entrada (o utiliza Acceso con Google).',
        };
      }
      return {};
    } catch (err) {
      return { error: mapAuthErrorMessage(err) };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    workspaceName?: string
  ): Promise<{ error?: string }> => {
    if (!isLiveFirebase || !auth) {
      return { error: 'Firebase Auth no está configurado en el entorno.' };
    }
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (credential.user) {
        await updateProfile(credential.user, { displayName: fullName.trim() });
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          return {
            error:
              'Cuenta creada. Por seguridad de Firestore, verifica tu correo electrónico antes de acceder al workspace (o inicia sesión con Google).',
          };
        }
        await ensureUserProfileAndWorkspace(credential.user, {
          preferredWorkspaceName: workspaceName,
          autoProvision: true,
        });
      }
      return {};
    } catch (err) {
      return { error: mapAuthErrorMessage(err) };
    }
  };

  const signOut = async () => {
    if (isLiveFirebase && auth) {
      try {
        await firebaseSignOut(auth);
      } catch {
        // Limpiar estado en memoria aunque falle la red al cerrar sesión
      }
    }
    clearPrivateAuthState();
  };

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    if (!isLiveFirebase || !auth) {
      return { error: 'Firebase Auth no está configurado.' };
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return {};
    } catch (err) {
      return { error: mapAuthErrorMessage(err) };
    }
  };

  const resendEmailVerification = async (): Promise<{ error?: string; sent?: boolean }> => {
    if (!isLiveFirebase || !auth || !auth.currentUser) {
      return { error: 'No hay una sesión autenticada para reenviar el correo de verificación.' };
    }
    try {
      await sendEmailVerification(auth.currentUser);
      return { sent: true };
    } catch (err) {
      return { error: mapAuthErrorMessage(err) };
    }
  };

  const refreshEmailVerification = async (): Promise<{ verified: boolean; error?: string }> => {
    if (!isLiveFirebase || !auth || !auth.currentUser) {
      return { verified: false, error: 'Tu sesión expiró. Inicia sesión nuevamente.' };
    }
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const refreshed = auth.currentUser;
      setUser(refreshed);
      if (refreshed.emailVerified) {
        await ensureUserProfileAndWorkspace(refreshed);
        return { verified: true };
      }
      return {
        verified: false,
        error: 'El correo aún figura como no verificado en Firebase Auth. Revisa tu bandeja o spam.',
      };
    } catch (err) {
      return { verified: false, error: mapAuthErrorMessage(err) };
    }
  };

  const acceptInvitation = async (
    invitation: WorkspaceInvitation
  ): Promise<{ error?: string }> => {
    if (!auth?.currentUser) {
      return { error: 'Debes iniciar sesión con un correo verificado para aceptar invitaciones.' };
    }
    try {
      await firebaseDataService.acceptWorkspaceInvitation(
        invitation,
        profile?.fullName || auth.currentUser.displayName || undefined
      );
      await ensureUserProfileAndWorkspace(auth.currentUser, { autoProvision: false });
      return {};
    } catch (err) {
      return {
        error: formatCloudErrorForUser(err, 'No se pudo aceptar la invitación al workspace.').message,
      };
    }
  };

  const ensurePersonalWorkspace = async (workspaceName?: string): Promise<{ error?: string }> => {
    if (!auth?.currentUser) {
      return { error: 'Sesión no disponible.' };
    }
    try {
      await provisionPersonalWorkspace(auth.currentUser, workspaceName);
      await ensureUserProfileAndWorkspace(auth.currentUser, { autoProvision: false });
      return {};
    } catch (err) {
      return {
        error: formatCloudErrorForUser(err, 'No se pudo crear el workspace comercial.').message,
      };
    }
  };

  const refreshWorkspaces = async () => {
    if (auth?.currentUser) {
      await ensureUserProfileAndWorkspace(auth.currentUser, { autoProvision: false });
    }
  };

  const switchWorkspace = (workspaceId: string) => {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) {
      firebaseDataService.clearRuntimeCaches();
      clearPrivateAssetUrlCache();
      setCurrentWorkspace(found);
      setRole(workspaceRoles[found.id] || 'member');
    }
  };

  const retryConnection = async () => {
    await verifyServerConnectivity();
    if (auth?.currentUser) {
      try {
        await ensureUserProfileAndWorkspace(auth.currentUser);
      } catch (err) {
        const formatted = formatCloudErrorForUser(err);
        setConnectionState(formatted.code);
        setConnectionError(formatted.message);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        currentWorkspace,
        workspaces,
        pendingInvitations,
        role,
        loading,
        isLiveFirebase,
        connectionState,
        connectionError,
        retryConnection,
        refreshWorkspaces,
        resendEmailVerification,
        refreshEmailVerification,
        acceptInvitation,
        ensurePersonalWorkspace,
        signInWithGoogle,
        signIn,
        signUp,
        signOut,
        resetPassword,
        switchWorkspace,
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
