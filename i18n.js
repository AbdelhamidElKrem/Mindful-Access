// i18n.js

document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    applyLocalization();
});

// Exposed function to re-run localization (called by options.js on save)
function applyLocalization() {
    chrome.storage.local.get(['preferredLanguage'], (data) => {
        let lang = data.preferredLanguage || 'default';

        // If default, detect browser language
        if (lang === 'default') {
            const uiLang = chrome.i18n.getUILanguage();
            lang = uiLang.startsWith('ar') ? 'ar' : 'en';
        }

        // Apply RTL/Dir
        if (lang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.documentElement.setAttribute('lang', 'ar');
            document.body.classList.add('is-arabic');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
            document.body.classList.remove('is-arabic');
        }

        // Apply Strings from Dictionary
        // Ensure translations is available
        if (typeof translations === 'undefined') {
            console.error("Translations dictionary not found!");
            return;
        }

        const strings = translations[lang] || translations['en'];

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (strings[key]) {
                el.textContent = strings[key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (strings[key]) {
                el.placeholder = strings[key];
            }
        });

        // Also update document title
        const title = document.querySelector('title[data-i18n]');
        if (title) {
            const key = title.getAttribute('data-i18n');
            if (strings[key]) document.title = strings[key];
        }
    });
}
