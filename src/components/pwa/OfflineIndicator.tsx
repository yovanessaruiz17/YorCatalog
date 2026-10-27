/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSettings } from '../../context/SettingsContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useSettings();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-amber-950 dark:text-amber-100 bg-amber-100/95 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-800 rounded-xl shadow-lg backdrop-blur-xs transition-all animate-in fade-in slide-in-from-bottom-2">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
      </span>
      <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
      <span>{t.common.offlineMessage}</span>
    </div>
  );
};
