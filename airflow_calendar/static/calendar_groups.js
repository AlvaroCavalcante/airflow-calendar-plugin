(function (global) {
    var GROUP_MIN = 8;
    var FILL = '#546e7a';

    var STATUS_ORDER = ['failed', 'running', 'queued', 'success', 'no_run'];
    var STATUS_BORDER = {
        failed: '#dc3545',
        running: '#017cee',
        queued: '#808080',
        success: '#28a745',
        no_run: '#808080'
    };

    var listEl = null;
    var listOpen = false;
    var openMember = null;

    function memberId(event) {
        var props = event && event.extendedProps;
        if (props && props.dag_id) {
            return props.dag_id;
        }
        return (event && event.title) || '';
    }

    function memberStatus(event) {
        var props = event && event.extendedProps;
        return (props && props.status) || 'no_run';
    }

    function statusColor(status) {
        return STATUS_BORDER[status] || STATUS_BORDER.no_run;
    }

    function worstStatus(counts) {
        for (var i = 0; i < STATUS_ORDER.length; i++) {
            if (counts[STATUS_ORDER[i]]) {
                return STATUS_ORDER[i];
            }
        }
        return 'no_run';
    }

    function countLabel(count) {
        return count === 1 ? '1 DAG' : count + ' DAGs';
    }

    function failedLabel(count) {
        return count === 1 ? '1 failed' : count + ' failed';
    }

    function eventEnd(event) {
        return (event && (event.end || event.start)) || '';
    }

    function buildGroup(members) {
        var sorted = members.slice().sort(function (a, b) {
            return memberId(a).localeCompare(memberId(b));
        });
        var counts = {};
        var end = eventEnd(sorted[0]);
        sorted.forEach(function (event) {
            var status = memberStatus(event);
            counts[status] = (counts[status] || 0) + 1;
            var candidate = eventEnd(event);
            if (String(candidate) > String(end)) {
                end = candidate;
            }
        });
        var worst = worstStatus(counts);
        return {
            title: countLabel(sorted.length),
            start: sorted[0].start,
            end: end,
            backgroundColor: FILL,
            borderColor: statusColor(worst),
            textColor: '#ffffff',
            classNames: ['calendar-group-block'],
            extendedProps: {
                grouped: true,
                count: sorted.length,
                statusCounts: counts,
                members: sorted
            }
        };
    }

    function collapse(events) {
        var buckets = {};
        var order = [];
        (events || []).forEach(function (event) {
            var key = event && event.start ? String(event.start) : '';
            if (!key) {
                order.push({ single: event });
                return;
            }
            if (!buckets[key]) {
                buckets[key] = [];
                order.push({ key: key });
            }
            buckets[key].push(event);
        });

        var result = [];
        order.forEach(function (item) {
            if (item.single) {
                result.push(item.single);
                return;
            }
            var members = buckets[item.key];
            if (members.length < GROUP_MIN) {
                members.forEach(function (event) {
                    result.push(event);
                });
                return;
            }
            result.push(buildGroup(members));
        });
        return result;
    }

    function renderContent(arg) {
        var props = arg.event.extendedProps || {};
        var container = document.createElement('div');
        container.className = 'calendar-group-event';

        var title = document.createElement('b');
        title.textContent = countLabel(props.count || 0);
        container.appendChild(title);

        var failed = props.statusCounts && props.statusCounts.failed;
        if (failed) {
            var subtitle = document.createElement('div');
            subtitle.className = 'task-count-badge';
            subtitle.textContent = failedLabel(failed);
            container.appendChild(subtitle);
        }
        return { domNodes: [container] };
    }

    function tooltip(event) {
        var props = event.extendedProps || {};
        var text = countLabel(props.count || 0);
        var failed = props.statusCounts && props.statusCounts.failed;
        if (failed) {
            text += '\n' + failedLabel(failed);
        }
        return text;
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

    function closeList() {
        listOpen = false;
        openMember = null;
        if (listEl) {
            listEl.hidden = true;
        }
    }

    function positionList(jsEvent) {
        if (!listEl) {
            return;
        }
        var x = (jsEvent && jsEvent.clientX) || 16;
        var y = (jsEvent && jsEvent.clientY) || 16;
        var width = listEl.offsetWidth || 280;
        var height = listEl.offsetHeight || 240;
        var left = x + 8;
        var top = y + 8;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, x - width - 8);
        }
        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - height - 8);
        }
        listEl.style.left = left + 'px';
        listEl.style.top = top + 'px';
    }

    function renderRows(members) {
        var title = listEl.querySelector('.calendar-group-title');
        var list = listEl.querySelector('.calendar-group-list');
        title.textContent = countLabel(members.length);
        list.innerHTML = '';
        members.forEach(function (member) {
            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'calendar-group-row';

            var dot = document.createElement('span');
            dot.className = 'calendar-group-dot';
            dot.style.backgroundColor = statusColor(memberStatus(member));

            var name = document.createElement('span');
            name.className = 'calendar-group-id';
            name.textContent = memberId(member);

            row.title = memberStatus(member);
            row.appendChild(dot);
            row.appendChild(name);
            row.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                var open = openMember;
                closeList();
                if (open) {
                    open(member, event);
                }
            });
            list.appendChild(row);
        });
    }

    function ensureList() {
        if (listEl) {
            return listEl;
        }
        listEl = document.createElement('div');
        listEl.className = 'calendar-group-panel';
        listEl.hidden = true;
        listEl.setAttribute('role', 'dialog');
        listEl.setAttribute('aria-label', 'DAGs at this time');

        var title = document.createElement('div');
        title.className = 'calendar-group-title';
        var list = document.createElement('div');
        list.className = 'calendar-group-list';
        listEl.appendChild(title);
        listEl.appendChild(list);
        document.body.appendChild(listEl);

        document.addEventListener('mousedown', function (event) {
            if (!listOpen || hitNode(listEl, event)) {
                return;
            }
            closeList();
        });
        document.addEventListener('keydown', function (event) {
            if (!listOpen || event.key !== 'Escape') {
                return;
            }
            closeList();
        });
        window.addEventListener('resize', function () {
            if (listOpen) {
                closeList();
            }
        });
        return listEl;
    }

    function openList(event, jsEvent, onOpen) {
        var props = (event && event.extendedProps) || {};
        var members = props.members || [];
        ensureList();
        openMember = onOpen;
        renderRows(members);
        listOpen = true;
        listEl.hidden = false;
        positionList(jsEvent);
    }

    global.AirflowCalendarGroups = {
        collapse: collapse,
        renderContent: renderContent,
        tooltip: tooltip,
        openList: openList,
        close: closeList,
    };
}(window));
