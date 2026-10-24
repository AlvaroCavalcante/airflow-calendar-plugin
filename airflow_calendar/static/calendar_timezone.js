(function (global) {
    const MODE_KEY = 'airflow-calendar-tz-mode';
    const AF3_KEY = 'timezone';
    const AF2_KEY = 'selected-timezone';

    const MODE_AIRFLOW = 'airflow';
    const MODE_UTC = 'UTC';
    const MODE_LOCAL = 'local';

    var boundCalendar = null;
    var menuEl = null;
    var menuOpen = false;
    var toggleLocked = false;

    function readStorage(storage, key) {
        try {
            return storage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) { /* ignore */ }
    }

    function parseStoredTimezone(raw) {
        if (!raw) {
            return null;
        }
        try {
            var parsed = JSON.parse(raw);
            if (typeof parsed === 'string' && parsed) {
                return parsed;
            }
        } catch (e) { /* Airflow 2 stores a plain IANA name */ }
        return raw;
    }

    function airflowTimezoneFrom(storage) {
        if (!storage) {
            return null;
        }
        return parseStoredTimezone(
            readStorage(storage, AF3_KEY) || readStorage(storage, AF2_KEY)
        );
    }

    function readAirflowTimezone() {
        var tz = airflowTimezoneFrom(localStorage);
        if (tz) {
            return tz;
        }
        try {
            if (window.parent && window.parent !== window) {
                tz = airflowTimezoneFrom(window.parent.localStorage);
                if (tz) {
                    return tz;
                }
            }
        } catch (e) { /* cross-origin iframe */ }
        return 'UTC';
    }

    function getMode() {
        var mode = readStorage(localStorage, MODE_KEY);
        if (mode === MODE_UTC || mode === MODE_LOCAL || mode === MODE_AIRFLOW) {
            return mode;
        }
        return MODE_AIRFLOW;
    }

    function setMode(mode) {
        writeStorage(MODE_KEY, mode);
    }

    function browserTimeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (e) {
            return '';
        }
    }

    function resolveTimeZone(mode) {
        var selected = mode || getMode();
        if (selected === MODE_UTC) {
            return 'UTC';
        }
        if (selected === MODE_LOCAL) {
            return 'local';
        }
        var tz = readAirflowTimezone();
        if (!tz || tz === 'local') {
            return 'local';
        }
        return tz;
    }

    function toFullCalendarTimeZone(tz) {
        if (!tz || tz === 'local') {
            return 'local';
        }
        if (tz === 'UTC' || tz === 'utc' || tz === 'Etc/UTC' || tz === 'GMT') {
            return 'UTC';
        }
        var localName = browserTimeZone();
        if (localName && tz === localName) {
            return 'local';
        }
        return tz;
    }

    function formatDate(value) {
        if (!value) {
            return '---';
        }
        var date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) {
            return String(value);
        }
        var tz = resolveTimeZone();
        var options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        };
        if (tz === 'local') {
            return date.toLocaleString(undefined, options);
        }
        try {
            options.timeZone = tz === 'utc' ? 'UTC' : tz;
            return new Intl.DateTimeFormat(undefined, options).format(date);
        } catch (e) {
            return date.toLocaleString(undefined, options);
        }
    }

    function shortZoneName(tz) {
        if (!tz || tz === 'local') {
            return shortZoneName(browserTimeZone()) || 'Local';
        }
        if (tz === 'UTC' || tz === 'utc' || tz === 'Etc/UTC' || tz === 'GMT') {
            return 'UTC';
        }
        var parts = String(tz).split('/');
        return (parts[parts.length - 1] || tz).replace(/_/g, ' ');
    }

    function buttonLabel() {
        return shortZoneName(resolveTimeZone());
    }

    function timezoneButton() {
        return document.querySelector('.fc-timezone-button');
    }

    function ensureMenu() {
        if (menuEl) {
            return menuEl;
        }
        menuEl = document.createElement('div');
        menuEl.className = 'calendar-tz-menu';
        menuEl.hidden = true;
        menuEl.setAttribute('role', 'menu');
        [
            { mode: MODE_AIRFLOW, label: 'Airflow UI' },
            { mode: MODE_UTC, label: 'UTC' },
            { mode: MODE_LOCAL, label: 'Local' },
        ].forEach(function (item) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'calendar-tz-option';
            option.setAttribute('role', 'menuitemradio');
            option.dataset.mode = item.mode;
            option.textContent = item.label;
            option.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                setMode(item.mode);
                applyToCalendar(boundCalendar);
                closeMenu();
            });
            menuEl.appendChild(option);
        });
        document.body.appendChild(menuEl);
        return menuEl;
    }

    function syncMenuState() {
        if (!menuEl) {
            return;
        }
        var mode = getMode();
        var options = menuEl.querySelectorAll('.calendar-tz-option');
        for (var i = 0; i < options.length; i++) {
            var selected = options[i].dataset.mode === mode;
            options[i].classList.toggle('is-active', selected);
            options[i].setAttribute('aria-checked', selected ? 'true' : 'false');
        }
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
        syncMenuState();
        var btn = timezoneButton();
        if (!btn) {
            return;
        }
        var label = buttonLabel();
        if (btn.textContent !== label) {
            btn.textContent = label;
        }
        btn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
        btn.classList.toggle('fc-button-active', menuOpen);
    }

    function positionMenu() {
        var btn = timezoneButton();
        var menu = ensureMenu();
        if (!btn) {
            return;
        }
        var rect = btn.getBoundingClientRect();
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = Math.max(8, rect.left) + 'px';
    }

    function openMenu() {
        ensureMenu();
        menuOpen = true;
        menuEl.hidden = false;
        positionMenu();
        updateToolbar();
    }

    function closeMenu() {
        menuOpen = false;
        if (menuEl) {
            menuEl.hidden = true;
        }
        updateToolbar();
    }

    function toggleMenu() {
        if (toggleLocked) {
            return;
        }
        toggleLocked = true;
        setTimeout(function () {
            toggleLocked = false;
        }, 0);
        if (menuOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    function onToolbarClick(event) {
        if (!hitNode(timezoneButton(), event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
    }

    function applyToCalendar(calendar) {
        if (!calendar) {
            return;
        }
        var fcTz = toFullCalendarTimeZone(resolveTimeZone());
        try {
            calendar.setOption('timeZone', fcTz);
        } catch (e) {
            calendar.setOption('timeZone', 'UTC');
        }
        updateToolbar();
    }

    function onAirflowTimezoneChange() {
        if (getMode() !== MODE_AIRFLOW) {
            updateToolbar();
            return;
        }
        applyToCalendar(boundCalendar);
    }

    function onDocumentClick(event) {
        if (!menuOpen) {
            return;
        }
        var btn = timezoneButton();
        if (menuEl && hitNode(menuEl, event)) {
            return;
        }
        if (hitNode(btn, event)) {
            return;
        }
        closeMenu();
    }

    function init(calendar) {
        boundCalendar = calendar;
        ensureMenu();
        updateToolbar();

        document.addEventListener('timezone', onAirflowTimezoneChange);
        document.addEventListener('click', onToolbarClick, true);
        document.addEventListener('mousedown', onDocumentClick);
        window.addEventListener('resize', function () {
            if (menuOpen) {
                positionMenu();
            }
        });
        try {
            if (window.jQuery) {
                window.jQuery(document.body).on('airflow.timezone-change', onAirflowTimezoneChange);
            }
        } catch (e) { /* ignore */ }

        window.addEventListener('storage', function (evt) {
            if (evt.key === AF3_KEY || evt.key === AF2_KEY) {
                onAirflowTimezoneChange();
            }
        });

        if (calendar && typeof calendar.on === 'function') {
            calendar.on('datesSet', updateToolbar);
        }

        applyToCalendar(calendar);
    }

    global.AirflowCalendarTimezone = {
        initial: function () {
            return toFullCalendarTimeZone(resolveTimeZone());
        },
        buttonLabel: buttonLabel,
        formatDate: formatDate,
        toggleMenu: toggleMenu,
        init: init,
        resolve: resolveTimeZone,
    };
}(window));
