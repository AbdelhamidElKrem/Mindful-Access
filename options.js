// options.js

document.addEventListener('DOMContentLoaded', () => {
    loadSites();
    loadLocation();
    loadLanguage();

    document.getElementById('add-btn').addEventListener('click', addSite);
    document.getElementById('save-loc-btn').addEventListener('click', saveLocation);
    document.getElementById('gps-btn').addEventListener('click', useGps);
    document.getElementById('lang-select').addEventListener('change', saveLanguage);
});

function loadSites() {
    chrome.storage.local.get(['blockedSites'], (data) => {
        const list = document.getElementById('site-list');
        list.innerHTML = '';
        const sites = data.blockedSites || [];

        sites.forEach(site => {
            const li = document.createElement('li');
            const removeText = chrome.i18n.getMessage("remove") || "Remove";
            li.innerHTML = `
                <span>${site}</span>
                <button class="delete" data-site="${site}">${removeText}</button>
            `;
            list.appendChild(li);
        });

        // Add delete listeners
        document.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                removeSite(e.target.dataset.site);
            });
        });
    });
}

function addSite() {
    const input = document.getElementById('new-site');
    const site = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!site) return;

    chrome.storage.local.get(['blockedSites'], (data) => {
        const sites = data.blockedSites || [];
        if (!sites.includes(site)) {
            sites.push(site);

            // Save storage and update rules
            chrome.storage.local.set({ blockedSites: sites }, () => {
                addBlockRule(site);
                input.value = '';
                loadSites();
            });
        }
    });
}

function removeSite(site) {
    chrome.storage.local.get(['blockedSites'], (data) => {
        let sites = data.blockedSites || [];
        sites = sites.filter(s => s !== site);

        chrome.storage.local.set({ blockedSites: sites }, () => {
            removeBlockRule(site);
            loadSites();
        });
    });
}

function addBlockRule(domain) {
    const id = Math.hash(domain);
    const rule = {
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

    chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [rule]
    });
}

function removeBlockRule(domain) {
    const id = Math.hash(domain);
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [id]
    });
}

// New Settings Logic

function loadLanguage() {
    chrome.storage.local.get(['preferredLanguage'], (data) => {
        const select = document.getElementById('lang-select');
        select.value = data.preferredLanguage || 'default';
    });
}

function saveLanguage() {
    const lang = document.getElementById('lang-select').value;
    chrome.storage.local.set({ preferredLanguage: lang }, () => {
        // Reload page to apply changes
        window.location.reload();
    });
}

function loadLocation() {
    chrome.storage.local.get(['city', 'country', 'latitude', 'longitude', 'useGps'], (data) => {
        if (data.city) document.getElementById('city').value = data.city;
        if (data.country) document.getElementById('country').value = data.country;

        const status = document.getElementById('loc-status');
        if (data.useGps && data.latitude) {
            status.textContent = `Using GPS: ${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
        }
    });
}

function saveLocation() {
    const city = document.getElementById('city').value.trim();
    const country = document.getElementById('country').value.trim();

    chrome.storage.local.set({ city, country, useGps: false }, () => {
        const status = document.getElementById('loc-status');
        status.textContent = chrome.i18n.getMessage("locSaved") || "Location saved.";
        setTimeout(() => status.textContent = '', 2000);

        chrome.runtime.sendMessage({ action: "updatePrayerTimes" });
    });
}

function useGps() {
    const status = document.getElementById('loc-status');
    status.textContent = "Locating...";

    if (!navigator.geolocation) {
        status.textContent = "Geolocation not supported";
        return;
    }

    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        chrome.storage.local.set({
            latitude: lat,
            longitude: lng,
            useGps: true
        }, () => {
            status.textContent = `GPS Connected: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
            chrome.runtime.sendMessage({ action: "updatePrayerTimes" });
        });
    }, error => {
        status.textContent = "GPS Error: " + error.message;
        console.error(error);
    });
}

// Ensure hash function matches background.js
Math.hash = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 29000) + 1000;
}
