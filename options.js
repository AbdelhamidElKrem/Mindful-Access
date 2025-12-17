// options.js

document.addEventListener('DOMContentLoaded', () => {
    loadSites();
    loadLocation();
    loadLanguage();

    document.getElementById('add-btn').addEventListener('click', addSite);
    document.getElementById('save-loc-btn').addEventListener('click', saveLocation);
    document.getElementById('gps-btn').addEventListener('click', useGps);
    document.getElementById('lang-select').addEventListener('change', saveLanguage);
    document.getElementById('prayer-blocking-toggle').addEventListener('change', togglePrayerBlocking);

    // Load Prayer Blocking State
    chrome.storage.local.get(['prayerBlocking'], (data) => {
        document.getElementById('prayer-blocking-toggle').checked = data.prayerBlocking !== false;
    });
});

function togglePrayerBlocking(e) {
    chrome.storage.local.set({ prayerBlocking: e.target.checked });
}

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
    chrome.storage.local.get(['city', 'country', 'latitude', 'longitude', 'useGps', 'prayerTimes'], (data) => {
        const cityInput = document.getElementById('city');
        const countryInput = document.getElementById('country');

        if (cityInput && data.city) cityInput.value = data.city;
        if (countryInput && data.country) countryInput.value = data.country;

        const status = document.getElementById('loc-status');
        if (data.useGps && data.latitude) {
            status.textContent = `GPS Active: ${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
            status.style.color = 'var(--success-color)'; // Or primary
        }

        // If we have prayer times, show the table immediately
        if (data.prayerTimes) {
            displayPrayerTable(data.prayerTimes);
        }
    });
}

function saveLocation() {
    const cityInput = document.getElementById('city');
    const countryInput = document.getElementById('country');
    const status = document.getElementById('loc-status');

    if (!cityInput || !countryInput) {
        // If inputs are hidden/removed, we can't save manual location this way
        status.textContent = "Manual entry invalid or hidden.";
        return;
    }

    const city = cityInput.value.trim();
    const country = countryInput.value.trim();

    if (!city || !country) {
        status.textContent = "Please enter both City and Country.";
        status.style.color = '#d63031';
        return;
    }

    status.textContent = "Saving...";

    // Reverse Geocoding or just API fetch would happen in background usually,
    // but here we just notify background to update.
    chrome.storage.local.set({ city, country, useGps: false }, () => {
        chrome.runtime.sendMessage({ action: "updatePrayerTimes" }, (response) => {
            // We can listen for the storage change or just wait a bit, 
            // but let's try to fetch immediately for UI feedback if possible?
            // Actually better to wait for background.
            // Simulating 'Saved' then reloading times.
            status.textContent = "Location Saved. Updating times...";
            status.style.color = 'var(--primary-color)';

            // Give background a moment to fetch
            setTimeout(() => {
                chrome.storage.local.get(['prayerTimes'], (d) => {
                    if (d.prayerTimes) displayPrayerTable(d.prayerTimes);
                    status.textContent = "Times Updated.";
                });
            }, 2000);
        });
    });
}

function useGps() {
    const status = document.getElementById('loc-status');
    status.textContent = "Locating...";
    status.style.color = 'var(--accent-color)';

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
            status.textContent = `GPS found. Fetching times...`;

            // Trigger background update
            chrome.runtime.sendMessage({ action: "updatePrayerTimes" });

            // Poll for result
            setTimeout(() => {
                chrome.storage.local.get(['prayerTimes', 'city', 'country'], (d) => {
                    if (d.city) document.getElementById('city').value = d.city; // If background reverse geocoded
                    if (d.country) document.getElementById('country').value = d.country;
                    if (d.prayerTimes) {
                        displayPrayerTable(d.prayerTimes);
                        status.textContent = "Prayer Times Updated Successfully.";
                        status.style.color = 'var(--primary-color)';
                    }
                });
            }, 2500);
        });
    }, error => {
        status.textContent = "GPS Error: " + error.message;
        status.style.color = '#d63031';
        console.error(error);
    });
}

function displayPrayerTable(timings) {
    const container = document.getElementById('prayer-table-container');
    const tbody = document.getElementById('prayer-table-body');

    if (!timings) return;

    // Simple check: is timings object valid?
    if (!timings.Fajr) return;

    tbody.innerHTML = `
        <tr>
            <td>${timings.Fajr}</td>
            <td>${timings.Dhuhr}</td>
            <td>${timings.Asr}</td>
            <td>${timings.Maghrib}</td>
            <td>${timings.Isha}</td>
        </tr>
    `;

    container.style.display = 'block';
    container.classList.add('fade-in'); // simple class if we want animation
}

// Ensure hash function matches background.js
Math.hash = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 29000) + 1000;
}
