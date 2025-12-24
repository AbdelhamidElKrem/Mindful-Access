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

                    // Update UI
                    document.getElementById('next-prayer-name').textContent = displayName;

                    if (next.isCurrent) {
                        // Showing current prayer + elapsed
                        document.getElementById('next-prayer-countdown').textContent = `+${formatTime(next.timeDiff)}`;
                        document.getElementById('prayer-progress-bar').style.width = '100%';
                    } else {
                        // Showing next prayer - remaining
                        document.getElementById('next-prayer-countdown').textContent = `-${formatTime(next.timeDiff)}`;
                        document.getElementById('prayer-progress-bar').style.width = `${next.percent}%`;
                    }

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
    let prevPrayer = null; // Object { name, time }

    // Create Date objects for today's prayers
    const prayers = prayerNames.map(name => {
        const [h, m] = timings[name].split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return { name, time: d };
    });

    // Find the first one in the future, and identify immediate previous
    for (let i = 0; i < prayers.length; i++) {
        if (prayers[i].time > now) {
            nextPrayer = prayers[i];

            if (i === 0) {
                // If Fajr is next, previous "prayer" conceptually was Isha yesterday.
                // But for the +20min rule, we only care if we are literally 20 mins after THAT.
                // Construct yesterday's Isha
                const [hIsha, mIsha] = timings['Isha'].split(':').map(Number);
                const prev = new Date();
                prev.setDate(prev.getDate() - 1);
                prev.setHours(hIsha, mIsha, 0, 0);
                prevPrayer = { name: 'Isha', time: prev };
            } else {
                prevPrayer = prayers[i - 1];
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
        prevPrayer = prayers[prayers.length - 1];
    }

    // --- CHECK 20 MINUTE RULE ---
    // If we are within 20 minutes of the previous prayer start time
    if (prevPrayer) {
        const diffSincePrev = now - prevPrayer.time;
        // 20 minutes in ms = 20 * 60 * 1000 = 1,200,000
        if (diffSincePrev >= 0 && diffSincePrev <= 20 * 60 * 1000) {
            return {
                name: prevPrayer.name,
                isCurrent: true,
                timeDiff: diffSincePrev, // Elapsed time
                percent: 100 // Bar full
            };
        }
    }

    // Standard "Next Prayer" Logic
    const prevPrayerTimeCtx = prevPrayer ? prevPrayer.time : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); // Fallback to midnight if somehow null (shouldn't be)

    const totalDuration = nextPrayer.time - prevPrayerTimeCtx;
    const elapsed = now - prevPrayerTimeCtx;
    const timeRemaining = nextPrayer.time - now;

    let percent = (elapsed / totalDuration) * 100;
    percent = Math.min(100, Math.max(0, percent));

    return {
        name: nextPrayer.name,
        isCurrent: false,
        timeDiff: timeRemaining, // Remaining time
        percent: percent
    };
}
