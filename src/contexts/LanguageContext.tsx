import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, getLanguage, setLanguage as setI18nLanguage, translations } from '../utils/i18n';

type TranslationKey = keyof typeof translations['en'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<Language>('en');

  // Load initial language
  useEffect(() => {
    setLang(getLanguage());
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setI18nLanguage(lang);
    setLang(lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language]?.[key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
