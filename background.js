// Background Service Worker

// State
let navigationIntent = {}; // tabId -> targetUrl

// Initialize state on install
chrome.runtime.onInstalled.addListener(() => {
    console.log("Taqwa Timekeeper installed.");

    const defaultSites = ['youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com'];

    chrome.storage.local.set({
        focusMode: false,
        prayerBlocking: true,
        blockedSites: defaultSites
    });

    // Initialize Dynamic Rules for blocking
    // We first clear existing just in case (e.g. reinstall/update)
    chrome.declarativeNetRequest.getDynamicRules(rules => {
        const ids = rules.map(r => r.id);
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ids
        }, () => {
            // Add defaults
            const newRules = defaultSites.map(site => createBlockRule(site));
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules: newRules
            });
        });
    });
});

function createBlockRule(domain) {
    const id = Math.hash(domain);
    return {
        id: id,
        priority: 1,
        action: {
            type: "redirect",
            redirect: { extensionPath: "/intention.html" }
        },
        condition: {
            urlFilter: domain,
            resourceTypes: ["main_frame"]
        }
    };
}


// Track navigation to know where the user wanted to go
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) { // Main frame only
        if (!details.url.includes("intention.html")) {
            console.log(`Tracking navigation for tab ${details.tabId}: ${details.url}`);
            navigationIntent[details.tabId] = details.url;
        }
    }
});

// Clean up
chrome.tabs.onRemoved.addListener((tabId) => {
    delete navigationIntent[tabId];
});

// Strict Rule IDs
const RULE_ID_FOCUS = 29999;
const RULE_ID_PRAYER = 29998;

function createStrictRule(id) {
    return {
        id: id,
        priority: 50, // Higher than default (1), lower than exception (100)
        action: {
            type: "redirect",
            redirect: { extensionPath: "/intention.html" }
        },
        condition: {
            urlFilter: "*", // Block everything
            resourceTypes: ["main_frame"],
            excludedRequestDomains: ["api.aladhan.com"] // Allow API
        }
    };
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startFocusMode") {
        startFocusMode(message.duration);
    } else if (message.action === "stopFocusMode") {
        stopFocusMode();
    } else if (message.action === "grantAccess") {
        handleGrantAccess(message.url, message.duration);
    } else if (message.action === "checkStatus") {
        checkStatus(sender.tab ? sender.tab.id : null, sendResponse);
        return true; // async result
    } else if (message.action === "getIntent") {
        // ... existing getIntent logic matches ...
        const tabId = sender.tab ? sender.tab.id : null;
        const url = navigationIntent[tabId];
        sendResponse({ url: url });
        return false;
    } else if (message.action === "updatePrayerTimes") {
        updatePrayerTimes();
    } else if (message.action === "closeTab") {
        // ... existing closeTab logic ...
        const removeTab = (tabId) => {
            chrome.tabs.remove(tabId, () => {
                if (chrome.runtime.lastError) {
                    console.log("Tab already closed or invalid:", chrome.runtime.lastError.message);
                }
            });
        };

        if (sender.tab) {
            removeTab(sender.tab.id);
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    removeTab(tabs[0].id);
                }
            });
        }
    }
});

function startFocusMode(minutes) {
    const durationMs = minutes * 60 * 1000;
    const endTime = Date.now() + durationMs;

    chrome.storage.local.set({
        focusMode: true,
        focusEndTime: endTime
    }, () => {
        // Add Strict Rule
        chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [createStrictRule(RULE_ID_FOCUS)]
        });

        // Set Alarm
        chrome.alarms.create("focusEnd", { when: endTime });
    });
}

function stopFocusMode() {
    chrome.storage.local.set({
        focusMode: false,
        focusEndTime: null
    }, () => {
        // Remove Strict Rule
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_ID_FOCUS]
        });
        chrome.alarms.clear("focusEnd");
    });
}

function checkStatus(tabId, sendResponse) {
    chrome.storage.local.get(['focusMode', 'prayerBlocking', 'focusEndTime'], (data) => {
        const prayerName = isDuringPrayerTime();
        const blockingActive = data.prayerBlocking && !!prayerName;

        let timeLeft = 0;
        if (data.focusMode && data.focusEndTime) {
            timeLeft = Math.max(0, Math.ceil((data.focusEndTime - Date.now()) / 1000));
            if (timeLeft === 0) {
                // Should have stopped, but in case alarm didn't fire yet
                stopFocusMode();
            }
        }

        sendResponse({
            focusMode: data.focusMode,
            focusTimeLeft: timeLeft,
            prayerBlocking: data.prayerBlocking,
            isPrayerTime: blockingActive,
            prayerName: prayerName
        });
    });
}

function handleGrantAccess(url, durationMinutes) {
    if (!url) return;

    try {
        const domain = new URL(url).hostname;
        // We need a unique ID for the rule. 
        // In production, manage IDs carefully. Here we use a hash.
        const ruleId = Math.hash(domain);

        const rule = {
            id: ruleId,
            priority: 100,
            action: {
                type: "allow"
            },
            condition: {
                urlFilter: domain,
                resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "image", "stylesheet", "media", "websocket", "other"]
            }
        };

        chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule],
            removeRuleIds: [ruleId]
        }, () => {
            console.log(`Access granted to ${domain} for ${durationMinutes} minutes.`);

            // Set an alarm with domain in name (safer for retrieval)
            // Name format: block|domain.com
            const alarmName = `block|${domain}`;
            chrome.alarms.create(alarmName, { delayInMinutes: parseFloat(durationMinutes) });
        });
    } catch (e) {
        console.error("Invalid URL for grantAccess:", url);
    }
}


// Prayer Time Logic
let prayerTimes = null;


function updatePrayerTimes() {
    chrome.storage.local.get(['city', 'country', 'useGps', 'latitude', 'longitude'], (data) => {
        let apiUrl = '';

        if (data.useGps && data.latitude && data.longitude) {
            console.log(`Fetching prayer times using GPS: ${data.latitude}, ${data.longitude}`);
            apiUrl = `http://api.aladhan.com/v1/timings?latitude=${data.latitude}&longitude=${data.longitude}&method=2`;
        } else if (data.city && data.country) {
            console.log(`Fetching prayer times using City: ${data.city}, ${data.country}`);
            apiUrl = `http://api.aladhan.com/v1/timingsByCity?city=${data.city}&country=${data.country}&method=2`;
        } else {
            console.log("No location set for prayer times.");
            return;
        }

        const date = new Date();
        const dateStr = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

        // Append date? Aladhan handles "today" by default on these endpoints usually, or we pass timestamp.
        // timingsByCity takes date parameter in path or query?
        // Actually /v1/timings/DATE is better for lat/long. 
        // /v1/timingsByCity also accepts date param.
        // Let's rely on default 'today' logic of the API which happens if no date specified? 
        // Docs say /v1/timings returns today if date is missing? Not sure.
        // Let's be explicit and use timestamp if possible or just the 'timings' endpoint which defaults to today.

        // Correction: /v1/timings defaults to today timestamp.

        fetch(apiUrl)
            .then(response => response.json())
            .then(json => {
                if (json.code === 200) {
                    prayerTimes = json.data.timings;
                    console.log("Prayer times updated:", prayerTimes);
                    chrome.storage.local.set({ cachedPrayerTimes: prayerTimes, lastFetch: dateStr });
                }
            })
            .catch(err => console.error("Error fetching prayer times:", err));
    });
}

function isDuringPrayerTime() {
    if (!prayerTimes) return false;

    const now = new Date();
    const headers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    // Simple check: if current time is within 20 mins of any prayer time
    for (const name of headers) {
        const timeStr = prayerTimes[name]; // "HH:MM"
        if (!timeStr) continue;

        const [hours, minutes] = timeStr.split(':').map(Number);
        const prayerDate = new Date();
        prayerDate.setHours(hours, minutes, 0, 0);

        const diffMs = now - prayerDate;
        const diffMins = diffMs / 60000;

        // Active if 0 <= diff <= 20
        if (diffMins >= 0 && diffMins <= 20) {
            return name; // Return name of prayer (truthy)
        }
    }
    return false;
}

// Initial fetch or load
chrome.storage.local.get(['cachedPrayerTimes', 'lastFetch'], (data) => {
    const today = new Date();
    const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    if (data.cachedPrayerTimes && data.lastFetch === dateStr) {
        prayerTimes = data.cachedPrayerTimes;
    } else {
        updatePrayerTimes();
    }
});

// Update daily
chrome.alarms.create("fetchPrayerTimes", { periodInMinutes: 60 * 12 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "fetchPrayerTimes") {
        updatePrayerTimes();
    } else if (alarm.name.startsWith("block|")) {
        const domain = alarm.name.split("|")[1];
        const ruleId = Math.hash(domain);

        console.log(`Timer expired for ${domain}. Removing access.`);

        // 1. Remove the Allow Rule
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [ruleId]
        }, () => {
            console.log(`Access revoked for rule ${ruleId} (${domain})`);

            // 2. Force Reload Tabs to trigger the Block
            // Pattern to match domain and subdomains
            const patterns = [`*://${domain}/*`, `*://*.${domain}/*`];

            chrome.tabs.query({ url: patterns }, (tabs) => {
                tabs.forEach(tab => {
                    console.log(`Reloading tab ${tab.id} to enforce block.`);
                    chrome.tabs.reload(tab.id, () => {
                        if (chrome.runtime.lastError) {
                            console.log("Error reloading tab:", chrome.runtime.lastError.message);
                        }
                    });
                });
            });
        });
    }
});

function checkStatus(tabId, sendResponse) {
    chrome.storage.local.get(['focusMode', 'prayerBlocking'], (data) => {
        const prayerName = isDuringPrayerTime();
        const blockingActive = data.prayerBlocking && !!prayerName;

        sendResponse({
            focusMode: data.focusMode,
            prayerBlocking: data.prayerBlocking,
            isPrayerTime: blockingActive,
            prayerName: prayerName
        });
    });
}

// Simple hash for rule IDs (1-30000 range to be safe-ish for small sets)
Math.hash = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 29000) + 1000;
}
