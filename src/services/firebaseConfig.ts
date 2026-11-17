/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RESOLUCIÓN DE CONFIGURACIÓN FIREBASE POR ENTORNO (DEVELOPMENT vs PRODUCTION)
 * Garantiza:
 * - Separación explícita entre entorno de desarrollo (`VITE_FIREBASE_DEV_*`) y producción (`VITE_FIREBASE_PROD_*`).
 * - Prevención de contaminación: un build de producción no puede apuntar al `projectId` de desarrollo.
 * - Cero valores ficticios/placeholder como fallback (Cloud-Only estricto).
 */

import rawBundledConfig from '../../firebase-applet-config.json';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  measurementId?: string;
}

export type FirebaseEnvironmentName = 'development' | 'production';
export type FirebaseConfigSource = 'dev_env' | 'prod_env' | 'shared_env' | 'applet_config' | 'unconfigured';

export interface FirebaseConfigResolution {
  environment: FirebaseEnvironmentName;
  isConfigured: boolean;
  config: FirebaseClientConfig | null;
  source: FirebaseConfigSource;
  usingSharedAppletFallback: boolean;
  configError: string | null;
}

const REQUIRED_FIELDS: (keyof FirebaseClientConfig)[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'firestoreDatabaseId',
];

const PLACEHOLDER_PATTERNS = [
  'remixed-project-id',
  'your-project',
  'your_project',
  'my_firebase',
  'placeholder',
  'changeme',
  'dummy',
  'fake-',
  'example.com',
];

export function isPlaceholderOrEmpty(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

function readPrefixedConfig(
  env: Record<string, string | undefined>,
  prefix: 'VITE_FIREBASE_DEV_' | 'VITE_FIREBASE_PROD_' | 'VITE_FIREBASE_'
): { hasAnyValue: boolean; partial: Partial<FirebaseClientConfig> } {
  const mapping: Record<keyof FirebaseClientConfig, string> = {
    apiKey: `${prefix}API_KEY`,
    authDomain: `${prefix}AUTH_DOMAIN`,
    projectId: `${prefix}PROJECT_ID`,
    storageBucket: `${prefix}STORAGE_BUCKET`,
    messagingSenderId: `${prefix}MESSAGING_SENDER_ID`,
    appId: `${prefix}APP_ID`,
    firestoreDatabaseId: `${prefix}FIRESTORE_DATABASE_ID`,
    measurementId: `${prefix}MEASUREMENT_ID`,
  };

  const partial: Partial<FirebaseClientConfig> = {};
  let hasAnyValue = false;

  for (const [field, envKey] of Object.entries(mapping)) {
    const val = env[envKey]?.trim();
    if (val) {
      hasAnyValue = true;
      partial[field as keyof FirebaseClientConfig] = val;
    }
  }

  return { hasAnyValue, partial };
}

function validateCompleteConfig(
  candidate: Partial<FirebaseClientConfig> | null | undefined,
  label: string
): { valid: boolean; config: FirebaseClientConfig | null; error: string | null } {
  if (!candidate) {
    return {
      valid: false,
      config: null,
      error: `Configuración de Firebase ausente para ${label}.`,
    };
  }

  const missing: string[] = [];
  for (const key of REQUIRED_FIELDS) {
    if (isPlaceholderOrEmpty(candidate[key])) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      config: null,
      error: `Configuración Firebase incompleta o con placeholders en ${label}. Faltan: ${missing.join(', ')}.`,
    };
  }

  return {
    valid: true,
    config: {
      apiKey: candidate.apiKey!.trim(),
      authDomain: candidate.authDomain!.trim(),
      projectId: candidate.projectId!.trim(),
      storageBucket: candidate.storageBucket!.trim(),
      messagingSenderId: candidate.messagingSenderId!.trim(),
      appId: candidate.appId!.trim(),
      firestoreDatabaseId: candidate.firestoreDatabaseId!.trim(),
      measurementId: candidate.measurementId?.trim() || undefined,
    },
    error: null,
  };
}

export interface ResolveFirebaseConfigOptions {
  mode?: string;
  isProdBuild?: boolean;
  env?: Record<string, string | undefined>;
  bundledConfig?: Partial<FirebaseClientConfig> | null;
}

export function resolveFirebaseRuntimeConfig(
  options?: ResolveFirebaseConfigOptions
): FirebaseConfigResolution {
  const env =
    options?.env ??
    ((typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env) ||
      {});
  const mode = options?.mode ?? env.MODE ?? 'development';
  const isProd =
    options?.isProdBuild ?? (mode === 'production' || String(env.PROD) === 'true');
  const environment: FirebaseEnvironmentName = isProd ? 'production' : 'development';
  const bundled =
    options?.bundledConfig !== undefined
      ? options.bundledConfig
      : (rawBundledConfig as Partial<FirebaseClientConfig>);

  // Guardia explícita: impedir que un build de producción declare target=development
  if (isProd && env.VITE_FIREBASE_TARGET_ENV === 'development') {
    return {
      environment,
      isConfigured: false,
      config: null,
      source: 'unconfigured',
      usingSharedAppletFallback: false,
      configError:
        'Bloqueo de seguridad de entorno: un build de producción no puede ejecutarse con VITE_FIREBASE_TARGET_ENV="development".',
    };
  }

  const devScoped = readPrefixedConfig(env, 'VITE_FIREBASE_DEV_');
  const prodScoped = readPrefixedConfig(env, 'VITE_FIREBASE_PROD_');
  const sharedScoped = readPrefixedConfig(env, 'VITE_FIREBASE_');

  if (isProd) {
    let selectedSource: FirebaseConfigSource = 'unconfigured';
    let validation: { valid: boolean; config: FirebaseClientConfig | null; error: string | null };

    if (prodScoped.hasAnyValue) {
      selectedSource = 'prod_env';
      validation = validateCompleteConfig(prodScoped.partial, 'variables VITE_FIREBASE_PROD_*');
    } else if (sharedScoped.hasAnyValue) {
      selectedSource = 'shared_env';
      validation = validateCompleteConfig(sharedScoped.partial, 'variables VITE_FIREBASE_*');
    } else {
      selectedSource = 'applet_config';
      validation = validateCompleteConfig(bundled, 'firebase-applet-config.json (producción)');
    }

    if (!validation.valid || !validation.config) {
      return {
        environment,
        isConfigured: false,
        config: null,
        source: 'unconfigured',
        usingSharedAppletFallback: false,
        configError: validation.error,
      };
    }

    // Impedir que producción apunte al proyecto configurado explícitamente para desarrollo
    const devProjectId = devScoped.partial.projectId?.trim();
    if (devProjectId && !isPlaceholderOrEmpty(devProjectId) && devProjectId === validation.config.projectId) {
      return {
        environment,
        isConfigured: false,
        config: null,
        source: 'unconfigured',
        usingSharedAppletFallback: false,
        configError:
          `Bloqueo de separación de entornos: el build de producción apunta al mismo projectId de desarrollo (${devProjectId}).`,
      };
    }

    return {
      environment,
      isConfigured: true,
      config: validation.config,
      source: selectedSource,
      usingSharedAppletFallback: false,
      configError: null,
    };
  }

  // Entorno development
  if (devScoped.hasAnyValue) {
    const validation = validateCompleteConfig(devScoped.partial, 'variables VITE_FIREBASE_DEV_*');
    return {
      environment,
      isConfigured: validation.valid,
      config: validation.config,
      source: validation.valid ? 'dev_env' : 'unconfigured',
      usingSharedAppletFallback: false,
      configError: validation.error,
    };
  }

  if (sharedScoped.hasAnyValue) {
    const validation = validateCompleteConfig(sharedScoped.partial, 'variables VITE_FIREBASE_*');
    return {
      environment,
      isConfigured: validation.valid,
      config: validation.config,
      source: validation.valid ? 'shared_env' : 'unconfigured',
      usingSharedAppletFallback: false,
      configError: validation.error,
    };
  }

  if (env.VITE_FIREBASE_REQUIRE_DEV_ENV === 'true') {
    return {
      environment,
      isConfigured: false,
      config: null,
      source: 'unconfigured',
      usingSharedAppletFallback: false,
      configError:
        'VITE_FIREBASE_REQUIRE_DEV_ENV está activo y faltan las variables VITE_FIREBASE_DEV_* en .env.local para aislar desarrollo de producción.',
    };
  }

  const fallbackValidation = validateCompleteConfig(bundled, 'firebase-applet-config.json');
  return {
    environment,
    isConfigured: fallbackValidation.valid,
    config: fallbackValidation.config,
    source: fallbackValidation.valid ? 'applet_config' : 'unconfigured',
    usingSharedAppletFallback: fallbackValidation.valid,
    configError: fallbackValidation.error,
  };
}
