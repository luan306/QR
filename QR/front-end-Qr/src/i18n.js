import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import vi from "./locales/vi/translation.json";
import en from "./locales/en/translation.json";
import ja from "./locales/ja/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
      ja: { translation: ja }
    },

    fallbackLng: "vi",

    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"] // 🔥 lưu lại ngôn ngữ
    },

    interpolation: {
      escapeValue: false
    }
  });

export default i18n;