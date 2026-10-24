(function (global) {
    const STORAGE_KEY = 'airflow-calendar-filters';
    const SUGGESTION_LIMIT = 20;
    const NAME_DEBOUNCE_MS = 200;

    const STATUSES = [
        { id: 'success', label: 'Success' },
        { id: 'failed', label: 'Failed' },
        { id: 'running', label: 'Running' },
        { id: 'queued', label: 'Queued' },
        { id: 'no_run', label: 'No run' },
    ];

    var allEvents = [];
    var catalogById = {};
    var allTags = [];
    var allOwners = [];
    var filter = emptyFilter();
    var boundCalendar = null;
    var panelEl = null;
    var emptyEl = null;
    var panelOpen = false;
    var toggleLocked = false;
    var nameTimer = null;
    var ui = {};

    function emptyFilter() {
        return {
            q: '',
            tags: [],
            tagMode: 'any',
            owners: [],
            statuses: [],
        };
    }

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) { /* ignore */ }
    }

    function asStringList(value) {
        if (!Array.isArray(value)) {
            return [];
        }
        var seen = {};
        var result = [];
        value.forEach(function (item) {
            if (typeof item !== 'string') {
                return;
            }
            var name = item.trim();
            if (!name || seen[name]) {
                return;
            }
            seen[name] = true;
            result.push(name);
        });
        return result;
    }

    function normalizeFilter(raw) {
        var next = emptyFilter();
        if (!raw || typeof raw !== 'object') {
            return next;
        }
        if (typeof raw.q === 'string') {
            next.q = raw.q.slice(0, 200);
        }
        next.tags = asStringList(raw.tags);
        next.owners = asStringList(raw.owners);
        next.tagMode = raw.tagMode === 'all' ? 'all' : 'any';
        var allowed = {};
        STATUSES.forEach(function (status) {
            allowed[status.id] = true;
        });
        next.statuses = asStringList(raw.statuses).filter(function (status) {
            return allowed[status];
        });
        return next;
    }

    function loadFilter() {
        var raw = readStorage(STORAGE_KEY);
        if (!raw) {
            return emptyFilter();
        }
        try {
            return normalizeFilter(JSON.parse(raw));
        } catch (e) {
            return emptyFilter();
        }
    }

    function saveFilter() {
        writeStorage(STORAGE_KEY, JSON.stringify(filter));
    }

    function activeCount(current) {
        var selected = current || filter;
        var count = 0;
        if (selected.q && selected.q.trim()) {
            count += 1;
        }
        count += selected.tags.length;
        count += selected.owners.length;
        count += selected.statuses.length;
        return count;
    }

    function buttonLabel() {
        var count = activeCount();
        if (!count) {
            return 'Filter';
        }
        return 'Filter · ' + count;
    }

    function cloneEvent(event) {
        var copy = {};
        Object.keys(event || {}).forEach(function (key) {
            copy[key] = event[key];
        });
        var props = event && event.extendedProps;
        if (props) {
            copy.extendedProps = {};
            Object.keys(props).forEach(function (key) {
                copy.extendedProps[key] = props[key];
            });
        }
        return copy;
    }

    function eventDagId(event) {
        var props = event && event.extendedProps;
        if (props && props.dag_id) {
            return props.dag_id;
        }
        return (event && event.title) || '';
    }

    function indexCatalog(catalog) {
        catalogById = {};
        var tagSeen = {};
        var ownerSeen = {};
        allTags = [];
        allOwners = [];
        (catalog || []).forEach(function (entry) {
            if (!entry || !entry.dag_id) {
                return;
            }
            var tags = asStringList(entry.tags);
            var owners = asStringList(entry.owners);
            catalogById[entry.dag_id] = {
                dag_id: entry.dag_id,
                tags: tags,
                owners: owners,
            };
            tags.forEach(function (tag) {
                if (!tagSeen[tag]) {
                    tagSeen[tag] = true;
                    allTags.push(tag);
                }
            });
            owners.forEach(function (owner) {
                if (!ownerSeen[owner]) {
                    ownerSeen[owner] = true;
                    allOwners.push(owner);
                }
            });
        });
        allTags.sort(function (a, b) { return a.localeCompare(b); });
        allOwners.sort(function (a, b) { return a.localeCompare(b); });
    }

    function metaFor(dagId) {
        return catalogById[dagId] || { dag_id: dagId, tags: [], owners: [] };
    }

    function listHas(items, expected, mode) {
        if (!expected.length) {
            return true;
        }
        var present = {};
        (items || []).forEach(function (item) {
            present[item] = true;
        });
        if (mode === 'all') {
            return expected.every(function (item) { return present[item]; });
        }
        return expected.some(function (item) { return present[item]; });
    }

    function eventMatches(event, current) {
        var selected = current || filter;
        var dagId = eventDagId(event);
        var meta = metaFor(dagId);
        var query = (selected.q || '').trim().toLowerCase();
        if (query && String(dagId).toLowerCase().indexOf(query) === -1) {
            return false;
        }
        if (!listHas(meta.tags, selected.tags, selected.tagMode)) {
            return false;
        }
        if (!listHas(meta.owners, selected.owners, 'any')) {
            return false;
        }
        if (selected.statuses.length) {
            var status = (event.extendedProps && event.extendedProps.status) || '';
            if (selected.statuses.indexOf(status) === -1) {
                return false;
            }
        }
        return true;
    }

    function matchingEvents() {
        return allEvents.filter(function (event) {
            return eventMatches(event);
        });
    }

    function dagCount(events) {
        var seen = {};
        var count = 0;
        events.forEach(function (event) {
            var dagId = eventDagId(event);
            if (!dagId || seen[dagId]) {
                return;
            }
            seen[dagId] = true;
            count += 1;
        });
        return count;
    }

    function dagCountLabel(count) {
        return count === 1 ? '1 DAG' : count + ' DAGs';
    }

    function filterButton() {
        return document.querySelector('.fc-filter-button');
    }

    function hitNode(node, event) {
        var target = event && event.target;
        if (!node || !target) {
            return false;
        }
        if (target === node || (typeof node.contains === 'function' && node.contains(target))) {
            return true;
        }
        if (typeof event.composedPath !== 'function') {
            return false;
        }
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) {
            if (path[i] === node) {
                return true;
            }
        }
        return false;
    }

    function updateToolbar() {
        var button = filterButton();
        if (!button) {
            return;
        }
        var label = buttonLabel();
        if (button.textContent !== label) {
            button.textContent = label;
        }
        button.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
        button.classList.toggle('fc-button-active', panelOpen);
        button.classList.toggle('calendar-filter-button-on', activeCount() > 0);
    }

    function updateEmptyState(visibleCount) {
        if (!emptyEl) {
            return;
        }
        var show = activeCount() > 0 && visibleCount === 0;
        emptyEl.hidden = !show;
    }

    function updateSummary(events) {
        if (!ui.summary) {
            return;
        }
        ui.summary.textContent = dagCountLabel(dagCount(events));
    }

    function applyToCalendar(calendar) {
        var target = calendar || boundCalendar;
        var visible = matchingEvents();
        if (target) {
            var copies = visible.map(cloneEvent);
            var render = function () {
                target.removeAllEventSources();
                target.addEventSource(copies);
            };
            if (typeof target.batchRendering === 'function') {
                target.batchRendering(render);
            } else {
                render();
            }
        }
        updateSummary(visible);
        updateEmptyState(visible.length);
        updateToolbar();
        if (ui.clearButton) {
            ui.clearButton.disabled = activeCount() === 0;
        }
    }

    function commitFilter() {
        saveFilter();
        applyToCalendar(boundCalendar);
        if (panelOpen) {
            renderChips();
            syncStatusChecks();
            syncTagMode();
        }
    }

    function scheduleNameFilter(value) {
        if (nameTimer) {
            clearTimeout(nameTimer);
        }
        nameTimer = setTimeout(function () {
            nameTimer = null;
            filter.q = value;
            commitFilter();
        }, NAME_DEBOUNCE_MS);
    }

    function suggestionsFor(options, selected, query) {
        var chosen = {};
        selected.forEach(function (item) { chosen[item] = true; });
        var needle = (query || '').trim().toLowerCase();
        var matches = [];
        for (var i = 0; i < options.length; i++) {
            if (chosen[options[i]]) {
                continue;
            }
            if (needle && options[i].toLowerCase().indexOf(needle) === -1) {
                continue;
            }
            matches.push(options[i]);
            if (matches.length >= SUGGESTION_LIMIT) {
                break;
            }
        }
        return matches;
    }

    function fillSuggestions(listEl, items, onPick) {
        listEl.innerHTML = '';
        if (!items.length) {
            listEl.hidden = true;
            return;
        }
        items.forEach(function (item) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'calendar-filter-suggestion';
            option.textContent = item;
            option.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });
            option.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                onPick(item);
            });
            listEl.appendChild(option);
        });
        listEl.hidden = false;
    }

    function renderChipRow(container, items, onRemove) {
        container.innerHTML = '';
        items.forEach(function (item) {
            var chip = document.createElement('span');
            chip.className = 'calendar-filter-chip';

            var label = document.createElement('span');
            label.className = 'calendar-filter-chip-label';
            label.textContent = item;

            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'calendar-filter-chip-remove';
            remove.setAttribute('aria-label', 'Remove ' + item);
            remove.textContent = '×';
            remove.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                onRemove(item);
            });

            chip.appendChild(label);
            chip.appendChild(remove);
            container.appendChild(chip);
        });
    }

    function renderChips() {
        if (!ui.tagChips || !ui.ownerChips) {
            return;
        }
        renderChipRow(ui.tagChips, filter.tags, function (tag) {
            filter.tags = filter.tags.filter(function (item) { return item !== tag; });
            commitFilter();
            refreshTagSuggestions();
        });
        renderChipRow(ui.ownerChips, filter.owners, function (owner) {
            filter.owners = filter.owners.filter(function (item) { return item !== owner; });
            commitFilter();
            refreshOwnerSuggestions();
        });
    }

    function refreshTagSuggestions() {
        if (!ui.tagList || !ui.tagInput) {
            return;
        }
        if (document.activeElement !== ui.tagInput) {
            ui.tagList.hidden = true;
            return;
        }
        fillSuggestions(
            ui.tagList,
            suggestionsFor(allTags, filter.tags, ui.tagInput.value),
            function (tag) {
                filter.tags = asStringList(filter.tags.concat([tag]));
                ui.tagInput.value = '';
                commitFilter();
                refreshTagSuggestions();
                ui.tagInput.focus();
            }
        );
    }

    function refreshOwnerSuggestions() {
        if (!ui.ownerList || !ui.ownerInput) {
            return;
        }
        if (document.activeElement !== ui.ownerInput) {
            ui.ownerList.hidden = true;
            return;
        }
        fillSuggestions(
            ui.ownerList,
            suggestionsFor(allOwners, filter.owners, ui.ownerInput.value),
            function (owner) {
                filter.owners = asStringList(filter.owners.concat([owner]));
                ui.ownerInput.value = '';
                commitFilter();
                refreshOwnerSuggestions();
                ui.ownerInput.focus();
            }
        );
    }

    function syncTagMode() {
        if (!ui.modeAny || !ui.modeAll) {
            return;
        }
        var all = filter.tagMode === 'all';
        ui.modeAny.classList.toggle('is-active', !all);
        ui.modeAll.classList.toggle('is-active', all);
        ui.modeAny.setAttribute('aria-pressed', all ? 'false' : 'true');
        ui.modeAll.setAttribute('aria-pressed', all ? 'true' : 'false');
    }

    function syncStatusChecks() {
        if (!ui.statusInputs) {
            return;
        }
        ui.statusInputs.forEach(function (input) {
            input.checked = filter.statuses.indexOf(input.value) !== -1;
        });
    }

    function syncPanelFields() {
        if (!panelEl) {
            return;
        }
        if (ui.nameInput && document.activeElement !== ui.nameInput) {
            ui.nameInput.value = filter.q;
        }
        renderChips();
        syncTagMode();
        syncStatusChecks();
        if (ui.clearButton) {
            ui.clearButton.disabled = activeCount() === 0;
        }
        updateSummary(matchingEvents());
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function ensureEmptyState() {
        if (emptyEl) {
            return emptyEl;
        }
        emptyEl = el('div', 'calendar-filter-empty', 'No DAGs match this filter');
        emptyEl.hidden = true;
        var container = document.getElementById('calendar-container') || document.body;
        container.appendChild(emptyEl);
        return emptyEl;
    }

    function ensurePanel() {
        if (panelEl) {
            return panelEl;
        }

        panelEl = el('div', 'calendar-filter-panel');
        panelEl.hidden = true;
        panelEl.setAttribute('role', 'dialog');
        panelEl.setAttribute('aria-label', 'Filter DAGs');

        var header = el('div', 'calendar-filter-header');
        header.appendChild(el('div', 'calendar-filter-title', 'Filter'));
        ui.clearButton = el('button', 'calendar-filter-clear', 'Clear');
        ui.clearButton.type = 'button';
        ui.clearButton.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            clearFilter();
        });
        header.appendChild(ui.clearButton);
        panelEl.appendChild(header);

        ui.summary = el('div', 'calendar-filter-summary', '0 DAGs');
        panelEl.appendChild(ui.summary);

        panelEl.appendChild(el('label', 'calendar-filter-label', 'DAG name'));
        ui.nameInput = el('input', 'calendar-filter-input');
        ui.nameInput.type = 'search';
        ui.nameInput.placeholder = 'Filter by name';
        ui.nameInput.setAttribute('aria-label', 'Filter by DAG name');
        ui.nameInput.addEventListener('input', function () {
            scheduleNameFilter(ui.nameInput.value);
        });
        panelEl.appendChild(ui.nameInput);

        var tagLabel = el('div', 'calendar-filter-label');
        tagLabel.appendChild(el('span', '', 'Tags'));
        var mode = el('div', 'calendar-filter-mode');
        mode.setAttribute('role', 'group');
        mode.setAttribute('aria-label', 'Tag match');
        ui.modeAny = el('button', 'is-active', 'Any');
        ui.modeAll = el('button', '', 'All');
        ui.modeAny.type = 'button';
        ui.modeAll.type = 'button';
        ui.modeAny.title = 'Show DAGs that have any selected tag';
        ui.modeAll.title = 'Show DAGs that have every selected tag';
        ui.modeAny.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (filter.tagMode === 'any') {
                return;
            }
            filter.tagMode = 'any';
            commitFilter();
        });
        ui.modeAll.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (filter.tagMode === 'all') {
                return;
            }
            filter.tagMode = 'all';
            commitFilter();
        });
        mode.appendChild(ui.modeAny);
        mode.appendChild(ui.modeAll);
        tagLabel.appendChild(mode);
        panelEl.appendChild(tagLabel);

        ui.tagChips = el('div', 'calendar-filter-chips');
        panelEl.appendChild(ui.tagChips);
        ui.tagInput = el('input', 'calendar-filter-input');
        ui.tagInput.type = 'text';
        ui.tagInput.placeholder = 'Add a tag';
        ui.tagInput.setAttribute('aria-label', 'Add a tag');
        ui.tagInput.autocomplete = 'off';
        ui.tagList = el('div', 'calendar-filter-suggestions');
        ui.tagList.hidden = true;
        ui.tagInput.addEventListener('focus', refreshTagSuggestions);
        ui.tagInput.addEventListener('input', refreshTagSuggestions);
        ui.tagInput.addEventListener('blur', function () {
            ui.tagList.hidden = true;
        });
        ui.tagInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            var first = ui.tagList.querySelector('.calendar-filter-suggestion');
            if (first) {
                first.click();
            }
        });
        panelEl.appendChild(ui.tagInput);
        panelEl.appendChild(ui.tagList);

        panelEl.appendChild(el('div', 'calendar-filter-label', 'Owner'));
        ui.ownerChips = el('div', 'calendar-filter-chips');
        panelEl.appendChild(ui.ownerChips);
        ui.ownerInput = el('input', 'calendar-filter-input');
        ui.ownerInput.type = 'text';
        ui.ownerInput.placeholder = 'Add an owner';
        ui.ownerInput.setAttribute('aria-label', 'Add an owner');
        ui.ownerInput.autocomplete = 'off';
        ui.ownerList = el('div', 'calendar-filter-suggestions');
        ui.ownerList.hidden = true;
        ui.ownerInput.addEventListener('focus', refreshOwnerSuggestions);
        ui.ownerInput.addEventListener('input', refreshOwnerSuggestions);
        ui.ownerInput.addEventListener('blur', function () {
            ui.ownerList.hidden = true;
        });
        ui.ownerInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            var first = ui.ownerList.querySelector('.calendar-filter-suggestion');
            if (first) {
                first.click();
            }
        });
        panelEl.appendChild(ui.ownerInput);
        panelEl.appendChild(ui.ownerList);

        panelEl.appendChild(el('div', 'calendar-filter-label', 'Status'));
        var statusBox = el('div', 'calendar-filter-statuses');
        ui.statusInputs = [];
        STATUSES.forEach(function (status) {
            var row = el('label', 'calendar-filter-status');
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = status.id;
            input.addEventListener('change', function () {
                if (input.checked) {
                    filter.statuses = asStringList(filter.statuses.concat([status.id]));
                } else {
                    filter.statuses = filter.statuses.filter(function (item) {
                        return item !== status.id;
                    });
                }
                commitFilter();
            });
            ui.statusInputs.push(input);
            row.appendChild(input);
            row.appendChild(document.createTextNode(status.label));
            statusBox.appendChild(row);
        });
        panelEl.appendChild(statusBox);

        document.body.appendChild(panelEl);
        return panelEl;
    }

    function positionPanel() {
        var button = filterButton();
        var panel = ensurePanel();
        if (!button) {
            return;
        }
        var rect = button.getBoundingClientRect();
        var width = panel.offsetWidth || 320;
        var left = rect.left;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - width - 8);
        }
        panel.style.top = (rect.bottom + 4) + 'px';
        panel.style.left = Math.max(8, left) + 'px';
    }

    function openPanel() {
        ensurePanel();
        ensureEmptyState();
        panelOpen = true;
        panelEl.hidden = false;
        syncPanelFields();
        positionPanel();
        updateToolbar();
    }

    function closePanel() {
        panelOpen = false;
        if (panelEl) {
            panelEl.hidden = true;
        }
        updateToolbar();
    }

    function togglePanel() {
        if (toggleLocked) {
            return;
        }
        toggleLocked = true;
        setTimeout(function () {
            toggleLocked = false;
        }, 0);
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function onToolbarClick(event) {
        if (!hitNode(filterButton(), event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
    }

    function clearFilter() {
        if (nameTimer) {
            clearTimeout(nameTimer);
            nameTimer = null;
        }
        filter = emptyFilter();
        if (ui.nameInput) {
            ui.nameInput.value = '';
        }
        if (ui.tagInput) {
            ui.tagInput.value = '';
        }
        if (ui.ownerInput) {
            ui.ownerInput.value = '';
        }
        if (ui.tagList) {
            ui.tagList.hidden = true;
        }
        if (ui.ownerList) {
            ui.ownerList.hidden = true;
        }
        commitFilter();
    }

    function onDocumentClick(event) {
        if (!panelOpen) {
            return;
        }
        var button = filterButton();
        if (panelEl && hitNode(panelEl, event)) {
            return;
        }
        if (hitNode(button, event)) {
            return;
        }
        closePanel();
    }

    function onKeyDown(event) {
        if (!panelOpen || event.key !== 'Escape') {
            return;
        }
        closePanel();
    }

    function prepare(events, catalog) {
        allEvents = (events || []).map(cloneEvent);
        indexCatalog(catalog);
        filter = loadFilter();
        return matchingEvents().map(cloneEvent);
    }

    function patchDagColor(dagId, color) {
        allEvents.forEach(function (event) {
            if (eventDagId(event) === dagId) {
                event.backgroundColor = color;
            }
        });
    }

    function init(calendar) {
        boundCalendar = calendar;
        ensurePanel();
        ensureEmptyState();
        syncPanelFields();
        updateEmptyState(matchingEvents().length);
        updateToolbar();

        document.addEventListener('click', onToolbarClick, true);
        document.addEventListener('mousedown', onDocumentClick);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', function () {
            if (panelOpen) {
                positionPanel();
            }
        });

        if (calendar && typeof calendar.on === 'function') {
            calendar.on('datesSet', function () {
                updateToolbar();
                if (panelOpen) {
                    positionPanel();
                }
            });
        }
    }

    global.AirflowCalendarFilter = {
        prepare: prepare,
        init: init,
        togglePanel: togglePanel,
        buttonLabel: buttonLabel,
        patchDagColor: patchDagColor,
    };
}(window));
