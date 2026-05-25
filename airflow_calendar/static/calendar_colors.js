(function (global) {
    const DEFAULT_COLOR = '#3788d8';

    const PALETTE = [
        '#D50000', '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#0B8043',
        '#039BE5', '#3F51B5', '#7986CB', '#8E24AA', '#616161',
    ];

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

        // Colors are already applied server-side when events are built.
        // Only load the map here for the picker UI (avoid setProp on every event).
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

        function persistColor(dagId, color) {
            return fetch(apiBase + '/' + encodeURIComponent(dagId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color: color }),
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
            persistColor(activeDagId, color)
                .then(function () {
                    dagColors[activeDagId] = color;
                    applyColorToDag(calendar, activeDagId, color);
                    renderPicker(pickerEl, color, selectColor);
                })
                .catch(function (error) {
                    console.warn('Could not save DAG color:', error);
                });
        }

        return {
            openForDag: function (dagId) {
                activeDagId = dagId;
                if (!pickerEl) {
                    return;
                }
                const current = dagColors[dagId] || DEFAULT_COLOR;
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
