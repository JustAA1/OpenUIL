// app.js

// Year dropdown: edit MIN_YEAR / MAX_YEAR here (must match data in uilData CSVs).

const THEME_STORAGE_KEY = 'openuil-theme';
const CLASSIFICATION_HINT_DEFAULT = 'Start typing to search';
const PERSON_HINT_DEFAULT = 'Start typing to search';
const LOADING_HINT_TEXT = 'Data is still loading...';

let dataReady = false;

function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

function defaultRowStripe(even) {
    if (isDarkTheme()) {
        return even ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.10)';
    }
    return even ? 'rgba(194, 65, 12, 0.06)' : 'rgba(194, 65, 12, 0.11)';
}

function targetRowBg() {
    return isDarkTheme() ? 'rgba(56, 189, 248, 0.5)' : 'rgba(234, 88, 12, 0.28)';
}

function targetRowFade() {
    return isDarkTheme() ? 'rgba(56, 189, 248, 0.1)' : 'rgba(234, 88, 12, 0.14)';
}

function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
}

function getStoredOrDefaultTheme() {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark') return s;
    return 'dark';
}

function initTheme() {
    applyTheme(getStoredOrDefaultTheme());
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const next = cur === 'dark' ? 'light' : 'dark';
            localStorage.setItem(THEME_STORAGE_KEY, next);
            applyTheme(next);
            refreshThemeDependentTables();
        });
    }
}

/** Row stripes and target highlight use inline background from defaultRowStripe / targetRow — recompute on theme change. */
function refreshThemeDependentTables() {
    const isScience = currentCompetition === 'Science';
    const isState = currentViewType === 'state';
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(currentViewType);
    const isMultiRegion = currentViewType === 'all-regions';
    if (!resultsSection.classList.contains('hidden')) {
        if (!indivSection.classList.contains('hidden') && currentIndivData.length) {
            renderIndiv(currentIndivData, currentViewType, isScience, isState, isMultiDistrict, isMultiRegion);
        }
        if (!teamSection.classList.contains('hidden') && currentTeamData.length) {
            renderTeam(currentTeamData, currentViewType, isState, isMultiDistrict, isMultiRegion);
        }
    }
    if (lastClassificationData && lastClassificationData.length) {
        const wrap = document.getElementById('classificationAllYears');
        const tbody = document.getElementById('classificationTableBody');
        if (wrap && !wrap.classList.contains('hidden') && tbody) {
            tbody.innerHTML = lastClassificationData.map((a, i) => `
                <tr style="background: ${i % 2 === 0 ? defaultRowStripe(true) : defaultRowStripe(false)}">
                    <td class="py-2 px-3 font-semibold">${a.year}</td>
                    <td class="py-2 px-3">${a.conference}</td>
                    <td class="py-2 px-3">${a.region || '-'}</td>
                    <td class="py-2 px-3">${a.district}</td>
                </tr>
            `).join('');
        }
    }
}

const MIN_YEAR = 2004;
const MAX_YEAR = 2026;
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);

let currentIndivData = [];
let currentTeamData = [];
let lastClassificationData = null;
let currentViewType = '';
let currentCompetition = '';
let currentSortField = 'total';
let classificationSearchTimeout = null;
let selectedSchoolName = null;
let scrollToTarget = null;

const DISTRICT_COLORS = [
    'rgba(255, 99, 132, 0.12)', 'rgba(54, 162, 235, 0.12)', 'rgba(255, 206, 86, 0.12)', 'rgba(75, 192, 192, 0.12)',
    'rgba(153, 102, 255, 0.12)', 'rgba(255, 159, 64, 0.12)', 'rgba(46, 204, 113, 0.12)', 'rgba(231, 76, 60, 0.12)',
    'rgba(52, 152, 219, 0.12)', 'rgba(155, 89, 182, 0.12)', 'rgba(26, 188, 156, 0.12)', 'rgba(241, 196, 15, 0.12)',
    'rgba(230, 126, 34, 0.12)', 'rgba(149, 165, 166, 0.12)', 'rgba(211, 84, 0, 0.12)', 'rgba(22, 160, 133, 0.12)',
    'rgba(192, 57, 43, 0.12)', 'rgba(41, 128, 185, 0.12)', 'rgba(142, 68, 173, 0.12)', 'rgba(39, 174, 96, 0.12)',
    'rgba(243, 156, 18, 0.12)', 'rgba(211, 84, 0, 0.12)', 'rgba(189, 195, 199, 0.12)', 'rgba(127, 140, 141, 0.12)',
    'rgba(255, 87, 51, 0.12)', 'rgba(72, 201, 176, 0.12)', 'rgba(102, 126, 234, 0.12)', 'rgba(118, 75, 162, 0.12)',
    'rgba(247, 220, 111, 0.12)', 'rgba(130, 224, 170, 0.12)', 'rgba(244, 143, 177, 0.12)', 'rgba(100, 181, 246, 0.12)'
];

const REGION_COLORS = [
    'rgba(255, 99, 132, 0.15)', 'rgba(54, 162, 235, 0.15)', 'rgba(255, 206, 86, 0.15)', 'rgba(75, 192, 192, 0.15)'
];

const yearSelect = document.getElementById('year');
const viewTypeSelect = document.getElementById('viewType');
const districtContainer = document.getElementById('districtContainer');
const districtSelect = document.getElementById('districtSelect');
const regionContainer = document.getElementById('regionContainer');
const regionSelect = document.getElementById('regionSelect');
const lookupForm = document.getElementById('lookupForm');
const resultsSection = document.getElementById('resultsSection');
const loading = document.getElementById('loading');
const searchSummary = document.getElementById('searchSummary');
const missingAlert = document.getElementById('missingAlert');
const missingText = document.getElementById('missingText');
const scienceSortBtns = document.getElementById('scienceSortBtns');
const indivSection = document.getElementById('indivSection');
const teamSection = document.getElementById('teamSection');
const noTeamAlert = document.getElementById('noTeamAlert');
const noDataAlert = document.getElementById('noDataAlert');

const classificationSchool = document.getElementById('classificationSchool');

const personSearch = document.getElementById('personSearch');
let personSearchTimeout = null;

function init() {
    initTheme();
    yearSelect.innerHTML = '<option value="">Select</option>';
    YEARS.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);
    
    districtSelect.innerHTML = '<option value="">Select</option>';
    for (let i = 1; i <= 32; i++) districtSelect.innerHTML += `<option value="${i}">${i}</option>`;
    
    viewTypeSelect.addEventListener('change', handleViewTypeChange);
    lookupForm.addEventListener('submit', handleSubmit);
    classificationSchool.addEventListener('input', debounceClassificationSearch);
    personSearch.addEventListener('input', debouncePersonSearch);
    
    document.querySelectorAll('#scienceSortBtns .sort-btn').forEach(btn => {
        btn.addEventListener('click', () => sortIndivBy(btn.dataset.sort));
    });

    ['year', 'conference', 'competition', 'districtSelect', 'regionSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', checkFormValidity);
    });

    checkFormValidity();
    startDataLoadProgress();
}

function checkFormValidity() {
    const submitBtn = document.getElementById('submitLookupBtn');
    if (!submitBtn) return;

    const year = document.getElementById('year').value;
    const conference = document.getElementById('conference').value;
    const competition = document.getElementById('competition').value;
    const viewType = document.getElementById('viewType').value;
    
    let isValid = year && conference && competition && viewType;
    
    if (isValid) {
        if (viewType === 'district') {
             if (!document.getElementById('districtSelect').value) isValid = false;
        } else if (viewType === 'region' || viewType === 'region-districts') {
             if (!document.getElementById('regionSelect').value) isValid = false;
        }
    }
    
    submitBtn.disabled = !isValid || !dataReady;
}

function startDataLoadProgress() {
    const shell = document.getElementById('dataLoadProgressShell');
    const fill = document.getElementById('dataLoadProgressFill');
    const pctEl = document.getElementById('dataLoadProgressPct');
    const body = document.getElementById('openuilBody');

    let pollTimer = null;
    let fadeDone = false;

    function applyPercent(p) {
        const clamped = Math.max(0, Math.min(100, Math.round(Number(p))));
        pctEl.textContent = `${clamped}%`;
        fill.style.width = `${clamped}%`;
    }

    function finishAndFade() {
        if (fadeDone) return;
        fadeDone = true;
        if (pollTimer != null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        dataReady = true;
        applyPercent(100);
        shell.setAttribute('aria-busy', 'false');
        checkFormValidity();

        const cq = classificationSchool.value.trim();
        if (cq.length >= 1) searchSchools();
        const pq = personSearch.value.trim();
        if (pq.length >= 2) searchPeople();

        setTimeout(() => {
            shell.classList.add('data-load-progress-shell--fading');
        }, 2000);

        const onFadeDone = (ev) => {
            if (ev.target !== shell || ev.propertyName !== 'opacity') return;
            shell.removeEventListener('transitionend', onFadeDone);
            shell.classList.add('hidden');
            if (body) {
                body.classList.remove('pt-[188px]', 'md:pt-[168px]', 'openuil-body-progress');
                body.classList.add('pt-[156px]', 'md:pt-[140px]');
            }
        };
        shell.addEventListener('transitionend', onFadeDone);
    }

    async function poll() {
        try {
            const res = await fetch('/api/init-status');
            const data = await res.json();
            if (data.ready) {
                applyPercent(100);
                finishAndFade();
                return;
            }
            applyPercent(data.percent ?? 0);
        } catch (err) {
            console.error(err);
        }
    }

    applyPercent(0);
    poll();
    pollTimer = setInterval(poll, 130);
}

function showPage(page) {
    const resultsPage = document.getElementById('pageResults');
    const classificationPage = document.getElementById('pageClassification');
    const personPage = document.getElementById('pagePerson');
    const menuResults = document.getElementById('menuResults');
    const menuClassification = document.getElementById('menuClassification');
    const menuPerson = document.getElementById('menuPerson');
    
    resultsPage.classList.add('hidden');
    classificationPage.classList.add('hidden');
    personPage.classList.add('hidden');
    menuResults.classList.remove('active');
    menuClassification.classList.remove('active');
    menuPerson.classList.remove('active');
    
    if (page === 'results') {
        resultsPage.classList.remove('hidden');
        menuResults.classList.add('active');
    } else if (page === 'classification' || page === 'alignment') {
        classificationPage.classList.remove('hidden');
        menuClassification.classList.add('active');
        const cq = classificationSchool.value.trim();
        const ch = document.getElementById('classificationHint');
        if (!dataReady && cq.length >= 1) {
            ch.textContent = LOADING_HINT_TEXT;
            ch.classList.remove('hidden');
        } else if (cq.length >= 1 && dataReady) {
            searchSchools();
        } else {
            ch.textContent = CLASSIFICATION_HINT_DEFAULT;
            ch.classList.remove('hidden');
        }
    } else if (page === 'person') {
        personPage.classList.remove('hidden');
        menuPerson.classList.add('active');
        const pq = personSearch.value.trim();
        const ph = document.getElementById('personHint');
        if (!dataReady && pq.length >= 2) {
            ph.textContent = LOADING_HINT_TEXT;
            ph.classList.remove('hidden');
        } else if (pq.length >= 2 && dataReady) {
            searchPeople();
        } else {
            ph.textContent = PERSON_HINT_DEFAULT;
            ph.classList.remove('hidden');
        }
    }
}

function clearClassificationSelection() {
    document.getElementById('classificationAllYears').classList.add('hidden');
    document.getElementById('autocompleteDropdown').classList.remove('show');
    document.getElementById('autocompleteDropdown').innerHTML = '';
}

function debounceClassificationSearch() {
    clearTimeout(classificationSearchTimeout);
    classificationSearchTimeout = setTimeout(searchSchools, 100);
}

async function searchSchools() {
    const query = classificationSchool.value.trim();
    const hint = document.getElementById('classificationHint');
    const dropdown = document.getElementById('autocompleteDropdown');
    
    document.getElementById('classificationAllYears').classList.add('hidden');
    
    if (query.length < 1) {
        hint.textContent = CLASSIFICATION_HINT_DEFAULT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }

    if (!dataReady) {
        hint.textContent = LOADING_HINT_TEXT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }
    
    hint.classList.add('hidden');
    
    try {
        const res = await fetch(`/api/school-search?query=${encodeURIComponent(query)}`);
        if (res.status === 503) {
            hint.textContent = LOADING_HINT_TEXT;
            hint.classList.remove('hidden');
            dropdown.classList.remove('show');
            return;
        }
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            const uniqueSchools = data.results;
            dropdown.innerHTML = uniqueSchools.map(school => `
                <div class="autocomplete-item" onclick='selectSchoolAllYears("${school.replace(/"/g, '&quot;')}")'>
                    ${school}
                </div>
            `).join('');
            dropdown.classList.add('show');
        } else {
            dropdown.innerHTML = '<div class="autocomplete-item text-zinc-500 dark:text-gray-400">No schools found</div>';
            dropdown.classList.add('show');
        }
    } catch (err) {
        console.error(err);
        dropdown.classList.remove('show');
    }
}

async function selectSchoolAllYears(schoolName) {
    if (!dataReady) {
        document.getElementById('classificationHint').textContent = LOADING_HINT_TEXT;
        document.getElementById('classificationHint').classList.remove('hidden');
        return;
    }

    classificationSchool.value = schoolName;
    selectedSchoolName = schoolName;
    
    document.getElementById('autocompleteDropdown').classList.remove('show');
    document.getElementById('classificationHint').classList.add('hidden');
    
    try {
        const res = await fetch(`/api/classification-all-years?school=${encodeURIComponent(schoolName)}`);
        if (res.status === 503) {
            document.getElementById('classificationHint').textContent = LOADING_HINT_TEXT;
            document.getElementById('classificationHint').classList.remove('hidden');
            return;
        }
        const data = await res.json();
        
        document.getElementById('classificationSchoolTitle').textContent = schoolName;
        
        const classificationRows = data.classifications ?? data.alignments ?? [];
        lastClassificationData =
            classificationRows.length > 0 ? classificationRows : null;

        const missingAlert = document.getElementById('missingYearsAlert');
        if (data.missingYears) {
            document.getElementById('missingYearsText').textContent = data.missingYears;
            missingAlert.classList.remove('hidden');
        } else {
            missingAlert.classList.add('hidden');
        }
        
        const tbody = document.getElementById('classificationTableBody');
        if (classificationRows.length > 0) {
            tbody.innerHTML = classificationRows.map((a, i) => `
                <tr style="background: ${i % 2 === 0 ? defaultRowStripe(true) : defaultRowStripe(false)}">
                    <td class="py-2 px-3 font-semibold">${a.year}</td>
                    <td class="py-2 px-3">${a.conference}</td>
                    <td class="py-2 px-3">${a.region || '-'}</td>
                    <td class="py-2 px-3">${a.district}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-zinc-500 dark:text-white/60">No classification data found</td></tr>';
        }
        
        document.getElementById('classificationAllYears').classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}


function debouncePersonSearch() {
    clearTimeout(personSearchTimeout);
    personSearchTimeout = setTimeout(searchPeople, 100);
}

async function searchPeople() {
    const query = personSearch.value.trim();
    const hint = document.getElementById('personHint');
    const dropdown = document.getElementById('personDropdown');
    
    document.getElementById('personResults').classList.add('hidden');
    
    if (query.length < 2) {
        hint.textContent = PERSON_HINT_DEFAULT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }

    if (!dataReady) {
        hint.textContent = LOADING_HINT_TEXT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }
    
    hint.classList.add('hidden');
    
    try {
        const res = await fetch(`/api/person-search?query=${encodeURIComponent(query)}`);
        if (res.status === 503) {
            hint.textContent = LOADING_HINT_TEXT;
            hint.classList.remove('hidden');
            dropdown.classList.remove('show');
            return;
        }
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            dropdown.innerHTML = data.results.map(item => {
                const escapedName = item.name.replace(/"/g, '&quot;');
                const escapedSchool = item.school ? item.school.replace(/"/g, '&quot;') : '';
                return `
                    <div class="autocomplete-item" onclick='selectPerson("${escapedName}", "${escapedSchool}")'>
                        <span class="font-medium">${item.name}</span>
                        ${item.school ? `<span class="text-zinc-400 dark:text-gray-500 font-bold text-base mx-3">–</span><span class="text-zinc-600 dark:text-gray-400 text-sm">${item.school}</span>` : ''}
                    </div>
                `;
            }).join('');
            dropdown.classList.add('show');
        } else {
            dropdown.innerHTML = '<div class="autocomplete-item text-zinc-500 dark:text-gray-400">No people found</div>';
            dropdown.classList.add('show');
        }
    } catch (err) {
        console.error(err);
        dropdown.classList.remove('show');
    }
}

async function selectPerson(name, school) {
    if (!dataReady) {
        document.getElementById('personHint').textContent = LOADING_HINT_TEXT;
        document.getElementById('personHint').classList.remove('hidden');
        return;
    }

    const displayText = school ? `${name} – ${school}` : name;
    personSearch.value = displayText;
    document.getElementById('personDropdown').classList.remove('show');
    document.getElementById('personHint').classList.add('hidden');
    document.getElementById('personName').textContent = displayText;
    
    try {
        let url = `/api/person-results?name=${encodeURIComponent(name)}`;
        if (school) {
            url += `&school=${encodeURIComponent(school)}`;
        }
        const res = await fetch(url);
        if (res.status === 503) {
            document.getElementById('personHint').textContent = LOADING_HINT_TEXT;
            document.getElementById('personHint').classList.remove('hidden');
            return;
        }
        const data = await res.json();
        
        document.getElementById('personName').textContent = displayText;
        
        const container = document.getElementById('personYearsContainer');
        
        if (data.years && data.years.length > 0) {
            container.innerHTML = data.years.map(yearData => `
                <div class="glass-dark p-5 rounded-xl mb-4">
                    <div class="person-year-heading font-bold text-xl mb-4">${yearData.year}</div>
                    ${yearData.events.map(eventData => `
                        <div class="mb-4 last:mb-0">
                            <div class="person-line-title font-semibold text-lg mb-2">${eventData.event}</div>
                            <div class="grid gap-2">
                                ${eventData.results.map(r => {
                                    const hasSubscores = r.biology && r.bioRank;
                                    
                                    return `
                                    <div class="person-result-card rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors"
                                         onclick="goToResults('${r.year}', '${r.conference}', '${r.eventCode}', '${r.viewType}', '${r.district || ''}', '${r.region || ''}', '${(r.name_raw || "").replace(/'/g, "\\'")}')">
                                        <div class="flex flex-col items-start min-w-0">
                                            <span class="person-line-level font-medium truncate w-full">${r.level}</span>
                                            <span class="person-line-meta text-sm truncate w-full">${r.school} (${r.conference})</span>
                                        </div>
                                        ${hasSubscores ? `
                                        <div class="person-result-right flex w-full min-w-0 flex-shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-4 sm:justify-end">
                                                <div class="flex gap-2 justify-start sm:justify-end">
                                                    <div class="flex flex-col items-center justify-center min-w-[36px]">
                                                        <span class="text-purple-700 dark:text-purple-400/70 text-[9px] uppercase leading-none mb-0.5">Bio</span>
                                                        <span class="text-purple-700 dark:text-purple-400 font-semibold text-xs leading-none">${ordinal(r.bioRank)}</span>
                                                    </div>
                                                    <div class="flex flex-col items-center justify-center min-w-[36px]">
                                                        <span class="text-emerald-700 dark:text-emerald-400/70 text-[9px] uppercase leading-none mb-0.5">Chem</span>
                                                        <span class="text-emerald-700 dark:text-emerald-400 font-semibold text-xs leading-none">${ordinal(r.chemRank)}</span>
                                                    </div>
                                                    <div class="flex flex-col items-center justify-center min-w-[36px]">
                                                        <span class="phys-sub text-[9px] uppercase leading-none mb-0.5">Phys</span>
                                                        <span class="phys-sub font-semibold text-xs leading-none">${ordinal(r.physRank)}</span>
                                                    </div>
                                                </div>
                                                <div class="hidden h-8 w-px shrink-0 bg-stone-300/70 dark:bg-white/20 sm:block"></div>
                                                <div class="flex flex-wrap items-center justify-start gap-3 sm:justify-end sm:gap-4">
                                                    <div class="flex flex-col items-center justify-center min-w-[40px]">
                                                        ${r.teamPlace ? `
                                                            <span class="person-placement font-bold text-sm leading-none">${r.place}</span>
                                                            <span class="person-placement text-[10px] font-bold leading-none text-center w-max person-placement-aux">Overall</span>
                                                            <span class="person-placement text-[11px] font-bold leading-none text-center w-max mt-1">${r.teamPlace} Team</span>
                                                        ` : `
                                                            <span class="person-placement font-bold text-sm leading-none">${r.place}</span>
                                                            <span class="person-placement text-[10px] font-bold leading-none person-placement-aux">Overall</span>
                                                        `}
                                                    </div>
                                                    <div class="flex flex-col items-center justify-center">
                                                        <span class="person-score-label text-[10px] uppercase tracking-wide leading-none mb-0.5">Score</span>
                                                        <span class="person-line-level font-medium text-sm leading-none">${r.score}</span>
                                                    </div>
                                                    ${r.advance ? `
                                                        <div class="flex flex-col items-center justify-center text-green-700 dark:text-green-400 min-w-[60px]">
                                                            <span class="text-sm leading-none mb-0.5">→</span>
                                                            <span class="text-[10px] font-bold uppercase leading-none text-center">${r.advance}</span>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                        </div>
                                        ` : `
                                        <div class="flex w-full items-center justify-start gap-3 sm:w-auto sm:justify-end sm:gap-4 flex-shrink-0">
                                            <div class="flex flex-col items-center justify-center min-w-[40px]">
                                                ${r.teamPlace ? `
                                                    <span class="person-placement font-bold text-sm leading-none">${r.place}</span>
                                                    <span class="person-placement text-[10px] font-bold leading-none text-center w-max person-placement-aux">Overall</span>
                                                    <span class="person-placement text-[11px] font-bold leading-none text-center w-max mt-1">${r.teamPlace} Team</span>
                                                ` : `
                                                    <span class="person-placement font-bold text-sm leading-none">${r.place}</span>
                                                    <span class="person-placement text-[10px] font-bold leading-none person-placement-aux">Overall</span>
                                                `}
                                            </div>
                                            <div class="flex flex-col items-center justify-center">
                                                <span class="person-score-label text-[10px] uppercase tracking-wide leading-none mb-0.5">Score</span>
                                                <span class="person-line-level font-medium text-sm leading-none">${r.score}</span>
                                            </div>
                                            ${r.advance ? `
                                                <div class="flex flex-col items-center justify-center text-green-700 dark:text-green-400 min-w-[60px]">
                                                    <span class="text-sm leading-none mb-0.5">→</span>
                                                    <span class="text-[10px] font-bold uppercase leading-none text-center">${r.advance}</span>
                                                </div>
                                            ` : ''}
                                        </div>
                                        `}
                                    </div>
                                `}).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="text-center text-orange-900/75 dark:text-white/60 py-8">No results found for this person</div>';
        }
        
        document.getElementById('personResults').classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}

function goToResults(year, conference, competition, viewType, district, region, targetName) {
    if (targetName) scrollToTarget = targetName;
    
    showPage('results');
    
    document.getElementById('year').value = year;
    document.getElementById('conference').value = conference;
    document.getElementById('competition').value = competition;
    document.getElementById('viewType').value = viewType;
    
    handleViewTypeChange();
    
    if (viewType === 'district' && district) {
        document.getElementById('districtSelect').value = district;
    } else if ((viewType === 'region' || viewType === 'region-districts') && region) {
        document.getElementById('regionSelect').value = region;
    }
    
    checkFormValidity();
    
    document.getElementById('lookupForm').dispatchEvent(new Event('submit'));
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        document.getElementById('autocompleteDropdown')?.classList.remove('show');
        document.getElementById('personDropdown')?.classList.remove('show');
    }
});

function handleViewTypeChange() {
    const vt = viewTypeSelect.value;
    districtContainer.classList.add('hidden');
    regionContainer.classList.add('hidden');
    districtSelect.required = false;
    regionSelect.required = false;
    
    if (vt === 'district') {
        districtContainer.classList.remove('hidden');
        districtSelect.required = true;
    } else if (vt === 'region' || vt === 'region-districts') {
        regionContainer.classList.remove('hidden');
        regionSelect.required = true;
    }
    
    checkFormValidity();
}

async function handleSubmit(e) {
    e.preventDefault();

    if (!dataReady) {
        return;
    }
    
    const year = yearSelect.value;
    const conference = document.getElementById('conference').value;
    const competition = document.getElementById('competition').value;
    const viewType = viewTypeSelect.value;
    const district = districtSelect.value;
    const region = regionSelect.value;
    
    currentViewType = viewType;
    currentCompetition = competition;
    currentSortField = 'total';
    
    loading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    missingAlert.classList.add('hidden');
    noTeamAlert.classList.add('hidden');
    noDataAlert.classList.add('hidden');
    
    try {
        let url = `/api/search?year=${year}&conference=${conference}&competition=${encodeURIComponent(competition)}&viewType=${viewType}`;
        if (viewType === 'district') url += `&district=${district}`;
        else if (viewType === 'region' || viewType === 'region-districts') url += `&region=${region}`;
        
        const res = await fetch(url);
        if (res.status === 503) {
            console.warn('Results data still loading');
            loading.classList.add('hidden');
            return;
        }
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        displayResults(data, viewType, competition);
        
        const compName = document.getElementById('competition').selectedOptions[0].text;
        let vtLabel = { district: `District ${district}`, region: `Region ${region}`, state: 'State', 
                        'region-districts': `Region ${region} Districts`, 'all-districts': 'All Districts', 'all-regions': 'All Regions' }[viewType];
        searchSummary.textContent = `${year} ${conference} ${compName} - ${vtLabel}`;
        searchSummary.classList.remove('hidden');
        
        if (data.missingDistricts?.length > 0) {
            missingText.textContent = `No data: District ${data.missingDistricts.join(', ')}`;
            missingAlert.classList.remove('hidden');
        }
    } catch (err) {
        console.error(err);
    }
    loading.classList.add('hidden');
}

function getRowBackground(row, index, viewType) {
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(viewType);
    const isMultiRegion = viewType === 'all-regions';
    
    if (isMultiDistrict && row.District) {
        const districtNum = parseInt(row.District) || 1;
        return DISTRICT_COLORS[(districtNum - 1) % DISTRICT_COLORS.length];
    } else if (isMultiRegion && row.Region) {
        const regionNum = parseInt(row.Region) || 1;
        return REGION_COLORS[(regionNum - 1) % REGION_COLORS.length];
    }
    
    return index % 2 === 0 ? defaultRowStripe(true) : defaultRowStripe(false);
}

function displayResults(data, viewType, competition) {
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(viewType);
    const isMultiRegion = viewType === 'all-regions';
    const isState = viewType === 'state';
    const isScience = competition === 'Science';
    
    currentIndivData = data.indiv || [];
    const teamData = data.team || [];
    currentTeamData = teamData;
    
    const hasIndiv = currentIndivData.length > 0;
    const hasTeam = teamData.length > 0;
    
    if (!hasIndiv && !hasTeam) {
        noDataAlert.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        noTeamAlert.classList.add('hidden');
        return;
    }
    
    resultsSection.classList.remove('hidden');
    
    const hasSubscoreData = isScience && currentIndivData.some(r => r.Biology || r.Chemistry || r.Physics);
    if (hasSubscoreData) {
        scienceSortBtns.classList.remove('hidden');
        document.querySelectorAll('#scienceSortBtns .sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === 'total');
        });
    } else {
        scienceSortBtns.classList.add('hidden');
    }
    
    if (hasIndiv) {
        indivSection.classList.remove('hidden');
        renderIndiv(currentIndivData, viewType, isScience, isState, isMultiDistrict, isMultiRegion);
        document.getElementById('indivCount').textContent = `${currentIndivData.length} results`;
    } else {
        indivSection.classList.add('hidden');
    }
    
    if (hasTeam) {
        teamSection.classList.remove('hidden');
        noTeamAlert.classList.add('hidden');
        renderTeam(teamData, viewType, isState, isMultiDistrict, isMultiRegion);
        document.getElementById('teamCount').textContent = `${teamData.length} results`;
    } else {
        teamSection.classList.add('hidden');
        if (hasIndiv) noTeamAlert.classList.remove('hidden');
    }
}

function renderIndiv(data, viewType, isScience, isState, isMultiDistrict, isMultiRegion) {
    const hasBio = isScience && data.some(r => r.Biology);
    const hasChem = isScience && data.some(r => r.Chemistry);
    const hasPhys = isScience && data.some(r => r.Physics);
    const hasPoints = data.some(r => r.Points);
    const hasAdvance = !isState && data.some(r => r['Advance?']);
    
    const highlightClass = 'bg-orange-200/95 dark:bg-sky-500/20';
    const isBioHighlight = currentSortField === 'bio';
    const isChemHighlight = currentSortField === 'chem';
    const isPhysHighlight = currentSortField === 'phys';
    
    let h = '<tr><th class="text-left">Place</th><th class="text-left">Name</th><th class="text-left">School</th>';
    h += '<th class="text-left">Score</th>';
    if (hasBio) h += `<th class="text-left ${isBioHighlight ? highlightClass : ''}">Bio</th>`;
    if (hasChem) h += `<th class="text-left ${isChemHighlight ? highlightClass : ''}">Chem</th>`;
    if (hasPhys) h += `<th class="text-left ${isPhysHighlight ? highlightClass : ''}">Phys</th>`;
    if (hasPoints) h += '<th class="text-left">Pts</th>';
    if (hasAdvance) h += '<th class="text-left">Adv?</th>';
    h += '</tr>';
    document.getElementById('indivHead').innerHTML = h;
    
    let b = '';
    let foundTarget = false;
    
    data.forEach((row, i) => {
        let bgColor = getRowBackground(row, i, viewType);
        let nameField = row['Team Members'] || row.Entry || '';
        
        let isTarget = false;
        if (scrollToTarget && nameField === scrollToTarget) {
            isTarget = true;
            foundTarget = true;
            bgColor = targetRowBg();
        }
        
        let name = nameField || '-';
        let school = row['School Name'] || row.School || '-';
        
        if (isScience && currentSortField !== 'total' && row.OverallRank) {
            name += `<div class="text-[10px] opacity-60">${row.OverallRank} Overall</div>`;
        }
        
        if (isMultiDistrict && row.OriginalPlace && row.District) {
            name += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in D${row.District}</div>`;
        } else if (isMultiRegion && row.OriginalPlace && row.Region) {
            name += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in R${row.Region}</div>`;
        }
        
        b += `<tr ${isTarget ? 'id="targetRow"' : ''} style="background: ${bgColor}; transition: background 2s ease-out;"><td class="text-left">${row.RelativePlace || row.Place || '-'}</td><td class="text-left">${name}</td><td class="text-left">${school}</td>`;
        b += `<td class="text-left">${row.Score || '-'}</td>`;
        if (hasBio) b += `<td class="text-left ${isBioHighlight ? highlightClass : ''}">${row.Biology || '-'}</td>`;
        if (hasChem) b += `<td class="text-left ${isChemHighlight ? highlightClass : ''}">${row.Chemistry || '-'}</td>`;
        if (hasPhys) b += `<td class="text-left ${isPhysHighlight ? highlightClass : ''}">${row.Physics || '-'}</td>`;
        if (hasPoints) b += `<td class="text-left">${row.Points || '-'}</td>`;
        if (hasAdvance) b += `<td class="text-left">${row['Advance?'] || '-'}</td>`;
        b += '</tr>';
    });
    document.getElementById('indivBody').innerHTML = b;
    
    if (foundTarget) {
        setTimeout(() => {
            const el = document.getElementById('targetRow');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    el.style.background = targetRowFade();
                }, 2000);
            }
            scrollToTarget = null;
        }, 300);
    }
}

function renderTeam(data, viewType, isState, isMultiDistrict, isMultiRegion) {
    const hasPoints = data.some(r => r.Points);
    const hasAdvance = !isState && data.some(r => r['Advance?']);
    const hasMembers = data.some(r => r['Team Members']);
    
    let h = '<tr><th class="text-left">Place</th><th class="text-left">School</th>';
    if (hasMembers) h += '<th class="text-left">Members</th>';
    h += '<th class="text-left">Total</th>';
    if (hasPoints) h += '<th class="text-left">Pts</th>';
    if (hasAdvance) h += '<th class="text-left">Adv?</th>';
    h += '</tr>';
    document.getElementById('teamHead').innerHTML = h;
    
    let b = '';
    let foundTarget = false;
    
    data.forEach((row, i) => {
        let bgColor = getRowBackground(row, i, viewType);
        let school = row['School Name'] || '-';
        
        let members = row['Team Members'] || '';
        let isTarget = false;
        if (scrollToTarget && members.includes(scrollToTarget)) {
            isTarget = true;
            foundTarget = true;
            bgColor = targetRowBg();
        }
        
        if (isMultiDistrict && row.OriginalPlace && row.District) {
            school += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in D${row.District}</div>`;
        } else if (isMultiRegion && row.OriginalPlace && row.Region) {
            school += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in R${row.Region}</div>`;
        }
        
        b += `<tr ${isTarget ? 'id="targetRowTeam"' : ''} style="background: ${bgColor}; transition: background 2s ease-out;"><td class="text-left">${row.RelativePlace || row.Place || '-'}</td><td class="text-left">${school}</td>`;
        if (hasMembers) b += `<td class="members-cell text-left">${row['Team Members'] || '-'}</td>`;
        b += `<td class="text-left">${row.Score || '-'}</td>`;
        if (hasPoints) b += `<td class="text-left">${row.Points || '-'}</td>`;
        if (hasAdvance) b += `<td class="text-left">${row['Advance?'] || '-'}</td>`;
        b += '</tr>';
    });
    document.getElementById('teamBody').innerHTML = b;
    
    if (foundTarget) {
        setTimeout(() => {
            const indivEl = document.getElementById('targetRow');
            const teamEl = document.getElementById('targetRowTeam');
            
            if (!indivEl && teamEl) {
                teamEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrollToTarget = null;
            }
            
            if (teamEl) {
                setTimeout(() => {
                    teamEl.style.background = targetRowFade();
                }, 2000);
            }
        }, 300);
    }
}

function sortIndivBy(field) {
    currentSortField = field;
    
    document.querySelectorAll('#scienceSortBtns .sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === field);
    });
    
    const fieldMap = { total: 'Score', bio: 'Biology', chem: 'Chemistry', phys: 'Physics' };
    const sortField = fieldMap[field] || 'Score';
    
    const byTotal = [...currentIndivData].sort((a, b) => (parseFloat(b.Score) || 0) - (parseFloat(a.Score) || 0));
    let currentRankTotal = 1, prevScoreTotal = null;
    byTotal.forEach((row, i) => {
        const score = parseFloat(row.Score) || 0;
        if (prevScoreTotal !== null && score === prevScoreTotal) {
            row.OverallRank = ordinal(currentRankTotal);
        } else {
            currentRankTotal = i + 1;
            row.OverallRank = ordinal(currentRankTotal);
        }
        prevScoreTotal = score;
    });
    
    const sorted = [...currentIndivData].sort((a, b) => (parseFloat(b[sortField]) || 0) - (parseFloat(a[sortField]) || 0));
    
    let currentRank = 1, prevScore = null;
    sorted.forEach((row, i) => {
        const score = parseFloat(row[sortField]) || 0;
        if (prevScore !== null && score === prevScore) {
            row.RelativePlace = ordinal(currentRank);
        } else {
            currentRank = i + 1;
            row.RelativePlace = ordinal(currentRank);
        }
        prevScore = score;
    });
    
    const isScience = currentCompetition === 'Science';
    const isState = currentViewType === 'state';
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(currentViewType);
    const isMultiRegion = currentViewType === 'all-regions';
    
    currentIndivData = sorted;
    renderIndiv(currentIndivData, currentViewType, isScience, isState, isMultiDistrict, isMultiRegion);
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

document.addEventListener('DOMContentLoaded', init);
