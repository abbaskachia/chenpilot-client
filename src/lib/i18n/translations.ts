export const translations = {
  en: {
    common: {
      language: 'Language',
      english: 'English',
      arabic: 'العربية',
      spanish: 'Español',
      french: 'Français',
    },
    nav: {
      dashboard: 'Dashboard',
      chat: 'Chat',
      history: 'History',
      contacts: 'Contacts',
      transactions: 'Transactions',
      settings: 'Settings',
    },
    settings: {
      title: 'Settings',
      description: 'Manage your account preferences and application settings.',
      profile: 'Profile',
      appearance: 'Appearance',
      language: 'Language',
      notifications: 'Notifications',
      security: 'Security',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      mfaTitle: 'Two-Factor Authentication',
      mfaDescription: 'Add an extra layer of security to your account with two-factor authentication.',
      mfaStatus: 'Status',
      mfaEnabled: 'Enabled',
      mfaDisabled: 'Disabled',
    },
  },
  ar: {
    common: {
      language: 'اللغة',
      english: 'English',
      arabic: 'العربية',
      spanish: 'Español',
      french: 'Français',
    },
    nav: {
      dashboard: 'لوحة التحكم',
      chat: 'الدردشة',
      history: 'السجل',
      contacts: 'جهات الاتصال',
      transactions: 'المعاملات',
      settings: 'الإعدادات',
    },
    settings: {
      title: 'الإعدادات',
      description: 'إدارة تفضيلات حسابك وإعدادات التطبيق.',
      profile: 'الملف الشخصي',
      appearance: 'المظهر',
      language: 'اللغة',
      notifications: 'الإشعارات',
      security: 'الأمان',
      theme: 'المظهر',
      light: 'فاتح',
      dark: 'داكن',
      mfaTitle: 'المصادقة الثنائية',
      mfaDescription: 'أضف طبقة أمان إضافية لحسابك باستخدام المصادقة الثنائية.',
      mfaStatus: 'الحالة',
      mfaEnabled: 'مفعل',
      mfaDisabled: 'معطل',
    },
  },
  es: {
    common: {
      language: 'Idioma',
      english: 'English',
      arabic: 'العربية',
      spanish: 'Español',
      french: 'Français',
    },
    nav: {
      dashboard: 'Panel de control',
      chat: 'Chat',
      history: 'Historial',
      contacts: 'Contactos',
      transactions: 'Transacciones',
      settings: 'Configuración',
    },
    settings: {
      title: 'Configuración',
      description: 'Administra las preferencias de tu cuenta y la configuración de la aplicación.',
      profile: 'Perfil',
      appearance: 'Apariencia',
      language: 'Idioma',
      notifications: 'Notificaciones',
      security: 'Seguridad',
      theme: 'Tema',
      light: 'Claro',
      dark: 'Oscuro',
      mfaTitle: 'Autenticación de dos factores',
      mfaDescription: 'Añade una capa adicional de seguridad a tu cuenta con la autenticación de dos factores.',
      mfaStatus: 'Estado',
      mfaEnabled: 'Activado',
      mfaDisabled: 'Desactivado',
    },
  },
  fr: {
    common: {
      language: 'Langue',
      english: 'English',
      arabic: 'العربية',
      spanish: 'Español',
      french: 'Français',
    },
    nav: {
      dashboard: 'Tableau de bord',
      chat: 'Chat',
      history: 'Historique',
      contacts: 'Contacts',
      transactions: 'Transactions',
      settings: 'Paramètres',
    },
    settings: {
      title: 'Paramètres',
      description: 'Gérez vos préférences de compte et les paramètres de l\'application.',
      profile: 'Profil',
      appearance: 'Apparence',
      language: 'Langue',
      notifications: 'Notifications',
      security: 'Sécurité',
      theme: 'Thème',
      light: 'Clair',
      dark: 'Sombre',
      mfaTitle: 'Authentification à deux facteurs',
      mfaDescription: 'Ajoutez une couche de sécurité supplémentaire à votre compte avec l\'authentification à deux facteurs.',
      mfaStatus: 'Statut',
      mfaEnabled: 'Activé',
      mfaDisabled: 'Désactivé',
    },
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKeys = keyof typeof translations.en;

export const LANGUAGES: { code: Language; name: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
];

export const LANGUAGE_TO_LOCALE: Record<Language, string> = {
  en: 'en-US',
  ar: 'ar-SA',
  es: 'es-ES',
  fr: 'fr-FR',
};

export function getLocaleForLanguage(lang?: Language | string): string {
  if (!lang) return 'en-US';
  if (lang in LANGUAGE_TO_LOCALE) {
    return LANGUAGE_TO_LOCALE[lang as Language];
  }
  if (typeof lang === 'string' && lang.includes('-')) {
    return lang;
  }
  return 'en-US';
}
