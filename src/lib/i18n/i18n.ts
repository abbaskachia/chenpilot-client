import {
  translations,
  Language,
  LANGUAGES,
  LANGUAGE_TO_LOCALE,
  getLocaleForLanguage,
} from './translations';

export { Language, LANGUAGES, LANGUAGE_TO_LOCALE, getLocaleForLanguage };

export function getLanguageDirection(lang: Language): 'ltr' | 'rtl' {
  const langData = LANGUAGES.find(l => l.code === lang);
  return langData?.dir || 'ltr';
}

export function t(lang: Language, path: string): string {
  const keys = path.split('.');
  let value: unknown = translations[lang];

  for (const key of keys) {
    value = (value as Record<string, unknown> | undefined)?.[key];
  }

  // Fallback to English if translation missing
  if (!value) {
    value = translations.en;
    for (const key of keys) {
      value = (value as Record<string, unknown> | undefined)?.[key];
    }
  }

  return (value as string) || path;
}

export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('language');
  if (stored && translations[stored as Language]) {
    return stored as Language;
  }
  return 'en';
}

export function setStoredLanguage(lang: Language): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lang);
  }
}
