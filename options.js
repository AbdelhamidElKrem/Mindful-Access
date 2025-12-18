// options.js

document.addEventListener('DOMContentLoaded', () => {
    loadSites();
    loadLocation();
    loadLanguage();

    // Event Listeners
    document.getElementById('add-btn').addEventListener('click', addSite);
    document.getElementById('save-loc-btn').addEventListener('click', saveLocation);
    document.getElementById('gps-btn').addEventListener('click', useGps);
    document.getElementById('lang-select').addEventListener('change', saveLanguage);
    document.getElementById('prayer-blocking-toggle').addEventListener('change', togglePrayerBlocking);
    const durationInput = document.getElementById('prayer-duration');
    if (durationInput) {
        durationInput.addEventListener('change', saveDuration);
    }

    // Load Prayer Blocking State & Duration
    chrome.storage.local.get(['prayerBlocking', 'prayerDuration'], (data) => {
        const toggle = document.getElementById('prayer-blocking-toggle');

        if (toggle) {
            toggle.checked = data.prayerBlocking !== false;
        }
        if (durationInput) {
            durationInput.value = data.prayerDuration || 20;
        }
    });

    // Handle delete buttons for existing sites (event delegation handled in loadSites, 
    // but we can also use delegation on the list itself if we wanted, but loadSites attaches listeners currently)
});

// --- Core Logic ---

function togglePrayerBlocking(e) {
    chrome.storage.local.set({ prayerBlocking: e.target.checked });
}

function saveDuration(e) {
    let val = parseInt(e.target.value);
    if (val < 1) val = 1;
    if (val > 60) val = 60;
    chrome.storage.local.set({ prayerDuration: val });
}

// --- Localization ---

function loadLanguage() {
    chrome.storage.local.get(['preferredLanguage'], (data) => {
        const lang = data.preferredLanguage || 'default';
        const select = document.getElementById('lang-select');
        select.value = lang;

        // Apply RTL/Arabic logic
        if (lang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.documentElement.setAttribute('lang', 'ar');
            document.body.classList.add('is-arabic');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
            document.body.classList.remove('is-arabic');
        }
    });
}

function saveLanguage() {
    const lang = document.getElementById('lang-select').value;
    chrome.storage.local.set({ preferredLanguage: lang }, () => {
        // Reload page to apply changes
        window.location.reload();
    });
}

// --- Blocked Sites Logic ---

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

// --- Location & Prayer Times Logic ---

function loadLocation() {
    chrome.storage.local.get(['city', 'country', 'latitude', 'longitude', 'useGps', 'prayerTimes'], (data) => {
        const status = document.getElementById('loc-status');

        // Populate inputs if available
        if (data.city) document.getElementById('manual-city').value = data.city;
        if (data.country) document.getElementById('manual-country').value = data.country;

        // If we have prayer times, show the table immediately
        if (data.prayerTimes) {
            let locString = "";
            if (data.city && data.country) {
                locString = `${data.city}, ${data.country}`;
                if (data.useGps) {
                    locString += " (GPS Detected)";
                }
            } else if (data.latitude) {
                locString = `GPS: ${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
            }
            displayPrayerTable(data.prayerTimes, locString);
        }
    });
}

function saveLocation() {
    const city = document.getElementById('manual-city').value.trim();
    const country = document.getElementById('manual-country').value.trim();
    const status = document.getElementById('loc-status');

    if (!city || !country) {
        status.textContent = "Please enter both City and Country.";
        status.style.color = '#d63031';
        return;
    }

    status.textContent = "Saving...";
    status.style.color = 'var(--accent-color)';

    // Save as manual location (useGps: false)
    chrome.storage.local.set({
        city: city,
        country: country,
        useGps: false,
        // clear coords so background knows to use city/country
        latitude: null,
        longitude: null
    }, () => {
        status.textContent = "Location Saved. Updating times...";
        chrome.runtime.sendMessage({ action: "updatePrayerTimes" });

        // Poll for update
        setTimeout(() => {
            chrome.storage.local.get(['prayerTimes', 'city', 'country'], (d) => {
                if (d.prayerTimes) {
                    displayPrayerTable(d.prayerTimes, `${d.city}, ${d.country}`);
                    status.textContent = "Updated successfully.";
                    status.style.color = 'var(--success-color)';
                } else {
                    status.textContent = "Error updating times. Check city name.";
                    status.style.color = '#d63031';
                }
            });
        }, 2000);
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

        status.textContent = "GPS Found. detecting location...";

        // Reverse Geocode to get name for the Table Display
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`)
            .then(res => res.json())
            .then(data => {
                const city = data.city || data.locality || "";
                const country = data.countryName || "";

                // Populate inputs so user can edit if wrong
                document.getElementById('manual-city').value = city;
                document.getElementById('manual-country').value = country;

                // Save to storage
                chrome.storage.local.set({
                    latitude: lat,
                    longitude: lng,
                    city: city,
                    country: country,
                    useGps: true
                }, () => {
                    status.textContent = "Location Found. Updating times...";

                    // Trigger background update
                    chrome.runtime.sendMessage({ action: "updatePrayerTimes" });

                    // Poll for result
                    setTimeout(() => {
                        chrome.storage.local.get(['prayerTimes', 'city', 'country'], (d) => {
                            if (d.prayerTimes) {
                                const locStr = (d.city && d.country) ? `${d.city}, ${d.country} (GPS Detected)` : "GPS Location";
                                displayPrayerTable(d.prayerTimes, locStr);
                                status.textContent = "Updated via GPS";
                                status.style.color = 'var(--success-color)';
                            }
                        });
                    }, 2500);
                });
            })
            .catch(e => {
                console.error("Geocoding failed", e);
                status.textContent = "Using GPS Coordinates.";
                chrome.storage.local.set({ latitude: lat, longitude: lng, useGps: true }, () => {
                    chrome.runtime.sendMessage({ action: "updatePrayerTimes" });
                    // Poll
                    setTimeout(() => {
                        chrome.storage.local.get(['prayerTimes'], (d) => {
                            if (d.prayerTimes) displayPrayerTable(d.prayerTimes, "GPS Location");
                            status.textContent = "";
                        });
                    }, 2000);
                });
            });

    }, error => {
        status.textContent = "GPS Error: " + error.message;
        status.style.color = '#d63031';
        console.error(error);
    });
}

function displayPrayerTable(timings, locationName) {
    const container = document.getElementById('prayer-table-container');
    const tbody = document.getElementById('prayer-table-body');
    const locDisplay = document.getElementById('location-display');

    if (!timings || !timings.Fajr) return;

    if (locationName && locDisplay) {
        locDisplay.textContent = locationName;
    }

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
    container.classList.add('fade-in');
}

// Helpers

Math.hash = function (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return (Math.abs(h) % 29000) + 1000;
}
