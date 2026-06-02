(function (global) {
    const DEFAULT_COLOR = '#039BE5';
    const LEGACY_DEFAULT_COLOR = '#3788d8';

    const PALETTE = [
        '#D50000', '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#0B8043',
        '#039BE5', '#3F51B5', '#7986CB', '#8E24AA', '#616161',
    ];

    function resolveDagColor(storedColor, eventColor) {
        if (storedColor && storedColor !== LEGACY_DEFAULT_COLOR && PALETTE.indexOf(storedColor) >= 0) {
            return storedColor;
        }
        if (eventColor && eventColor !== LEGACY_DEFAULT_COLOR && PALETTE.indexOf(eventColor) >= 0) {
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

    function renderPicker(container, selectedColor, onSelect) {
        container.innerHTML = '';
        PALETTE.forEach(function (color) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'dag-color-swatch';
            button.style.backgroundColor = color;
            button.setAttribute('aria-label', 'Color ' + color);
            if (color === selectedColor) {
                button.classList.add('selected');
                button.setAttribute('aria-selected', 'true');
            }
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                onSelect(color);
            });
            container.appendChild(button);
        });
    }

    function init(calendar, apiBase) {
        const pickerEl = document.getElementById('dagColorPicker');
        let dagColors = {};
        let activeDagId = null;
        let pendingSave = null;

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
            if (!activeDagId || !pickerEl) {
                return;
            }

            const dagId = activeDagId;
            const previousColor = resolveDagColor(dagColors[dagId], null);

            if (color === previousColor) {
                return;
            }

            // Optimistic update: UI changes immediately, persistence runs in background.
            dagColors[dagId] = color;
            renderPicker(pickerEl, color, selectColor);
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
                        renderPicker(pickerEl, previousColor, selectColor);
                    }
                    applyColorToDag(calendar, dagId, previousColor);
                })
                .finally(function () {
                    pendingSave = null;
                });
        }

        return {
            openForDag: function (dagId, eventColor) {
                activeDagId = dagId;
                if (!pickerEl) {
                    return;
                }
                const current = resolveDagColor(dagColors[dagId], eventColor);
                renderPicker(pickerEl, current, selectColor);
            },
        };
    }

    global.AirflowCalendarColors = {
        init: init,
        PALETTE: PALETTE,
        DEFAULT_COLOR: DEFAULT_COLOR,
    };
}(window));
