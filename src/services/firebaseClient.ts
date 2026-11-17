/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLIENTE CENTRAL DE FIREBASE (CLOUD-ONLY)
 * Inicializa Firebase App, Cloud Firestore (base de datos dedicada del proyecto),
 * Firebase Auth y Firebase Storage a partir de `resolveFirebaseRuntimeConfig`
 * (separación explícita development vs production).
 * No habilita caché persistente comercial en IndexedDB (memoria de sesión únicamente).
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import {
  resolveFirebaseRuntimeConfig,
  FirebaseClientConfig,
  FirebaseConfigResolution,
  FirebaseEnvironmentName,
  FirebaseConfigSource,
} from './firebaseConfig';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export type CloudConnectionCode =
  | 'checking'
  | 'connected'
  | 'not_configured'
  | 'unreachable'
  | 'session_expired'
  | 'unauthorized'
  | 'persistence_error';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export class CloudOperationError extends Error {
  public readonly code: CloudConnectionCode;
  public readonly operationType?: OperationType;
  public readonly path?: string | null;
  public readonly originalError?: unknown;

  constructor(
    code: CloudConnectionCode,
    message: string,
    options?: {
      operationType?: OperationType;
      path?: string | null;
      originalError?: unknown;
    }
  ) {
    super(message);
    this.name = 'CloudOperationError';
    this.code = code;
    this.operationType = options?.operationType;
    this.path = options?.path ?? null;
    this.originalError = options?.originalError;
  }
}

const resolvedRuntime: FirebaseConfigResolution = resolveFirebaseRuntimeConfig();
const activeConfig: FirebaseClientConfig | null = resolvedRuntime.config;

export function isFirebaseConfigured(): boolean {
  return resolvedRuntime.isConfigured && resolvedRuntime.config !== null;
}

export interface FirebaseEnvironmentInfo {
  environment: FirebaseEnvironmentName;
  isConfigured: boolean;
  projectId: string | null;
  firestoreDatabaseId: string | null;
  storageBucket: string | null;
  source: FirebaseConfigSource;
  usingSharedAppletFallback: boolean;
  configError: string | null;
}

export function getFirebaseEnvironmentInfo(): FirebaseEnvironmentInfo {
  return {
    environment: resolvedRuntime.environment,
    isConfigured: isFirebaseConfigured(),
    projectId: activeConfig?.projectId ?? null,
    firestoreDatabaseId: activeConfig?.firestoreDatabaseId ?? null,
    storageBucket: activeConfig?.storageBucket ?? null,
    source: resolvedRuntime.source,
    usingSharedAppletFallback: resolvedRuntime.usingSharedAppletFallback,
    configError: resolvedRuntime.configError,
  };
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured() && activeConfig) {
  appInstance = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
  // CRITICAL: Conectar explícitamente a firestoreDatabaseId provisionado para el entorno activo
  dbInstance = getFirestore(appInstance, activeConfig.firestoreDatabaseId);
  authInstance = getAuth(appInstance);
  storageInstance = getStorage(appInstance);
}

export const firebaseApp = appInstance;
export const db = dbInstance;
export const auth = authInstance;
export const storage = storageInstance;
export const firebaseConfig = (activeConfig ?? {
  projectId: '',
  appId: '',
  apiKey: '',
  authDomain: '',
  firestoreDatabaseId: '',
  storageBucket: '',
  messagingSenderId: '',
}) as FirebaseClientConfig;

export interface ConnectionCheckResult {
  state: CloudConnectionCode;
  message?: string;
}

/**
 * Valida la conectividad real contra el servidor Firestore al arrancar la aplicación.
 */
export async function testConnection(): Promise<ConnectionCheckResult> {
  if (!isFirebaseConfigured() || !db) {
    return {
      state: 'not_configured',
      message:
        resolvedRuntime.configError ||
        'Firebase no está configurado correctamente para el entorno actual.',
    };
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { state: 'connected' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code || '';

    if (
      msg.includes('the client is offline') ||
      code === 'unavailable' ||
      code === 'deadline-exceeded' ||
      msg.toLowerCase().includes('network')
    ) {
      console.error('Por favor verifica tu configuración o conectividad con Firebase:', msg);
      return {
        state: 'unreachable',
        message: 'No se pudo alcanzar Cloud Firestore en este momento. Verifica tu conexión a internet.',
      };
    }

    if (code === 'permission-denied') {
      // Si el servidor respondió con permission-denied, hubo conectividad real de red con Firestore.
      return {
        state: 'connected',
      };
    }

    return {
      state: 'unreachable',
      message: `No se pudo verificar la conexión con Firestore: ${msg}`,
    };
  }
}

// Ejecutar validación de conexión automática en navegador al arrancar
if (typeof window !== 'undefined' && isFirebaseConfigured()) {
  void testConnection();
}

export function classifyFirebaseError(
  error: unknown,
  fallbackCode: CloudConnectionCode = 'persistence_error'
): { code: CloudConnectionCode; userMessage: string } {
  if (error instanceof CloudOperationError) {
    return { code: error.code, userMessage: error.message };
  }

  const rawCode = ((error as { code?: string })?.code || '').toLowerCase();
  const status = (error as { status_?: number; status?: number })?.status_ ??
    (error as { status?: number })?.status;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === 'string'
        ? String((error as { message: string }).message)
        : String(error);
  const msgLower = rawMessage.toLowerCase();

  // Errores específicos de Firebase Storage (bucket no inicializado / HTTP 404 / cuota / permisos)
  if (
    rawCode.includes('storage/bucket-not-found') ||
    rawCode.includes('storage/project-not-found') ||
    (rawCode.startsWith('storage/') && (status === 404 || msgLower.includes('does not exist') || msgLower.includes('404')))
  ) {
    return {
      code: 'not_configured',
      userMessage:
        'El bucket de Firebase Storage no existe o aún no ha sido inicializado en Firebase Console (HTTP 404). Inicializa Storage y despliega storage.rules antes de subir imágenes.',
    };
  }

  if (rawCode.includes('storage/quota-exceeded')) {
    return {
      code: 'persistence_error',
      userMessage:
        'Se alcanzó la cuota máxima de Firebase Storage. Libera espacio o actualiza el plan del proyecto.',
    };
  }

  if (rawCode.includes('storage/retry-limit-exceeded') || rawCode.includes('storage/canceled')) {
    return {
      code: 'unreachable',
      userMessage:
        'La subida hacia Firebase Storage se interrumpió o superó el tiempo de espera. Reintenta con conexión estable.',
    };
  }

  if (rawCode.includes('storage/object-not-found')) {
    return {
      code: 'persistence_error',
      userMessage: 'El archivo solicitado no se encuentra en Firebase Storage.',
    };
  }

  if (
    rawCode.includes('unavailable') ||
    rawCode.includes('deadline-exceeded') ||
    rawCode.includes('network-request-failed') ||
    msgLower.includes('the client is offline') ||
    msgLower.includes('network error') ||
    msgLower.includes('failed to fetch')
  ) {
    return {
      code: 'unreachable',
      userMessage:
        'Firebase Firestore o Storage se encuentra temporalmente inaccesible. Tus cambios siguen en pantalla para reintentar.',
    };
  }

  if (
    rawCode.includes('unauthenticated') ||
    rawCode.includes('storage/unauthenticated') ||
    rawCode.includes('user-token-expired') ||
    rawCode.includes('invalid-user-token') ||
    rawCode.includes('requires-recent-login')
  ) {
    return {
      code: 'session_expired',
      userMessage: 'Tu sesión de Firebase ha expirado o no has iniciado sesión. Vuelve a iniciar sesión para continuar.',
    };
  }

  if (rawCode.includes('permission-denied') || rawCode.includes('storage/unauthorized')) {
    if (auth && !auth.currentUser) {
      return {
        code: 'session_expired',
        userMessage: 'No hay una sesión autenticada activa. Inicia sesión para acceder al workspace.',
      };
    }
    if (auth?.currentUser && !auth.currentUser.emailVerified) {
      return {
        code: 'unauthorized',
        userMessage:
          'Debes verificar tu correo electrónico en Firebase Auth antes de acceder o escribir datos en este workspace.',
      };
    }
    if (rawCode.includes('storage/unauthorized')) {
      return {
        code: 'unauthorized',
        userMessage:
          'Firebase Storage denegó el acceso (storage.rules). Verifica que tu cuenta esté verificada y autorizada en este workspace.',
      };
    }
    return {
      code: 'unauthorized',
      userMessage:
        'No tienes permisos suficientes en este workspace o las reglas de seguridad denegaron la operación.',
    };
  }

  if (rawCode.includes('resource-exhausted') || msgLower.includes('quota exceeded')) {
    return {
      code: 'persistence_error',
      userMessage:
        'Se alcanzó la cuota temporal de Firestore. Inténtalo más tarde o verifica los límites del proyecto Firebase.',
    };
  }

  if (!isFirebaseConfigured()) {
    return {
      code: 'not_configured',
      userMessage: resolvedRuntime.configError || 'Firebase no está configurado en el entorno.',
    };
  }

  return {
    code: fallbackCode,
    userMessage: rawMessage || 'Error de persistencia al sincronizar con Firebase.',
  };
}

/**
 * Registra contexto estructurado de Firestore según el estándar FirestoreErrorInfo
 * y lanza CloudOperationError con JSON diagnóstico cuando es fallo de permisos o error tipado en UI.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const rawCode = ((error as { code?: string })?.code || '').toLowerCase();

  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));

  const classified = classifyFirebaseError(error, 'persistence_error');
  if (rawCode.includes('permission-denied') || rawMsg.includes('Missing or insufficient permissions')) {
    const structuredError = new CloudOperationError(
      classified.code,
      JSON.stringify(errInfo),
      { operationType, path, originalError: error }
    );
    throw structuredError;
  }

  throw new CloudOperationError(classified.code, classified.userMessage, {
    operationType,
    path,
    originalError: error,
  });
}

export function formatCloudErrorForUser(error: unknown, fallback = 'Ocurrió un error al sincronizar con Firebase.'): {
  code: CloudConnectionCode;
  message: string;
} {
  if (error instanceof CloudOperationError) {
    if (error.message.startsWith('{') && error.message.includes('"operationType"')) {
      return {
        code: error.code,
        message:
          error.code === 'session_expired'
            ? 'Tu sesión expiró o no has iniciado sesión. Inicia sesión para continuar.'
            : 'Permisos insuficientes en Firebase Firestore para realizar esta operación.',
      };
    }
    return { code: error.code, message: error.message };
  }

  const classified = classifyFirebaseError(error);
  return {
    code: classified.code,
    message: classified.userMessage || fallback,
  };
}
