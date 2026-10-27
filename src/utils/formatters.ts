/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedCurrency, SupportedLanguage } from '../types';

export function formatCurrency(
  amount: number,
  currency: SupportedCurrency = 'COP',
  lang: SupportedLanguage = 'es'
): string {
  const locale = lang === 'es' ? 'es-CO' : 'en-US';

  if (currency === 'COP') {
    // Colombian pesos are traditionally formatted with no decimals
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(
  isoDate: string,
  lang: SupportedLanguage = 'es',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
): string {
  try {
    const d = new Date(isoDate);
    const locale = lang === 'es' ? 'es-CO' : 'en-US';
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return isoDate;
  }
}

export function formatDateTime(
  isoDate: string,
  lang: SupportedLanguage = 'es'
): string {
  return formatDate(isoDate, lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
