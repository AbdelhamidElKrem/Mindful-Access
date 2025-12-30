// Background Service Worker

// State
let navigationIntent = {}; // tabId -> targetUrl

// Strict Rule IDs
const RULE_ID_FOCUS = 29999;
const RULE_ID_PRAYER = 29998;

// Initialize state on install
chrome.runtime.onInstalled.addListener(() => {
    console.log("Mindful Access installed.");

    const defaultSites = ['youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com'];

    chrome.storage.local.set({
        focusMode: false,
        prayerBlocking: true,
        blockedSites: defaultSites
    });

    // Initialize Dynamic Rules for blocking
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
    const destination = chrome.runtime.getURL("intention.html");
    // Escape domain for regex
    const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        id: id,
        priority: 1,
        action: {
            type: "redirect",
            redirect: { regexSubstitution: `${destination}?origin=\\1` }
        },
        condition: {
            // Match http/https + domain + optional path
            regexFilter: `^(https?://(?:[^/]+\\.)?${escapedDomain}/.*)$`,
            resourceTypes: ["main_frame"]
        }
    };
}

function createStrictRule(id) {
    const destination = chrome.runtime.getURL("intention.html");
    return {
        id: id,
        priority: 50,
        action: {
            type: "redirect",
            redirect: { regexSubstitution: `${destination}?origin=\\1` }
        },
        condition: {
            regexFilter: "^(https?://.*)$", // Capture the full URL
            resourceTypes: ["main_frame"],
            excludedRequestDomains: ["api.aladhan.com", chrome.runtime.id] // Don't redirect extension itself or API
        }
    };
}

// Track navigation to know where the user wanted to go
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) { // Main frame only
        if (!details.url.includes("intention.html")) {
            // console.log(`Tracking navigation for tab ${details.tabId}: ${details.url}`);
            navigationIntent[details.tabId] = details.url;
        }
    }
});

// Clean up
chrome.tabs.onRemoved.addListener((tabId) => {
    delete navigationIntent[tabId];
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startFocusMode") {
        startFocusMode(message.duration, sendResponse);
        return true;
    } else if (message.action === "stopFocusMode") {
        stopFocusMode(sendResponse);
        return true;
    } else if (message.action === "grantAccess") {
        handleGrantAccess(message.url, message.duration);
    } else if (message.action === "checkStatus") {
        checkStatus(sender.tab ? sender.tab.id : null, sendResponse);
        return true; // async result
    } else if (message.action === "getIntent") {
        const tabId = sender.tab ? sender.tab.id : null;
        const url = navigationIntent[tabId];
        sendResponse({ url: url });
        return false;
    } else if (message.action === "updatePrayerTimes") {
        updatePrayerTimes();
    } else if (message.action === "closeTab") {
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
            // Fallback: Query active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    removeTab(tabs[0].id);
                }
            });
        }
    }
});

function startFocusMode(minutes, sendResponse) {
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

        if (sendResponse) sendResponse({ success: true });
    });
}

function stopFocusMode(sendResponse) {
    chrome.storage.local.set({
        focusMode: false,
        focusEndTime: null
    }, () => {
        // Remove Strict Rule
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_ID_FOCUS]
        });
        chrome.alarms.clear("focusEnd");
        if (sendResponse) sendResponse({ success: true });
    });
}

function handleGrantAccess(url, durationMinutes) {
    if (!url) return;

    try {
        const domain = new URL(url).hostname;
        const ruleId = Math.hash(domain);

        const rule = {
            id: ruleId,
            priority: 100, // Exception Priority
            action: { type: "allow" },
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
            const alarmName = `block|${domain}`;
            chrome.alarms.create(alarmName, { delayInMinutes: parseFloat(durationMinutes) });
        });
    } catch (e) {
        console.error("Invalid URL for grantAccess:", url);
    }
}

importScripts('libs/adhan.min.js');

// Prayer Time Logic
let prayerTimes = null;

function updatePrayerTimes() {
    chrome.storage.local.get(['city', 'country', 'useGps', 'latitude', 'longitude', 'calculationMethod'], (data) => {
        const methodValue = data.calculationMethod || 3; // Default MWL
        const date = new Date();
        const dateStr = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

        // Helper: Calculate times using Adhan.js
        const calculateTimes = (lat, lng) => {
            try {
                const coordinates = new adhan.Coordinates(lat, lng);
                let params = adhan.CalculationMethod.MuslimWorldLeague(); // Default fallback

                // Map methodValue to Adhan method if possible, or just switch
                // 3 is MWL in Aladhan. Adhan.js has specific methods.
                // We'll use a simple mapping or default to MWL for now. 
                // Detailed mapping can be added if we know the ID mapping.
                // Assuming 3=MWL (MuslimWorldLeague), 2=ISNA (NorthAmerica), 4=Makkah, 5=Egyptian

                switch (methodValue) {
                    case 1: params = adhan.CalculationMethod.Karachi(); break; // Jafari/Karachi often 1
                    case 2: params = adhan.CalculationMethod.NorthAmerica(); break; // ISNA
                    case 3: params = adhan.CalculationMethod.MuslimWorldLeague(); break; // MWL
                    case 4: params = adhan.CalculationMethod.UmmAlQura(); break; // Makkah
                    case 5: params = adhan.CalculationMethod.Egyptian(); break; // Egyptian
                    case 8: params = adhan.CalculationMethod.Gulf(); break; // Gulf
                    case 12: params = adhan.CalculationMethod.France(); break; // France
                    case 13: params = adhan.CalculationMethod.Turkey(); break; // Turkey
                    // Add more if needed, default MWL
                }

                const prayerTimesObj = new adhan.PrayerTimes(coordinates, date, params);



                // Formatting times using Intl.DateTimeFormat
                const formatTime = (d) => {
                    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                };

                const times = {
                    Fajr: formatTime(prayerTimesObj.fajr),
                    Dhuhr: formatTime(prayerTimesObj.dhuhr),
                    Asr: formatTime(prayerTimesObj.asr),
                    Maghrib: formatTime(prayerTimesObj.maghrib),
                    Isha: formatTime(prayerTimesObj.isha)
                };

                prayerTimes = times;
                console.log("Calculated Prayer Times:", times);
                chrome.storage.local.set({ prayerTimes: times, lastFetch: dateStr, lastMethod: methodValue });

            } catch (e) {
                console.error("Calculation Error:", e);
            }
        };

        if (data.latitude && data.longitude) {
            console.log("Using stored coordinates for calculation.");
            calculateTimes(data.latitude, data.longitude);
        } else if (data.city && data.country && !data.useGps) {
            console.log("No coordinates. Geocoding city:", data.city);
            // Geocode using Nominatim (OpenStreetMap)
            const query = `${data.city}, ${data.country}`;
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(geoData => {
                    if (geoData && geoData.length > 0) {
                        const lat = parseFloat(geoData[0].lat);
                        const lon = parseFloat(geoData[0].lon);
                        console.log("Geocoded:", lat, lon);

                        // Save coords so we don't geocode next time
                        chrome.storage.local.set({ latitude: lat, longitude: lon }, () => {
                            calculateTimes(lat, lon);
                        });
                    } else {
                        console.error("Geocoding failed: City not found.");
                        prayerTimes = null; // Clear to indicate error
                        chrome.storage.local.remove('prayerTimes');
                    }
                })
                .catch(e => console.error("Geocoding network error:", e));
        } else {
            console.log("No location set.");
        }
    });
}

// Helper to get duration
// We'll read it in checkPrayerBlockingTick

function isDuringPrayerTime(customDuration = 20) {
    if (!prayerTimes) return false;

    const now = new Date();
    const headers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    for (const name of headers) {
        const timeStr = prayerTimes[name]; // "HH:MM"
        if (!timeStr) continue;

        const [hours, minutes] = timeStr.split(':').map(Number);
        const prayerDate = new Date();
        prayerDate.setHours(hours, minutes, 0, 0);

        const diffMs = now - prayerDate;
        const diffMins = diffMs / 60000;

        // Active if 0 <= diff <= customDuration
        if (diffMins >= 0 && diffMins <= customDuration) {
            return name;
        }
    }
    return false;
}

// Initial fetch or load
chrome.storage.local.get(['prayerTimes', 'lastFetch'], (data) => {
    const today = new Date();
    const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    if (data.prayerTimes && data.lastFetch === dateStr) {
        prayerTimes = data.prayerTimes;
    } else {
        updatePrayerTimes();
    }
});

// Update daily
chrome.alarms.create("fetchPrayerTimes", { periodInMinutes: 60 * 12 });
// Update blocking status every minute
chrome.alarms.create("prayerTicker", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "fetchPrayerTimes") {
        updatePrayerTimes();
    } else if (alarm.name === "focusEnd") {
        stopFocusMode();
    } else if (alarm.name === "prayerTicker") {
        checkPrayerBlockingTick();
        checkPrayerNotification();
    } else if (alarm.name.startsWith("block|")) {
        const domain = alarm.name.split("|")[1];
        const ruleId = Math.hash(domain);

        // Remove the Allow Rule
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [ruleId]
        }, () => {
            // Force Reload Tabs
            const patterns = [`*://${domain}/*`, `*://*.${domain}/*`];
            chrome.tabs.query({ url: patterns }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.reload(tab.id, () => {
                        if (chrome.runtime.lastError) { /* ignore */ }
                    });
                });
            });
        });
    }
});

// Notification Logic
let lastNotifiedPrayer = null;

function checkPrayerNotification() {
    if (!prayerTimes) return;

    const now = new Date();
    const headers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

    for (const name of headers) {
        const timeStr = prayerTimes[name]; // "HH:MM"
        if (!timeStr) continue;

        const [hours, minutes] = timeStr.split(':').map(val => parseInt(val));
        const prayerDate = new Date();
        prayerDate.setHours(hours, minutes, 0, 0);

        const diffMs = prayerDate - now;
        const diffMins = diffMs / 60000;

        // Notify if 5 minutes remaining (range 4-6 to be safe with ticker)
        if (diffMins > 4 && diffMins <= 6) {
            const key = `${name}-${new Date().toDateString()}`;
            if (lastNotifiedPrayer !== key) {
                console.log(`Sending notification for ${name}`);

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Prayer Time Approaching',
                    message: `${name} will start in 5 minutes. Prepare yourself.`,
                    priority: 2,
                    requireInteraction: true
                });

                lastNotifiedPrayer = key;
            }
        }
    }
}

function checkPrayerBlockingTick() {
    chrome.storage.local.get(['prayerBlocking', 'prayerDuration'], (data) => {
        if (!data.prayerBlocking) {
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID_PRAYER] });
            return;
        }

        const duration = parseInt(data.prayerDuration) || 20;
        const prayerName = isDuringPrayerTime(duration);

        if (prayerName) {
            // Ensure rule is ADDED
            chrome.declarativeNetRequest.getDynamicRules(oldRules => {
                const hasRule = oldRules.some(r => r.id === RULE_ID_PRAYER);
                if (!hasRule) {
                    chrome.declarativeNetRequest.updateDynamicRules({
                        addRules: [createStrictRule(RULE_ID_PRAYER)]
                    });
                }
            });
        } else {
            // Remove rule
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [RULE_ID_PRAYER]
            });
        }
    });
}

function checkStatus(tabId, sendResponse) {
    chrome.storage.local.get(['focusMode', 'prayerBlocking', 'focusEndTime'], (data) => {
        const prayerName = isDuringPrayerTime();
        // Strict blocking is handled by alarms/DNR, but we still report status for UI
        const blockingActive = data.prayerBlocking && !!prayerName;

        let timeLeft = 0;
        if (data.focusMode && data.focusEndTime) {
            timeLeft = Math.max(0, Math.ceil((data.focusEndTime - Date.now()) / 1000));
            if (timeLeft === 0) {
                // If alarm missed, cleanup
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

// Simple hash
Math.hash = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 29000) + 1000;
}
