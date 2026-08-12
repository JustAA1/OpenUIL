// app.js

// Year dropdown: edit MIN_YEAR / MAX_YEAR here (must match data in uilData CSVs).

const THEME_STORAGE_KEY = 'openuil-theme';
const CLASSIFICATION_HINT_DEFAULT = 'Start typing to search';
const PERSON_HINT_DEFAULT = 'Start typing to search';

function defaultRowStripeClass(even) {
    return even ? 'classification-row-even' : 'classification-row-odd';
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

/** Re-render tables whose non-row styling depends on theme (e.g. science sort headers). Row stripes use CSS classes. */
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
let currentResultsView = 'indiv';
let classificationSearchTimeout = null;
let selectedSchoolName = null;
let classificationResultsLoaded = false;
let scrollToTarget = null;
let highlightSchool = null;
let lastSchoolPayload = null;
let lastSchoolYearKey = null;
let lastSchoolYearKeys = [];

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

// ---------------------------------------------------------------------------
// Static data layer
// Data is precomputed by generate_static.py into a `data/` folder and served
// as plain static files (e.g. from S3). Point DATA_BASE at that folder — a
// relative path when data sits next to index.html, or an absolute CDN/S3 URL
// (e.g. 'https://dxxxx.cloudfront.net/data') if the data is hosted separately.
// ---------------------------------------------------------------------------
const DATA_BASE = 'data';

// Must match SCORE_FIELDS in app.py.
const SCORE_FIELDS = ['Total', 'Total Score', 'Score', 'Scores Totaled', 'Science Total', 'Written', 'Written Score', 'Objective Score', 'Objective', 'Points'];

let _meta = null;
let _searchIndexPromise = null;
let _classificationsPromise = null;
let _sortedSchoolKeys = null;
const _personShardCache = {};
const _schoolShardCache = {};

function loadMeta() {
    if (!_meta) _meta = fetch(`${DATA_BASE}/meta.json`).then(r => r.json());
    return _meta;
}

function loadSearchIndex() {
    if (!_searchIndexPromise) _searchIndexPromise = fetch(`${DATA_BASE}/search-index.json`).then(r => r.json());
    return _searchIndexPromise;
}

function loadClassifications() {
    if (!_classificationsPromise) _classificationsPromise = fetch(`${DATA_BASE}/classifications.json`).then(r => r.json());
    return _classificationsPromise;
}

function loadPersonShard(shard) {
    if (!_personShardCache[shard]) {
        _personShardCache[shard] = fetch(`${DATA_BASE}/person/${shard}.json`).then(r => r.json());
    }
    return _personShardCache[shard];
}

function loadSchoolShard(shard) {
    if (!_schoolShardCache[shard]) {
        _schoolShardCache[shard] = fetch(`${DATA_BASE}/school/${shard}.json`).then(r => r.json());
    }
    return _schoolShardCache[shard];
}

// Must match slugify() in generate_static.py / app.py.
function slugify(value) {
    return String(value).replace(/[^A-Za-z0-9]+/g, '_');
}

// 32-bit FNV-1a over UTF-8 bytes. Must match fnv1a() in generate_static.py.
function fnv1a(str) {
    const bytes = new TextEncoder().encode(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// ---- Result ranking (ported from app.py so it can run client-side) ----------
function getScore(row) {
    for (const f of SCORE_FIELDS) {
        const val = row[f];
        if (val) {
            const n = Number(val);
            if (!isNaN(n)) return n;
        }
    }
    return 0;
}

function normalizeRow(row) {
    for (const f of SCORE_FIELDS) {
        if (row[f]) { row.Score = row[f]; return; }
    }
    row.Score = '';
}

function filterResults(data, year, competition, viewType, district, region) {
    let filtered = data.filter(r => r.Year === year && r.EventName === competition);

    if (viewType === 'district') {
        filtered = filtered.filter(r => r.District === district && !r.Region && !r.State);
    } else if (viewType === 'region') {
        filtered = filtered.filter(r => r.Region === region && !r.State);
    } else if (viewType === 'state') {
        filtered = filtered.filter(r => r.State === '1');
    } else if (viewType === 'region-districts') {
        const regionNum = region ? parseInt(region) : 1;
        const start = (regionNum - 1) * 8 + 1;
        const end = regionNum * 8;
        filtered = filtered.filter(r => r.District && !r.Region && !r.State);
        filtered = filtered.filter(r => { const d = parseInt(r.District) || 0; return d >= start && d <= end; });
    } else if (viewType === 'all-districts') {
        filtered = filtered.filter(r => r.District && !r.Region && !r.State);
    } else if (viewType === 'all-regions') {
        filtered = filtered.filter(r => r.Region && !r.State);
    }

    return filtered;
}

function processResults(results, viewType) {
    results.forEach(normalizeRow);
    results.sort((a, b) => getScore(b) - getScore(a));

    const isMulti = ['region-districts', 'all-districts', 'all-regions'].includes(viewType);

    if (isMulti) {
        let currentRank = 1;
        let prevScore = null;
        results.forEach((row, i) => {
            const placeVal = row.Place;
            if (placeVal) {
                if (/[a-zA-Z]/.test(String(placeVal))) {
                    row.OriginalPlace = String(placeVal);
                } else {
                    const n = parseInt(placeVal);
                    row.OriginalPlace = isNaN(n) ? String(placeVal) : ordinal(n);
                }
            } else {
                row.OriginalPlace = '';
            }

            const currentScore = getScore(row);
            if (prevScore !== null && currentScore === prevScore) {
                row.RelativePlace = ordinal(currentRank);
            } else {
                currentRank = i + 1;
                row.RelativePlace = ordinal(currentRank);
            }
            prevScore = currentScore;
        });
    } else {
        results.forEach(row => { row.RelativePlace = row.Place || ''; });
    }

    return results;
}

function getMissingDistricts(data, year, competition, viewType, region) {
    let toCheck;
    if (viewType === 'region-districts') {
        const regionNum = region ? parseInt(region) : 1;
        const start = (regionNum - 1) * 8 + 1;
        const end = regionNum * 8;
        toCheck = [];
        for (let d = start; d <= end; d++) toCheck.push(d);
    } else if (viewType === 'all-districts') {
        toCheck = [];
        for (let d = 1; d <= 32; d++) toCheck.push(d);
    } else {
        return [];
    }

    let filtered = data.filter(r => r.Year === year && r.EventName === competition);
    filtered = filtered.filter(r => r.District && !r.Region && !r.State);

    const have = new Set();
    filtered.forEach(r => { const d = parseInt(r.District); if (!isNaN(d)) have.add(d); });

    return toCheck.filter(d => !have.has(d));
}

const yearSelect = document.getElementById('year');
const viewTypeSelect = document.getElementById('viewType');
const districtContainer = document.getElementById('districtContainer');
const districtSelect = document.getElementById('districtSelect');
const regionContainer = document.getElementById('regionContainer');
const regionSelect = document.getElementById('regionSelect');
const lookupForm = document.getElementById('lookupForm');
const resultsSection = document.getElementById('resultsSection');
const searchSummary = document.getElementById('searchSummary');
const missingAlert = document.getElementById('missingAlert');
const missingText = document.getElementById('missingText');
const scienceSortBtns = document.getElementById('scienceSortBtns');
const indivSection = document.getElementById('indivSection');
const teamSection = document.getElementById('teamSection');
const resultsTypeToggle = document.getElementById('resultsTypeToggle');
const resultsTypeIndivBtn = document.getElementById('resultsTypeIndiv');
const resultsTypeTeamBtn = document.getElementById('resultsTypeTeam');
const noTeamAlert = document.getElementById('noTeamAlert');
const noDataAlert = document.getElementById('noDataAlert');

const classificationSchool = document.getElementById('classificationSchool');

const personSearch = document.getElementById('personSearch');
let personSearchTimeout = null;
let selectedPersonName = null;
let selectedPersonSchool = null;
let personResultsLoaded = false;

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

    resultsTypeIndivBtn.addEventListener('click', () => setResultsView('indiv'));
    resultsTypeTeamBtn.addEventListener('click', () => setResultsView('team'));

    ['year', 'conference', 'competition', 'districtSelect', 'regionSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', checkFormValidity);
    });

    checkFormValidity();
    loadMeta();
    showPage('person');
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
    
    submitBtn.disabled = !isValid;
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
        updatePinnedSchoolYearNav();
    } else if (page === 'classification' || page === 'alignment') {
        classificationPage.classList.remove('hidden');
        menuClassification.classList.add('active');
        const cq = classificationSchool.value.trim();
        const ch = document.getElementById('classificationHint');

        if (classificationResultsLoaded && cq === selectedSchoolName) {
            ch.classList.add('hidden');
            document.getElementById('autocompleteDropdown').classList.remove('show');
            document.getElementById('classificationAllYears').classList.remove('hidden');
            updatePinnedSchoolYearNav();
            return;
        }

        if (cq.length >= 1) {
            searchSchools();
        } else {
            ch.textContent = CLASSIFICATION_HINT_DEFAULT;
            ch.classList.remove('hidden');
        }
        updatePinnedSchoolYearNav();
    } else if (page === 'person') {
        personPage.classList.remove('hidden');
        menuPerson.classList.add('active');
        updatePinnedSchoolYearNav();
        const pq = personSearch.value.trim();
        const ph = document.getElementById('personHint');

        if (personResultsLoaded && pq === selectedPersonName) {
            ph.classList.add('hidden');
            document.getElementById('personDropdown').classList.remove('show');
            document.getElementById('personResults').classList.remove('hidden');
            return;
        }

        if (pq.length >= 2) {
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
    classificationResultsLoaded = false;
    updatePinnedSchoolYearNav();
    
    if (query.length < 1) {
        hint.textContent = CLASSIFICATION_HINT_DEFAULT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }

    hint.classList.add('hidden');
    
    try {
        const classifications = await loadClassifications();
        if (!_sortedSchoolKeys) {
            _sortedSchoolKeys = Object.keys(classifications)
                .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        }
        const q = query.toLowerCase();
        const results = [];
        for (const school of _sortedSchoolKeys) {
            if (school.toLowerCase().includes(q)) {
                results.push(school);
                if (results.length >= 20) break;
            }
        }

        if (results.length > 0) {
            const uniqueSchools = results;
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
    classificationSchool.value = schoolName;
    selectedSchoolName = schoolName;
    lastSchoolYearKey = null;
    
    document.getElementById('autocompleteDropdown').classList.remove('show');
    document.getElementById('classificationHint').classList.add('hidden');
    
    try {
        const [classifications, meta] = await Promise.all([loadClassifications(), loadMeta()]);
        const data = classifications[schoolName] || { classifications: [], alignments: [], missingYears: '', count: 0 };
        
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

        let schoolPayload = { years: [], count: 0 };
        const schoolShards = meta.schoolShards || 0;
        if (schoolShards > 0) {
            const shard = fnv1a(schoolName) % schoolShards;
            const shardData = await loadSchoolShard(shard);
            schoolPayload = shardData[schoolName] || schoolPayload;
        }
        lastSchoolPayload = schoolPayload;
        lastSchoolYearKeys = collectSchoolYearKeys(classificationRows, schoolPayload);

        const container = document.getElementById('classificationYearsContainer');
        container.innerHTML = renderSchoolYears(classificationRows, schoolPayload);
        showSchoolBrowseView();

        document.getElementById('classificationAllYears').classList.remove('hidden');
        classificationResultsLoaded = true;
    } catch (err) {
        console.error(err);
    }
}

function collectSchoolYearKeys(classificationRows, schoolPayload) {
    const yearKeys = new Set();
    for (const row of classificationRows || []) yearKeys.add(String(row.year));
    for (const yearData of schoolPayload?.years || []) yearKeys.add(String(yearData.year));
    return [...yearKeys].sort((a, b) => Number(a) - Number(b));
}

function showSchoolBrowseView() {
    document.getElementById('classificationBrowseView')?.classList.remove('hidden');
    document.getElementById('classificationYearDetail')?.classList.add('hidden');
    lastSchoolYearKey = null;
    updatePinnedSchoolYearNav();
}

function setSchoolYearNavState(yearKey) {
    const years = lastSchoolYearKeys;
    const options = years.map(y =>
        `<option value="${escapeAttr(y)}"${y === String(yearKey) ? ' selected' : ''}>${escapeHtml(y)}</option>`
    ).join('');
    for (const select of document.querySelectorAll('#schoolYearSelect, #schoolYearSelectNav')) {
        select.innerHTML = options;
        select.value = String(yearKey);
    }

    const idx = years.indexOf(String(yearKey));
    const atOldest = idx <= 0;
    const atNewest = idx < 0 || idx >= years.length - 1;
    for (const prevBtn of document.querySelectorAll('#schoolYearPrevBtn, #schoolYearPrevBtnNav')) {
        prevBtn.disabled = atOldest;
        prevBtn.setAttribute('aria-disabled', atOldest ? 'true' : 'false');
    }
    for (const nextBtn of document.querySelectorAll('#schoolYearNextBtn, #schoolYearNextBtnNav')) {
        nextBtn.disabled = atNewest;
        nextBtn.setAttribute('aria-disabled', atNewest ? 'true' : 'false');
    }
    updatePinnedSchoolYearNav();
}

function shiftSchoolYear(delta) {
    const years = lastSchoolYearKeys;
    const idx = years.indexOf(String(lastSchoolYearKey));
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= years.length) return;
    openSchoolYear(years[next], { scroll: false });
}

function onSchoolYearSelectChange(el) {
    const value = el?.value || document.getElementById('schoolYearSelect')?.value;
    if (!value) return;
    openSchoolYear(value, { scroll: false });
}

function isSchoolYearDetailVisible() {
    const page = document.getElementById('pageClassification');
    const allYears = document.getElementById('classificationAllYears');
    const detail = document.getElementById('classificationYearDetail');
    return !!(page && allYears && detail
        && !page.classList.contains('hidden')
        && !allYears.classList.contains('hidden')
        && !detail.classList.contains('hidden'));
}

function updatePinnedSchoolYearNav() {
    const bar = document.getElementById('navSchoolYearBar');
    if (!bar) return;
    if (!isSchoolYearDetailVisible()) {
        bar.classList.remove('is-visible');
        return;
    }
    const inPage = document.getElementById('schoolYearNavInPage');
    const primary = document.querySelector('.nav-primary-row');
    if (!inPage || !primary) {
        bar.classList.remove('is-visible');
        return;
    }
    const primaryBottom = primary.getBoundingClientRect().bottom;
    const inPageBottom = inPage.getBoundingClientRect().bottom;
    const visible = bar.classList.contains('is-visible');
    const shouldShow = visible
        ? inPageBottom <= primaryBottom + 28
        : inPageBottom <= primaryBottom - 4;
    bar.classList.toggle('is-visible', shouldShow);
}

function openSchoolYear(yearKey, opts = {}) {
    const classByYear = {};
    for (const row of lastClassificationData || []) {
        classByYear[String(row.year)] = row;
    }
    const resultsByYear = {};
    for (const yearData of lastSchoolPayload?.years || []) {
        resultsByYear[String(yearData.year)] = yearData;
    }

    const classRow = classByYear[yearKey];
    const yearData = resultsByYear[yearKey] || { year: yearKey, eventCount: 0, meetCount: 0, events: [] };
    const eventCount = yearData.eventCount || (yearData.events || []).length;
    const meetCount = yearData.meetCount || 0;
    const eventLabel = eventCount === 1 ? '1 event' : `${eventCount} events`;
    const meetLabel = meetCount === 1 ? '1 meet' : `${meetCount} meets`;

    let conference = classRow?.conference;
    let region = classRow?.region;
    let district = classRow?.district;
    if (!conference && yearData.events?.length) {
        const firstMeet = yearData.events[0]?.meets?.[0];
        conference = firstMeet?.conference || '-';
    }
    conference = conference || '-';
    region = region || '-';
    district = district || '-';

    document.getElementById('classificationYearDetailHeading').textContent = yearKey;
    document.getElementById('classificationYearDetailMeta').textContent = `${eventLabel}, ${meetLabel}`;
    document.getElementById('classificationYearDetailClass').textContent =
        `${conference} · Region ${region} · District ${district}`;

    const eventsContainer = document.getElementById('classificationYearEventsContainer');
    eventsContainer.innerHTML = (yearData.events || []).length
        ? yearData.events.map(renderSchoolEvent).join('')
        : '<div class="text-sm text-orange-900/70 dark:text-white/50 py-2">No competition results for this year</div>';

    document.getElementById('classificationBrowseView').classList.add('hidden');
    document.getElementById('classificationYearDetail').classList.remove('hidden');
    lastSchoolYearKey = String(yearKey);
    setSchoolYearNavState(yearKey);
    if (opts.scroll !== false) {
        document.getElementById('classificationYearDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function escapeAttr(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderSchoolYears(classificationRows, schoolPayload) {
    const classByYear = {};
    for (const row of classificationRows || []) {
        classByYear[String(row.year)] = row;
    }
    const resultsByYear = {};
    for (const yearData of schoolPayload.years || []) {
        resultsByYear[String(yearData.year)] = yearData;
    }

    const yearKeys = new Set([
        ...Object.keys(classByYear),
        ...Object.keys(resultsByYear),
    ]);
    const years = [...yearKeys].sort((a, b) => Number(b) - Number(a));

    if (years.length === 0) {
        return '<div class="text-center text-orange-900/75 dark:text-white/60 py-8">No classification or results found for this school</div>';
    }

    const chips = years.map(yearKey => {
        const classRow = classByYear[yearKey];
        const yearData = resultsByYear[yearKey] || { year: yearKey, eventCount: 0, meetCount: 0, events: [] };
        const eventCount = yearData.eventCount || (yearData.events || []).length;
        const meetCount = yearData.meetCount || 0;
        const eventLabel = eventCount === 1 ? '1 event' : `${eventCount} events`;
        const meetLabel = meetCount === 1 ? '1 meet' : `${meetCount} meets`;

        let conference = classRow?.conference;
        let region = classRow?.region;
        let district = classRow?.district;
        if (!conference && yearData.events?.length) {
            const firstMeet = yearData.events[0]?.meets?.[0];
            conference = firstMeet?.conference || '-';
        }
        conference = conference || '-';
        region = region || '-';
        district = district || '-';

        return `
        <button type="button" class="school-year-chip glass-dark"
                onclick="openSchoolYear('${escapeAttr(yearKey)}')">
            <span class="school-year-heading font-bold">${escapeHtml(yearKey)}</span>
            <span class="person-year-event-count text-xs font-medium">${eventLabel}, ${meetLabel}</span>
            <span class="school-year-class text-[11px] leading-snug">${escapeHtml(conference)} · R${escapeHtml(region)} · D${escapeHtml(district)}</span>
        </button>`;
    }).join('');

    return `<div class="school-years-grid">${chips}</div>`;
}

function renderSchoolEvent(eventData) {
    const meetCount = eventData.meetCount || (eventData.meets || []).length;
    const meetLabel = meetCount === 1 ? '1 meet' : `${meetCount} meets`;
    const meetsHtml = (eventData.meets || []).map(renderSchoolMeet).join('');

    return `
    <div class="glass-dark rounded-xl mb-3 p-2">
        <details class="school-event-details">
            <summary class="school-event-summary px-3 py-3 cursor-pointer select-none">
                <span class="person-line-title font-semibold text-base min-w-0 truncate">${escapeHtml(eventData.event)}</span>
                <span class="flex items-center gap-2 shrink-0">
                    <span class="person-year-event-count text-sm font-medium">${meetLabel}</span>
                    <span class="person-year-chevron" aria-hidden="true">›</span>
                </span>
            </summary>
            <div class="school-event-content px-2 pb-3 pt-2 grid gap-2">
                ${meetsHtml || '<div class="text-sm text-orange-900/70 dark:text-white/50 px-2">No meets</div>'}
            </div>
        </details>
    </div>`;
}

function renderSchoolMeet(meet) {
    const district = meet.district || '';
    const region = meet.region || '';
    const school = selectedSchoolName || '';
    const onclick = `event.stopPropagation(); goToResults('${escapeAttr(meet.year)}', '${escapeAttr(meet.conference)}', '${escapeAttr(meet.eventCode)}', '${escapeAttr(meet.viewType)}', '${escapeAttr(district)}', '${escapeAttr(region)}', null, '${escapeAttr(school)}')`;

    const indivHtml = (meet.indiv || []).map(indiv => {
        const advance = indiv.advance
            ? `<span class="school-meet-advance text-green-700 dark:text-green-400 text-[10px] font-bold uppercase">→ ${escapeHtml(indiv.advance)}</span>`
            : `<span class="school-meet-advance"></span>`;
        return `
            <div class="school-meet-row text-sm">
                <span class="person-line-level truncate min-w-0">${escapeHtml(indiv.name || indiv.name_raw)}</span>
                ${advance}
                <span class="school-meet-place person-placement font-bold">${escapeHtml(indiv.place || '-')}</span>
                <span class="school-meet-score person-line-level font-medium">${escapeHtml(indiv.score || '-')}</span>
            </div>`;
    }).join('');

    let teamHtml = '';
    if (meet.team) {
        const members = meet.team.members
            ? `<div class="text-xs person-year-event-types mt-1 truncate">${escapeHtml(meet.team.members)}</div>`
            : '';
        teamHtml = `
            <div class="mt-2 pt-2 border-t border-stone-300/40 dark:border-white/10">
                <div class="school-meet-row text-sm">
                    <span class="person-line-title font-semibold">Team</span>
                    <span class="school-meet-advance"></span>
                    <span class="school-meet-place person-placement font-bold">${escapeHtml(meet.team.place || '-')}</span>
                    <span class="school-meet-score person-line-level font-medium">${escapeHtml(meet.team.score || '-')}</span>
                </div>
                ${members}
            </div>`;
    }

    return `
    <div class="school-meet-card person-result-card rounded-lg p-3 cursor-pointer transition-colors"
         onclick="${onclick}">
        <div class="person-line-level font-medium mb-2">${escapeHtml(meet.level)}</div>
        <div class="grid gap-1.5">
            ${indivHtml || '<div class="text-sm text-orange-900/70 dark:text-white/50">No individual results</div>'}
        </div>
        ${teamHtml}
    </div>`;
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
    personResultsLoaded = false;
    
    if (query.length < 2) {
        hint.textContent = PERSON_HINT_DEFAULT;
        hint.classList.remove('hidden');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }
    
    hint.classList.add('hidden');
    
    try {
        const index = await loadSearchIndex();
        const q = query.toLowerCase();
        const results = [];
        for (const [name, schoolIdx] of index.people) {
            const school = index.schools[schoolIdx] || '';
            if (`${name.toLowerCase()} ${school.toLowerCase()}`.includes(q)) {
                results.push({ name, school });
                if (results.length >= 50) break;
            }
        }

        if (results.length > 0) {
            dropdown.innerHTML = results.map(item => {
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
    personSearch.value = name;
    selectedPersonName = name;
    selectedPersonSchool = school;
    document.getElementById('personDropdown').classList.remove('show');
    document.getElementById('personHint').classList.add('hidden');
    const displayText = school ? `${name} – ${school}` : name;
    document.getElementById('personName').textContent = displayText;
    
    try {
        const meta = await loadMeta();
        const key = `${name}|${school}`;
        const shard = fnv1a(key) % meta.personShards;
        const shardData = await loadPersonShard(shard);
        const data = shardData[key] || { years: [], count: 0 };
        
        const container = document.getElementById('personYearsContainer');
        
        if (data.years && data.years.length > 0) {
            container.innerHTML = data.years.map(yearData => {
                const eventCount = yearData.events.length;
                const meetCount = yearData.events.reduce((sum, e) => sum + e.results.length, 0);
                const eventLabel = eventCount === 1 ? '1 event' : `${eventCount} events`;
                const meetLabel = meetCount === 1 ? '1 meet' : `${meetCount} meets`;
                const eventTypes = yearData.events.map(e => e.event).join(', ');

                return `
                <div class="glass-dark rounded-xl mb-3 person-year-block">
                    <details class="person-year-details">
                        <summary class="person-year-summary p-4 cursor-pointer select-none">
                            <span class="person-year-heading font-bold text-xl shrink-0">${yearData.year}</span>
                            <span class="person-year-meta flex flex-col items-end text-right min-w-0 flex-1 gap-0.5 mx-3">
                                <span class="person-year-event-count text-sm font-medium">${eventLabel}, ${meetLabel}</span>
                                <span class="person-year-event-types text-xs leading-snug">${eventTypes}</span>
                            </span>
                            <span class="person-year-chevron shrink-0" aria-hidden="true">›</span>
                        </summary>
                        <div class="person-year-content px-4 pb-4 pt-3">
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
                    </details>
                </div>`;
            }).join('');
        } else {
            container.innerHTML = '<div class="text-center text-orange-900/75 dark:text-white/60 py-8">No results found for this person</div>';
        }
        
        personResultsLoaded = true;
        document.getElementById('personResults').classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}

function goToResults(year, conference, competition, viewType, district, region, targetName, targetSchool) {
    scrollToTarget = targetName || null;
    highlightSchool = targetSchool || null;
    
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

function rowMatchesHighlight(row, { nameMode = false, schoolMode = false } = {}) {
    if (schoolMode && highlightSchool) {
        const school = row['School Name'] || row.School || '';
        return school === highlightSchool;
    }
    if (nameMode && scrollToTarget) {
        const nameField = row['Team Members'] || row.Entry || '';
        return nameField === scrollToTarget;
    }
    return false;
}

function rowMatchesTeamHighlight(row) {
    if (highlightSchool) {
        const school = row['School Name'] || row.School || '';
        return school === highlightSchool;
    }
    if (scrollToTarget) {
        const members = row['Team Members'] || '';
        return members.includes(scrollToTarget);
    }
    return false;
}

function scheduleHighlightFocus(hasIndivTargets, hasTeamTargets) {
    if (!hasIndivTargets && !hasTeamTargets) {
        scrollToTarget = null;
        highlightSchool = null;
        return;
    }
    setTimeout(() => {
        const indivEl = document.getElementById('targetRow');
        const teamEl = document.getElementById('targetRowTeam');
        const focusEl = indivEl || teamEl;
        if (focusEl) {
            focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const targets = document.querySelectorAll('.indiv-team-tbody tr.results-row-target');
        setTimeout(() => {
            targets.forEach(el => fadeTargetRow(el));
            scrollToTarget = null;
            highlightSchool = null;
        }, 2800);
    }, 250);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        document.getElementById('autocompleteDropdown')?.classList.remove('show');
        document.getElementById('personDropdown')?.classList.remove('show');
    }
});

let _schoolYearNavPinRaf = 0;
function schedulePinnedSchoolYearNav() {
    if (_schoolYearNavPinRaf) return;
    _schoolYearNavPinRaf = requestAnimationFrame(() => {
        _schoolYearNavPinRaf = 0;
        updatePinnedSchoolYearNav();
    });
}
window.addEventListener('scroll', schedulePinnedSchoolYearNav, { passive: true });
window.addEventListener('resize', schedulePinnedSchoolYearNav);

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

function scrollToLookupResults() {
    requestAnimationFrame(() => {
        let el = null;
        if (!resultsSection.classList.contains('hidden')) {
            el = resultsSection;
        } else if (!noDataAlert.classList.contains('hidden')) {
            el = noDataAlert;
        } else if (!searchSummary.classList.contains('hidden')) {
            el = searchSummary;
        }
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const year = yearSelect.value;
    const conference = document.getElementById('conference').value;
    const competition = document.getElementById('competition').value;
    const viewType = viewTypeSelect.value;
    const district = districtSelect.value;
    const region = regionSelect.value;
    
    currentViewType = viewType;
    currentCompetition = competition;
    currentSortField = 'total';
    currentResultsView = 'indiv';
    
    resultsSection.classList.add('hidden');
    missingAlert.classList.add('hidden');
    noTeamAlert.classList.add('hidden');
    noDataAlert.classList.add('hidden');
    
    try {
        let payload = { indiv: [], team: [] };
        const res = await fetch(`${DATA_BASE}/results/${conference}/${year}/${slugify(competition)}.json`);
        if (res.ok) {
            payload = await res.json();
        }

        const indivRaw = payload.indiv || [];
        const teamRaw = payload.team || [];

        const indivResults = processResults(filterResults(indivRaw, year, competition, viewType, district, region), viewType);
        const teamResults = processResults(filterResults(teamRaw, year, competition, viewType, district, region), viewType);
        const missingDistricts = getMissingDistricts(indivRaw, year, competition, viewType, region);

        const data = {
            indiv: indivResults,
            team: teamResults,
            count: indivResults.length + teamResults.length,
            missingDistricts,
        };

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

        // Prefer highlight scroll when jumping from person/school; otherwise scroll to results.
        if (!scrollToTarget && !highlightSchool) {
            scrollToLookupResults();
        }
    } catch (err) {
        console.error(err);
    }
}

function getRowStripeClass(row, index, viewType) {
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(viewType);
    const isMultiRegion = viewType === 'all-regions';

    if (isMultiDistrict && row.District) return '';
    if (isMultiRegion && row.Region) return '';
    return index % 2 === 0 ? 'results-row-even' : 'results-row-odd';
}

function getRowInlineBackground(row, index, viewType) {
    const isMultiDistrict = ['region-districts', 'all-districts'].includes(viewType);
    const isMultiRegion = viewType === 'all-regions';

    if (isMultiDistrict && row.District) {
        const districtNum = parseInt(row.District) || 1;
        return DISTRICT_COLORS[(districtNum - 1) % DISTRICT_COLORS.length];
    }
    if (isMultiRegion && row.Region) {
        const regionNum = parseInt(row.Region) || 1;
        return REGION_COLORS[(regionNum - 1) % REGION_COLORS.length];
    }
    return '';
}

function buildResultsRowAttrs(row, index, viewType, isTarget, targetId) {
    const stripeClass = getRowStripeClass(row, index, viewType);
    const inlineBg = getRowInlineBackground(row, index, viewType);
    const classes = [isTarget ? 'results-row-target' : stripeClass].filter(Boolean).join(' ');
    const idAttr = targetId ? ` id="${targetId}"` : '';
    const stripeData = stripeClass ? ` data-stripe="${stripeClass}"` : '';
    const styleAttr = inlineBg ? ` style="background: ${inlineBg}"` : '';
    return { classes, idAttr, stripeData, styleAttr };
}

function fadeTargetRow(el) {
    if (!el) return;
    el.classList.remove('results-row-target');
    el.classList.add('results-row-target-fade');
}

function setResultsView(view) {
    if (!['indiv', 'team'].includes(view)) return;
    currentResultsView = view;

    resultsTypeIndivBtn.classList.toggle('active', view === 'indiv');
    resultsTypeTeamBtn.classList.toggle('active', view === 'team');

    indivSection.classList.toggle('hidden', view !== 'indiv');
    teamSection.classList.toggle('hidden', view !== 'team');
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
        renderIndiv(currentIndivData, viewType, isScience, isState, isMultiDistrict, isMultiRegion);
        document.getElementById('indivCount').textContent = `${currentIndivData.length} results`;
    }

    if (hasTeam) {
        renderTeam(teamData, viewType, isState, isMultiDistrict, isMultiRegion);
        document.getElementById('teamCount').textContent = `${teamData.length} results`;
    }

    if (hasIndiv && hasTeam) {
        resultsTypeToggle.classList.remove('hidden');
        noTeamAlert.classList.add('hidden');
        setResultsView(currentResultsView === 'team' ? 'team' : 'indiv');
    } else {
        resultsTypeToggle.classList.add('hidden');
        if (hasIndiv) {
            indivSection.classList.remove('hidden');
            teamSection.classList.add('hidden');
            noTeamAlert.classList.remove('hidden');
        } else {
            indivSection.classList.add('hidden');
            teamSection.classList.remove('hidden');
            noTeamAlert.classList.add('hidden');
        }
    }

    if (scrollToTarget || highlightSchool) {
        const hasIndivTargets = !!document.querySelector('#indivBody tr.results-row-target');
        const hasTeamTargets = !!document.querySelector('#teamBody tr.results-row-target');
        scheduleHighlightFocus(hasIndivTargets, hasTeamTargets);
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
    let firstTarget = true;
    
    data.forEach((row, i) => {
        const nameField = row['Team Members'] || row.Entry || '';
        
        const isTarget = rowMatchesHighlight(row, {
            nameMode: !!scrollToTarget && !highlightSchool,
            schoolMode: !!highlightSchool,
        });
        
        const rowAttrs = buildResultsRowAttrs(
            row,
            i,
            viewType,
            isTarget,
            isTarget && firstTarget ? 'targetRow' : ''
        );
        if (isTarget && firstTarget) firstTarget = false;
        
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
        
        b += `<tr${rowAttrs.idAttr} class="${rowAttrs.classes}"${rowAttrs.stripeData}${rowAttrs.styleAttr}><td class="text-left">${row.RelativePlace || row.Place || '-'}</td><td class="text-left">${name}</td><td class="text-left">${school}</td>`;
        b += `<td class="text-left">${row.Score || '-'}</td>`;
        if (hasBio) b += `<td class="text-left ${isBioHighlight ? highlightClass : ''}">${row.Biology || '-'}</td>`;
        if (hasChem) b += `<td class="text-left ${isChemHighlight ? highlightClass : ''}">${row.Chemistry || '-'}</td>`;
        if (hasPhys) b += `<td class="text-left ${isPhysHighlight ? highlightClass : ''}">${row.Physics || '-'}</td>`;
        if (hasPoints) b += `<td class="text-left">${row.Points || '-'}</td>`;
        if (hasAdvance) b += `<td class="text-left">${row['Advance?'] || '-'}</td>`;
        b += '</tr>';
    });
    document.getElementById('indivBody').innerHTML = b;
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
    let firstTarget = true;
    
    data.forEach((row, i) => {
        let school = row['School Name'] || '-';
        
        const isTarget = rowMatchesTeamHighlight(row);

        const rowAttrs = buildResultsRowAttrs(
            row,
            i,
            viewType,
            isTarget,
            isTarget && firstTarget ? 'targetRowTeam' : ''
        );
        if (isTarget && firstTarget) firstTarget = false;
        
        if (isMultiDistrict && row.OriginalPlace && row.District) {
            school += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in D${row.District}</div>`;
        } else if (isMultiRegion && row.OriginalPlace && row.Region) {
            school += `<div class="text-[10px] opacity-60">${row.OriginalPlace} in R${row.Region}</div>`;
        }
        
        b += `<tr${rowAttrs.idAttr} class="${rowAttrs.classes}"${rowAttrs.stripeData}${rowAttrs.styleAttr}><td class="text-left">${row.RelativePlace || row.Place || '-'}</td><td class="text-left">${school}</td>`;
        if (hasMembers) b += `<td class="members-cell text-left">${row['Team Members'] || '-'}</td>`;
        b += `<td class="text-left">${row.Score || '-'}</td>`;
        if (hasPoints) b += `<td class="text-left">${row.Points || '-'}</td>`;
        if (hasAdvance) b += `<td class="text-left">${row['Advance?'] || '-'}</td>`;
        b += '</tr>';
    });
    document.getElementById('teamBody').innerHTML = b;
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
