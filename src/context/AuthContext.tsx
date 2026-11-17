/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CONTEXTO DE AUTENTICACIÓN Y MULTI-TENANCY CLOUD-ONLY (FIREBASE AUTH + FIRESTORE)
 * Conecta exclusivamente con Firebase Auth y Cloud Firestore.
 * Se prohíbe cualquier mecanismo de sesión simulada en localStorage o persistencia comercial local.
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
import { Profile, Workspace, WorkspaceRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  role: WorkspaceRole;
  loading: boolean;
  isLiveFirebase: boolean;
  connectionState: CloudConnectionCode;
  connectionError: string | null;
  retryConnection: () => Promise<void>;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
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
    setUser(null);
    setProfile(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
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

  const ensureUserProfileAndWorkspace = useCallback(
    async (firebaseUser: User, preferredWorkspaceName?: string) => {
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

      // 2. Listar workspaces donde el usuario es propietario
      const wsQuery = query(collection(db, 'workspaces'), where('ownerId', '==', uid));
      const wsSnap = await getDocs(wsQuery);

      let wsList: Workspace[] = wsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          name: data.name || 'Mi Negocio Comercial',
          slug: data.slug || d.id,
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
      });

      // 3. Si es usuario nuevo, crear workspace inicial /workspaces/ws_{uid} + member /members/{uid} atómicamente
      if (wsList.length === 0) {
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

          await batch.commit();

          wsList = [
            {
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
            },
          ];
        } else {
          const d = existingDefault.data();
          wsList = [
            {
              id: d.id || defaultWsId,
              name: d.name || 'Mi Negocio Comercial',
              slug: d.slug || defaultWsId,
              tagline: d.tagline || undefined,
              logoUrl: d.logoUrl || undefined,
              whatsappNumber: d.whatsappNumber || '',
              contactEmail: d.contactEmail || undefined,
              currency: d.currency || 'COP',
              language: d.language || 'es',
              theme: d.theme || 'light',
              settingsJson: d.settingsJson,
              createdAt: mapTimestamp(d.createdAt),
            },
          ];
        }
      }

      // 4. Cargar roles de cada workspace
      const rolesMap: Record<string, WorkspaceRole> = {};
      for (const ws of wsList) {
        try {
          const memberSnap = await getDoc(doc(db, 'workspaces', ws.id, 'members', uid));
          if (memberSnap.exists()) {
            rolesMap[ws.id] = (memberSnap.data().role as WorkspaceRole) || 'owner';
          } else {
            rolesMap[ws.id] = 'owner';
          }
        } catch {
          rolesMap[ws.id] = 'owner';
        }
      }

      setWorkspaces(wsList);
      setWorkspaceRoles(rolesMap);

      setCurrentWorkspace((prev) => {
        const stillValid = prev ? wsList.find((w) => w.id === prev.id) : undefined;
        const selected = stillValid || wsList[0] || null;
        if (selected) {
          setRole(rolesMap[selected.id] || 'owner');
        }
        return selected;
      });

      setConnectionState('connected');
      setConnectionError(null);
    },
    []
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
          // Confirmar si el backend está conectado aunque no haya sesión iniciada
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
        await ensureUserProfileAndWorkspace(credential.user, workspaceName);
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
        await sendEmailVerification(credential.user);
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
        await ensureUserProfileAndWorkspace(credential.user, workspaceName);
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

  const switchWorkspace = (workspaceId: string) => {
    const found = workspaces.find((w) => w.id === workspaceId);
    if (found) {
      firebaseDataService.clearRuntimeCaches();
      setCurrentWorkspace(found);
      setRole(workspaceRoles[found.id] || 'owner');
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
        role,
        loading,
        isLiveFirebase,
        connectionState,
        connectionError,
        retryConnection,
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
