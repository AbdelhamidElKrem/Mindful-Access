// intention.js

let targetUrl = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Get Status (Focus Mode, Prayer Time)
    const status = await sendMessage({ action: "checkStatus" });

    // 2. Get Target URL
    const intentData = await sendMessage({ action: "getIntent" });
    targetUrl = intentData.url;

    // Setup listeners immediately so buttons work even if we return early
    setupListeners();

    // If we shouldn't proceed
    if (status.focusMode) {
        showStep('focus-msg');
        return;
    }

    if (status.isPrayerTime && status.prayerBlocking) {
        showStep('prayer-msg');
        // We return here, but listener for bypass will handle continuation
        return;
    }

    if (!targetUrl) {
        // Fallback or development testing
        console.warn("No target URL found.");
        // We might want to just show the first step anyway for testing
    }

    // We proceed to show Step 1 regardless, 
    // but if targetUrl is missing, grantAccess won't work (alert user).

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
        showStep('step-time'); // Not work time, so just go to time limit
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

    // Close buttons
    // Use background script to ensure tab closure works reliably
    // Also try direct close
    const closeAction = () => {
        chrome.runtime.sendMessage({ action: "closeTab" }, () => {
            // Check lastError to suppress "message port closed" or similar
            if (chrome.runtime.lastError) {
                console.log("Close tab message error (harmless):", chrome.runtime.lastError.message);
            }
            // Fallback for popup context or if background removal delayed
            window.close();
        });
    };

    document.getElementById('close-tab').addEventListener('click', closeAction);
    document.getElementById('close-tab-focus').addEventListener('click', closeAction);
    document.getElementById('close-tab-prayer').addEventListener('click', closeAction);

    document.getElementById('prayer-bypass').addEventListener('click', () => {
        showStep('step-1');
    });
}

async function grantAccess(minutes) {
    if (targetUrl) {
        chrome.runtime.sendMessage({
            action: "grantAccess",
            url: targetUrl,
            duration: minutes
        });

        // Redirect back to the target URL
        // We need to wait a bit for the rule to apply? 
        // DNR is fast, but async.
        // Let's give it 500ms
        setTimeout(() => {
            window.location.href = targetUrl;
        }, 500);
    } else {
        alert(chrome.i18n.getMessage("errorUrl") || "Error: Unknown target URL.");
    }
}
