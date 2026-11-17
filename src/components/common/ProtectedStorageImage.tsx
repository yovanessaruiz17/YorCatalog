/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * COMPONENTE DE VISUALIZACIÓN SEGURA DE IMÁGENES PRIVADAS EN STORAGE
 * - Si `src` es externo o pertenece a `public-catalogs/`, lo renderiza directamente.
 * - Si `src` apunta a un activo privado (`catalog-images/` o `workspace-private/`),
 *   solicita una Signed URL V4 de vida corta al Storage Broker (`/api/storage/private-asset-url`)
 *   y renueva automáticamente si caduca durante la sesión (sin Download Tokens permanentes).
 */

import React, { useEffect, useState } from 'react';
import { isPrivateManagedAsset, resolvePrivateAssetUrl } from '../../services/imageService';
import { useAuth } from '../../context/AuthContext';

interface ProtectedStorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  workspaceId?: string;
}

export const ProtectedStorageImage: React.FC<ProtectedStorageImageProps> = ({
  src,
  workspaceId,
  onError,
  ...imgProps
}) => {
  const { currentWorkspace } = useAuth();
  const effectiveWsId = workspaceId || currentWorkspace?.id;
  const needsBrokerSigning = isPrivateManagedAsset(src);

  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    needsBrokerSigning ? '' : src
  );
  const [retriedAfterExpiry, setRetriedAfterExpiry] = useState(false);

  useEffect(() => {
    let active = true;
    setRetriedAfterExpiry(false);

    if (!src || !isPrivateManagedAsset(src)) {
      setResolvedSrc(src);
      return;
    }

    resolvePrivateAssetUrl(src, effectiveWsId)
      .then((signedUrl) => {
        if (active) setResolvedSrc(signedUrl);
      })
      .catch(() => {
        if (active) setResolvedSrc('');
      });

    return () => {
      active = false;
    };
  }, [src, effectiveWsId]);

  const handleImgError: React.ReactEventHandler<HTMLImageElement> = (e) => {
    if (needsBrokerSigning && !retriedAfterExpiry) {
      setRetriedAfterExpiry(true);
      void resolvePrivateAssetUrl(src, effectiveWsId, { forceRefresh: true })
        .then((freshUrl) => setResolvedSrc(freshUrl))
        .catch(() => undefined);
      return;
    }
    onError?.(e);
  };

  if (!resolvedSrc) {
    return (
      <div
        className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${imgProps.className || ''}`}
        aria-label={imgProps.alt || 'Cargando imagen'}
      />
    );
  }

  return <img {...imgProps} src={resolvedSrc} onError={handleImgError} />;
};
