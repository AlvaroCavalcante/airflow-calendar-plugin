(function (global) {
    const DEFAULT_COLOR = '#039BE5';
    const LEGACY_DEFAULT_COLOR = '#3788d8';

    const PALETTE = [
        { color: '#D50000', name: 'Tomato' },
        { color: '#E67C73', name: 'Flamingo' },
        { color: '#F4511E', name: 'Orange' },
        { color: '#F6BF26', name: 'Banana' },
        { color: '#33B679', name: 'Sage' },
        { color: '#0B8043', name: 'Basil' },
        { color: '#039BE5', name: 'Peacock' },
        { color: '#3F51B5', name: 'Blueberry' },
        { color: '#7986CB', name: 'Lavender' },
        { color: '#8E24AA', name: 'Grape' },
        { color: '#616161', name: 'Graphite' },
    ];

    const COLOR_HEXES = PALETTE.map(function (entry) { return entry.color; });

    function colorName(hex) {
        const entry = PALETTE.find(function (item) { return item.color === hex; });
        return entry ? entry.name : 'Custom';
    }

    function resolveDagColor(storedColor, eventColor) {
        if (storedColor && storedColor !== LEGACY_DEFAULT_COLOR && COLOR_HEXES.indexOf(storedColor) >= 0) {
            return storedColor;
        }
        if (eventColor && eventColor !== LEGACY_DEFAULT_COLOR && COLOR_HEXES.indexOf(eventColor) >= 0) {
            return eventColor;
        }
        return DEFAULT_COLOR;
    }

    function applyColorToDag(calendar, dagId, color) {
        const apply = function () {
            calendar.getEvents().forEach(function (event) {
                if (event.extendedProps.dag_id !== dagId) {
                    return;
                }
                if (event.backgroundColor === color) {
                    return;
                }
                event.setProp('backgroundColor', color);
            });
        };

        if (typeof calendar.batchRendering === 'function') {
            calendar.batchRendering(apply);
        } else {
            apply();
        }
    }

    function initColorDropdown(onSelect) {
        const trigger = document.getElementById('dagColorTrigger');
        const menu = document.getElementById('dagColorMenu');
        const preview = document.getElementById('dagColorPreview');
        const label = document.getElementById('dagColorLabel');

        if (!trigger || !menu) {
            return { updateUI: function () {}, close: function () {} };
        }

        menu.innerHTML = '';
        PALETTE.forEach(function (entry) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'dag-color-option';
            button.setAttribute('role', 'option');
            button.dataset.color = entry.color;

            const swatch = document.createElement('span');
            swatch.className = 'dag-color-option-swatch';
            swatch.style.backgroundColor = entry.color;

            const name = document.createElement('span');
            name.className = 'dag-color-option-name';
            name.textContent = entry.name;

            button.appendChild(swatch);
            button.appendChild(name);
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                onSelect(entry.color);
                closeMenu();
            });
            menu.appendChild(button);
        });

        function closeMenu() {
            menu.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        function openMenu() {
            menu.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        closeMenu();

        trigger.addEventListener('click', function (event) {
            event.stopPropagation();
            if (menu.classList.contains('is-open')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        menu.addEventListener('click', function (event) {
            event.stopPropagation();
        });

        document.addEventListener('click', function () {
            closeMenu();
        });

        function updateUI(selectedColor) {
            preview.style.backgroundColor = selectedColor;
            label.textContent = colorName(selectedColor);
            menu.querySelectorAll('.dag-color-option').forEach(function (option) {
                const isSelected = option.dataset.color === selectedColor;
                option.classList.toggle('selected', isSelected);
                option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }

        return { updateUI: updateUI, close: closeMenu };
    }

    function init(calendar, apiBase) {
        let dagColors = {};
        let activeDagId = null;
        let pendingSave = null;
        let dropdown = null;

        fetch(apiBase)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                dagColors = data || {};
            })
            .catch(function (error) {
                console.warn('Could not load DAG colors:', error);
            });

        function persistColor(dagId, color, signal) {
            return fetch(apiBase + '/' + encodeURIComponent(dagId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color: color }),
                signal: signal,
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('Failed to save color');
                }
                return response.json();
            });
        }

        function selectColor(color) {
            if (!activeDagId) {
                return;
            }

            const dagId = activeDagId;
            const previousColor = resolveDagColor(dagColors[dagId], null);

            if (color === previousColor) {
                return;
            }

            dagColors[dagId] = color;
            dropdown.updateUI(color);
            applyColorToDag(calendar, dagId, color);

            if (pendingSave) {
                pendingSave.abort();
            }
            pendingSave = new AbortController();

            persistColor(dagId, color, pendingSave.signal)
                .catch(function (error) {
                    if (error.name === 'AbortError') {
                        return;
                    }
                    console.warn('Could not save DAG color:', error);
                    dagColors[dagId] = previousColor;
                    if (activeDagId === dagId) {
                        dropdown.updateUI(previousColor);
                    }
                    applyColorToDag(calendar, dagId, previousColor);
                })
                .finally(function () {
                    pendingSave = null;
                });
        }

        dropdown = initColorDropdown(selectColor);

        return {
            openForDag: function (dagId, eventColor) {
                activeDagId = dagId;
                dropdown.close();
                const current = resolveDagColor(dagColors[dagId], eventColor);
                dropdown.updateUI(current);
            },
        };
    }

    global.AirflowCalendarColors = {
        init: init,
        PALETTE: COLOR_HEXES,
        DEFAULT_COLOR: DEFAULT_COLOR,
    };
}(window));
