# Taqwa Timekeeper (Chrome Extension)

A Manifest V3 Chrome Extension designed to promote digital wellbeing and religious observance through intentional browsing, focus modes, and prayer time integration.

## 🛠 Technical Overview

**Stack:**
- **Core**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Manifest**: V3
- **APIs**: `declarativeNetRequest`, `storage`, `alarms`, `notifications`, `geolocation`, `i18n`
- **External Data**: [Aladhan API](https://aladhan.com/prayer-times-api) for prayer timings.

## ✨ Features

- **Dynamic Blocking**: Uses `declarativeNetRequest` to redirect blocked domains to a local `intention.html` page.
- **Intention Flow**: Prompts users with self-reflection questions before granting temporary access (managed via dynamic rules addition/removal).
- **Focus Mode**: Global strict blocking with a countdown timer. Implemented using high-priority DNR rules and `alarms`.
- **Prayer Integration**: 
  - Fetches timings based on Geolocation or City/Country.
  - Background alarm (`prayerTicker`) checks every minute.
  - Sends system notifications 5 minutes before prayer.
  - Enforces strict blocking during prayer windows.
- **Localization**: Full support for English (`en`) and Arabic (`ar`) via `_locales` directory.
- **Premium UI**: Custom CSS variables, glassmorphism effects, and responsive design.

## 📂 Project Structure

```
/Taqwa Timekeeper
├── manifest.json          # Extension configuration & permissions
├── background.js          # Service worker: Alarms, Blocking Logic, API calls
├── popup.html/js/css      # Extension popup (Focus toggles, Timer UI)
├── options.html/js/css    # Settings page (Blocklist, Location, Language)
├── intention.html/js/css  # The redirection landing page (The "Block Screen")
├── i18n.js                # Helper for RTL/Localization logic
├── _locales/              # JSON message files for En/Ar
└── icons/                 # App icons
```

## 🚀 Installation

1.  Clone or download this repository.
2.  Open **Chrome** and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the `Taqwa Timekeeper` directory.

## ⚙️ wrapper Permissions Explained

- `activeTab` / `tabs`: To control tab closing and reloading.
- `declarativeNetRequest`: To block and redirect network requests without inspecting content.
- `storage`: To save user settings (blocked sites, location, language).
- `alarms`: To manage timers (Focus mode, temporary access) reliably in the background.
- `geolocation`: To auto-detect location for prayer times.
- `notifications`: To send the "5-min before prayer" warning.

## 🤝 Credits

- **Prayer Times**: Powered by [Aladhan API](https://aladhan.com/).
- **Icons**: Custom generated assets.
