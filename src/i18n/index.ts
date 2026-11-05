import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, resources, type SupportedLocale } from './locales';

const isSupportedLocale = (value: string | null): value is SupportedLocale =>
  value !== null && Object.prototype.hasOwnProperty.call(resources, value);

export const readPreferredLocale = (storage?: Pick<Storage, 'getItem'>): SupportedLocale => {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const stored = target?.getItem(LOCALE_STORAGE_KEY) ?? null;
    return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

export const persistLocalePreference = (locale: SupportedLocale, storage?: Pick<Storage, 'setItem'>): void => {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    target?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch { /* Keep the active locale in memory when browser storage is unavailable. */ }
};

const storedLocale = readPreferredLocale();

void i18n.use(initReactI18next).init({
  resources,
  lng: isSupportedLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (locale) => {
  if (typeof window !== 'undefined' && isSupportedLocale(locale)) {
    persistLocalePreference(locale);
  }
});

export { i18n };
export const changeLocale = (locale: SupportedLocale): Promise<unknown> => i18n.changeLanguage(locale);
