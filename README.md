# Mindful Access (Chrome Extension)

A Manifest V3 Chrome Extension designed to promote digital wellbeing and religious observance through intentional browsing, focus modes, and prayer time integration.

## 🛠 Technical Overview

**Stack:**
- **Core**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Manifest**: V3
- **APIs**: `declarativeNetRequest`, `storage`, `alarms`, `notifications`, `geolocation`, `i18n`
- **External Data**: [Aladhan API](https://aladhan.com/prayer-times-api) for prayer timings.
- **Data (Offline)**: Reverse Geocoding via BigDataCloud Client API.

## ✨ Features

- **Dynamic Blocking**: Uses `declarativeNetRequest` to redirect blocked domains to a local `intention.html` page.
- **Intention Flow**: Prompts users with self-reflection questions before granting temporary access.
- **Focus Mode**: Global strict blocking with a countdown timer.
- **Prayer Integration**: 
  - **Smart Location**: GPS Auto-detect or **Manual City/Country Override**.
  - **Customizable Duration**: Set the prayer blocking window from 1 to 60 minutes.
  - Fetches accurate prayer times and displays them in a localized table.
  - Sends system notifications 5 minutes before prayer.
- **Localization & Design**: 
  - **Bilingual**: Full English (`en`) and Arabic (`ar`) support with RTL layout.
  - **Premium UI**: "Deep Green & Gold" theme with glassmorphism and collapsible menus.

## 📂 Project Structure

```
/Mindful Access
├── manifest.json          # Extension configuration & permissions
├── background.js          # Service worker: Alarms, Blocking Logic, API calls
├── popup.html/js/css      # Extension popup (Focus toggles, Timer UI)
├── options.html/js/css    # Settings page (Blocklist, Location, Language)
├── intention.html/js/css  # The redirection landing page (The "Block Screen")
{{ ... }}

1.  Clone or download this repository.
2.  Open **Chrome** and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the `Mindful Access` directory.

## ⚙️ Permissions Explained

- `activeTab` / `tabs`: To control tab closing and reloading.
- `declarativeNetRequest`: To block and redirect network requests.
- `storage`: To save settings (blocked sites, location, duration, language).
- `alarms`: To manage timers (Focus, Temporary Access, Prayer Checks).
- `geolocation`: To auto-detect location for prayer times.
- `notifications`: For prayer time alerts.

## 🤝 Credits

- **Prayer Times**: Powered by [Aladhan API](https://aladhan.com/).
- **Reverse Geocoding**: Powered by [BigDataCloud](https://www.bigdatacloud.com/).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and our code of conduct.

