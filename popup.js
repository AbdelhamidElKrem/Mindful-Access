// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const focusOptions = document.getElementById('focus-options');
    const focusTimer = document.getElementById('focus-timer');
    const prayerToggle = document.getElementById('prayer-toggle');
    const optionsBtn = document.getElementById('options-btn');

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
});

function updateUI() {
    chrome.runtime.sendMessage({ action: "checkStatus" }, (response) => {
        if (!response) return;

        const focusOptions = document.getElementById('focus-options');
        const focusTimer = document.getElementById('focus-timer');
        const prayerToggle = document.getElementById('prayer-toggle');

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
