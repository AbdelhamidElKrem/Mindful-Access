// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const focusToggle = document.getElementById('focus-toggle');
    const prayerToggle = document.getElementById('prayer-toggle');
    const optionsBtn = document.getElementById('options-btn');

    // Load state
    chrome.storage.local.get(['focusMode', 'prayerBlocking'], (data) => {
        focusToggle.checked = data.focusMode || false;
        prayerToggle.checked = data.prayerBlocking !== false; // Default true
    });

    // Listeners
    focusToggle.addEventListener('change', () => {
        chrome.storage.local.set({ focusMode: focusToggle.checked });
    });

    prayerToggle.addEventListener('change', () => {
        chrome.storage.local.set({ prayerBlocking: prayerToggle.checked });
    });

    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});
