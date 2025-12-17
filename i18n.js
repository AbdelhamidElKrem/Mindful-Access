// i18n.js
// Recursively replace data-i18n attributes with localized strings
function localizeHtmlPage() {
    chrome.storage.local.get(['preferredLanguage'], (data) => {
        const lang = data.preferredLanguage;

        if (lang && lang !== 'default') {
            // Load specific language
            loadLanguageAndApply(lang);
        } else {
            // Use browser default
            applyI18n(chrome.i18n.getMessage, chrome.i18n.getMessage("@@ui_locale"));
        }
    });
}

function loadLanguageAndApply(lang) {
    const jsonPath = `_locales/${lang}/messages.json`;
    const url = chrome.runtime.getURL(jsonPath);

    fetch(url)
        .then(response => response.json())
        .then(messages => {
            const getMessage = (key) => {
                return messages[key] ? messages[key].message : "";
            };
            applyI18n(getMessage, lang);
        })
        .catch(err => {
            console.error("Failed to load locale", err);
            // Fallback
            applyI18n(chrome.i18n.getMessage, chrome.i18n.getMessage("@@ui_locale"));
        });
}

function applyI18n(getMessageFn, localeCode) {
    // Set dir
    if (localeCode && localeCode.startsWith("ar")) {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "ar");
    } else {
        document.documentElement.setAttribute("dir", "ltr");
        document.documentElement.setAttribute("lang", "en");
    }

    const objects = document.querySelectorAll('[data-i18n]');
    for (const obj of objects) {
        const key = obj.getAttribute('data-i18n');
        const msg = getMessageFn(key);
        if (msg) {
            obj.innerText = msg;
        }
    }

    // Also handle input placeholders & buttons
    const inputs = document.querySelectorAll('[data-i18n-placeholder]');
    for (const input of inputs) {
        const key = input.getAttribute('data-i18n-placeholder');
        const msg = getMessageFn(key);
        if (msg) {
            input.setAttribute('placeholder', msg);
        }
    }

    // Sometimes values are needed
    const values = document.querySelectorAll('[data-i18n-value]');
    for (const val of values) {
        const key = val.getAttribute('data-i18n-value');
        const msg = getMessageFn(key);
        if (msg) {
            val.value = msg;
        }
    }

    // Override chrome.i18n.getMessage globally if needed for other scripts on this page?
    // Dangerous, but useful if other scripts rely on it.
    // However, chrome.i18n.getMessage is read-only.
    // Scripts should use a wrapped function if they want to support this.
    // For now, this only localizes HTML on load.

    // If scripts need to access specific messages, they should check storage themselves or we expose a global helper.
    window.taqwaGetMessage = getMessageFn; // helper
}

document.addEventListener('DOMContentLoaded', localizeHtmlPage);
