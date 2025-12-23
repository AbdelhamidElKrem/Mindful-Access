// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const focusOptions = document.getElementById('focus-options');
    const focusTimer = document.getElementById('focus-timer');
    const prayerToggle = document.getElementById('prayer-toggle');
    const optionsBtn = document.getElementById('options-btn');

    // Progress Bar Elements
    const progressSection = document.getElementById('prayer-progress-section');
    const nextPrayerName = document.getElementById('next-prayer-name');
    const nextPrayerCountdown = document.getElementById('next-prayer-countdown');
    const progressBar = document.getElementById('prayer-progress-bar');

    // Timer Elements
    const timerDisplay = document.getElementById('timer-display');
    const stopFocusBtn = document.getElementById('stop-focus-btn');

    // Load state
    updateUI();

    // Polling for timer updates
    setInterval(updateUI, 1000);

    // Listeners
    prayerToggle.addEventListener('change', () => {
        chrome.storage.local.set({ prayerBlocking: prayerToggle.checked });
    });

    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    stopFocusBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "stopFocusMode" }, () => {
            updateUI();
        });
    });

    // Focus Buttons
    document.querySelectorAll('.focus-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const min = parseInt(btn.dataset.min);
            chrome.runtime.sendMessage({ action: "startFocusMode", duration: min }, () => {
                updateUI();
            });
        });
    });

    // Custom Focus Time
    document.getElementById('custom-focus-btn').addEventListener('click', () => {
        const input = document.getElementById('custom-focus-time');
        const min = parseInt(input.value);
        if (min > 0) {
            chrome.runtime.sendMessage({ action: "startFocusMode", duration: min }, () => {
                updateUI();
            });
        }
    });
});

function updateUI() {
    chrome.runtime.sendMessage({ action: "checkStatus" }, (response) => {
        if (!response) return;

        const focusOptions = document.getElementById('focus-options');
        const focusTimer = document.getElementById('focus-timer');
        const prayerToggle = document.getElementById('prayer-toggle');

        // --- Progress Bar Logic ---
        const progressSection = document.getElementById('prayer-progress-section');

        // Fetch language along with prayer times to ensure localization
        chrome.storage.local.get(['prayerTimes', 'preferredLanguage'], (data) => {
            if (data.prayerTimes) {
                const next = getNextPrayer(data.prayerTimes);
                if (next) {
                    progressSection.classList.remove('hidden');

                    // Determine Language
                    let lang = data.preferredLanguage || 'default';
                    if (lang === 'default') {
                        const uiLang = chrome.i18n.getUILanguage();
                        lang = uiLang.startsWith('ar') ? 'ar' : 'en';
                    }

                    // Get Translation
                    const strings = (typeof translations !== 'undefined') ? (translations[lang] || translations['en']) : null;
                    const prayerNameKey = next.name.toLowerCase();
                    const displayName = (strings && strings[prayerNameKey]) ? strings[prayerNameKey] : next.name;

                    // Update UI (No 'Next:' prefix per request)
                    document.getElementById('next-prayer-name').textContent = displayName;
                    document.getElementById('next-prayer-countdown').textContent = `-${formatTime(next.timeRemaining)}`;
                    document.getElementById('prayer-progress-bar').style.width = `${next.percent}%`;
                } else {
                    progressSection.classList.add('hidden');
                }
            } else {
                progressSection.classList.add('hidden');
            }
        });

        prayerToggle.checked = response.prayerBlocking;

        if (response.focusMode && response.focusTimeLeft > 0) {
            focusOptions.classList.add('hidden');
            focusTimer.classList.remove('hidden');

            const min = Math.floor(response.focusTimeLeft / 60);
            const sec = response.focusTimeLeft % 60;
            document.getElementById('timer-display').textContent =
                `${min}:${sec.toString().padStart(2, '0')}`;
        } else {
            focusOptions.classList.remove('hidden');
            focusTimer.classList.add('hidden');
        }
    });
}

function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getNextPrayer(timings) {
    const now = new Date();
    const prayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    let nextPrayer = null;
    let prevPrayerTime = null;

    // Sort/Iterate to find next
    // Timings are "HH:MM"

    // Create Date objects for today's prayers
    const prayers = prayerNames.map(name => {
        const [h, m] = timings[name].split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return { name, time: d };
    });

    // Find the first one in the future
    for (let i = 0; i < prayers.length; i++) {
        if (prayers[i].time > now) {
            nextPrayer = prayers[i];
            // Prev prayer is either the one before, or Isha from yesterday (if Fajr is next)
            // For simplicity, if Fajr is next, we can use midnight or 00:00 as start or try to get yesterday's Isha?
            // Simplification: If i=0 (Fajr), previous point is roughly now - time since midnight or just 0 progress?
            // Better: If Fajr is next, we calculate from 00:00 today.
            if (i === 0) {
                const midnight = new Date();
                midnight.setHours(0, 0, 0, 0);
                prevPrayerTime = midnight;
            } else {
                prevPrayerTime = prayers[i - 1].time;
            }
            break;
        }
    }

    // Rollover: If no next prayer today, it's Fajr tomorrow
    if (!nextPrayer) {
        // Next is Fajr Tomorrow
        const [h, m] = timings['Fajr'].split(':').map(Number);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(h, m, 0, 0);
        nextPrayer = { name: 'Fajr', time: tomorrow };

        // Prev was Isha today
        prevPrayerTime = prayers[prayers.length - 1].time;
    }

    const totalDuration = nextPrayer.time - prevPrayerTime;
    const elapsed = now - prevPrayerTime;
    const timeRemaining = nextPrayer.time - now;

    let percent = (elapsed / totalDuration) * 100;
    percent = Math.min(100, Math.max(0, percent));

    return {
        name: nextPrayer.name,
        timeRemaining: timeRemaining,
        percent: percent
    };
}
