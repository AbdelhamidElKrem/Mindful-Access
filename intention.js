// intention.js

let targetUrl = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Status (Focus Mode, Prayer Time)
    const status = await sendMessage({ action: "checkStatus" });

    // 2. Get Target URL
    const intentData = await sendMessage({ action: "getIntent" });
    targetUrl = intentData.url;

    // Setup listeners immediately
    setupListeners();

    // If we shouldn't proceed
    if (status.focusMode) {
        showStep('focus-msg');

        // Start countdown
        const countdownEl = document.getElementById('countdown');
        const updateTimer = () => {
            chrome.runtime.sendMessage({ action: "checkStatus" }, (res) => {
                if (res && res.focusMode && res.focusTimeLeft > 0) {
                    const min = Math.floor(res.focusTimeLeft / 60);
                    const sec = res.focusTimeLeft % 60;
                    countdownEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
                } else {
                    countdownEl.textContent = "0:00";
                }
            });
        };
        updateTimer();
        setInterval(updateTimer, 1000);
        return;
    }

    if (status.isPrayerTime && status.prayerBlocking) {
        showStep('prayer-msg');
        return;
    }

    if (!targetUrl) {
        console.warn("No target URL found.");
    }

    // Start Flow
    showStep('step-1');
});

function sendMessage(msg) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(msg, (response) => {
            resolve(response || {});
        });
    });
}

function showStep(id) {
    document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));

    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('active');
    }
}

function setupListeners() {
    // Step 1: Intention
    document.getElementById('q1-yes').addEventListener('click', () => {
        showStep('step-2');
    });

    document.getElementById('q1-no').addEventListener('click', () => {
        showStep('blocked-msg');
    });

    // Step 2: Work Context
    document.getElementById('q2-yes').addEventListener('click', () => {
        showStep('step-3');
    });

    document.getElementById('q2-no').addEventListener('click', () => {
        showStep('step-time');
    });

    // Step 3: Work Relevance
    document.getElementById('q3-yes').addEventListener('click', () => {
        showStep('step-time');
    });

    document.getElementById('q3-no').addEventListener('click', () => {
        showStep('blocked-msg');
    });

    // Step Time
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const minutes = btn.dataset.time;
            await grantAccess(minutes);
        });
    });

    // Custom Time
    document.getElementById('custom-time-btn').addEventListener('click', async () => {
        const input = document.getElementById('custom-time');
        const minutes = parseInt(input.value);
        if (minutes > 0) {
            await grantAccess(minutes);
        }
    });

    // Close buttons
    const closeAction = () => {
        chrome.runtime.sendMessage({ action: "closeTab" }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
            window.close();
        });
    };

    document.getElementById('close-tab').addEventListener('click', closeAction);
    document.getElementById('close-tab-focus').addEventListener('click', closeAction);
    document.getElementById('close-tab-prayer').addEventListener('click', closeAction);

    // Helper to check if current site is in the Blocked List
    const checkIsBlockedSite = async () => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['blockedSites'], (data) => {
                const list = data.blockedSites || [];
                try {
                    const hostname = new URL(targetUrl).hostname;
                    // Check if hostname contains any of the blocked domains
                    // e.g. "www.youtube.com" contains "youtube.com"
                    const isBlocked = list.some(site => hostname.includes(site));
                    resolve(isBlocked);
                } catch (e) {
                    resolve(false);
                }
            });
        });
    };

    const handleBypass = async () => {
        const isBlocked = await checkIsBlockedSite();
        if (isBlocked) {
            // It's a "DNS" blocked site -> Force Questions
            showStep('step-1');
        } else {
            // It's just a random site blocked by Focus Mode -> Direct Unlimited Access
            grantAccess(1440);
        }
    };

    document.getElementById('prayer-bypass').addEventListener('click', handleBypass);

    // Focus Emergency Bypass
    const focusBypassBtn = document.getElementById('focus-bypass');
    if (focusBypassBtn) {
        focusBypassBtn.addEventListener('click', handleBypass);
    }
}

async function grantAccess(minutes) {
    if (targetUrl) {
        chrome.runtime.sendMessage({
            action: "grantAccess",
            url: targetUrl,
            duration: minutes
        });

        setTimeout(() => {
            window.location.href = targetUrl;
        }, 500);
    } else {
        alert(chrome.i18n.getMessage("errorUrl") || "Error: Unknown target URL.");
    }
}
