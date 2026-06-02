import json
import logging
import os
import re

log = logging.getLogger(__name__)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
VARIABLE_KEY = 'airflow_calendar_dag_colors'

# Google Calendar default event color (Peacock)
DEFAULT_BG_COLOR = '#039BE5'
LEGACY_DEFAULT_BG_COLOR = '#3788d8'

COLOR_PALETTE = (
    '#D50000', '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#0B8043',
    '#039BE5', '#3F51B5', '#7986CB', '#8E24AA', '#616161',
)

_HEX_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')

# Cached after first use: 'variable' or 'file'
_storage_backend = None


def _sanitize_colors(data):
    if not isinstance(data, dict):
        return {}
    return {
        dag_id: str(color).strip().upper()
        for dag_id, color in data.items()
        if isinstance(dag_id, str)
        and _HEX_COLOR_RE.match(str(color).strip().upper())
        and str(color).strip().upper() in COLOR_PALETTE
    }


def _colors_file_path():
    env_path = os.environ.get('AIRFLOW_CALENDAR_COLORS_FILE')
    if env_path:
        return env_path
    airflow_home = os.environ.get('AIRFLOW_HOME')
    if airflow_home:
        return os.path.join(
            airflow_home, 'data', 'airflow_calendar', 'dag_colors.json')
    return os.path.join(CURRENT_DIR, 'data', 'dag_colors.json')


def _file_is_writable():
    colors_file = _colors_file_path()
    directory = os.path.dirname(colors_file)
    try:
        os.makedirs(directory, exist_ok=True)
        with open(colors_file, 'a', encoding='utf-8'):
            pass
        return True
    except OSError:
        return False


def _resolve_storage_backend():
    """Pick one backend: file when writable locally, else Airflow Variable."""
    global _storage_backend
    if _storage_backend is not None:
        return _storage_backend

    forced = os.environ.get('AIRFLOW_CALENDAR_STORAGE', '').lower()
    if forced == 'file':
        _storage_backend = 'file'
    elif forced == 'variable':
        _storage_backend = 'variable'
    elif _file_is_writable():
        _storage_backend = 'file'
    else:
        _storage_backend = 'variable'

    log.debug('DAG colors storage backend: %s', _storage_backend)
    return _storage_backend


def _load_colors_from_file():
    colors_file = _colors_file_path()
    if not os.path.exists(colors_file):
        return {}
    try:
        with open(colors_file, 'r', encoding='utf-8') as handle:
            return _sanitize_colors(json.load(handle))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning('Could not read DAG colors file %s: %s', colors_file, exc)
        return {}


def _save_colors_to_file(colors):
    colors_file = _colors_file_path()
    os.makedirs(os.path.dirname(colors_file), exist_ok=True)
    with open(colors_file, 'w', encoding='utf-8') as handle:
        json.dump(colors, handle, indent=2, sort_keys=True)


def _load_colors_from_variable():
    from airflow.models import Variable

    try:
        raw = Variable.get(VARIABLE_KEY, default_var=None)
    except Exception as exc:
        log.warning('Could not read DAG colors variable: %s', exc)
        return {}

    if raw is None:
        return {}

    if isinstance(raw, dict):
        return _sanitize_colors(raw)

    if isinstance(raw, str):
        try:
            return _sanitize_colors(json.loads(raw))
        except json.JSONDecodeError:
            return {}

    return {}


def _save_colors_to_variable(colors):
    from airflow.models import Variable

    Variable.set(VARIABLE_KEY, colors, serialize_json=True)


def _load_from_backend(backend):
    if backend == 'file':
        return _load_colors_from_file()
    return _load_colors_from_variable()


def _save_to_backend(backend, colors):
    if backend == 'file':
        _save_colors_to_file(colors)
    else:
        _save_colors_to_variable(colors)


def load_dag_colors():
    backend = _resolve_storage_backend()
    colors = _load_from_backend(backend)

    # One-time merge if the inactive backend still has data (e.g. after migration).
    other = 'variable' if backend == 'file' else 'file'
    legacy = _load_from_backend(other)
    if legacy:
        merged = {**legacy, **colors}
        if merged != colors:
            try:
                _save_to_backend(backend, merged)
                colors = merged
            except Exception as exc:
                log.warning(
                    'Could not migrate DAG colors to %s: %s', backend, exc)
                colors = merged

    return colors


def save_dag_color(dag_id, color):
    if not dag_id or not isinstance(dag_id, str):
        raise ValueError('Invalid dag_id')
    if not isinstance(color, str):
        raise ValueError('Invalid color')
    color = color.strip().upper()
    if not _HEX_COLOR_RE.match(color) or color not in COLOR_PALETTE:
        raise ValueError('Invalid color')

    backend = _resolve_storage_backend()
    colors = _load_from_backend(backend)
    colors[dag_id] = color

    try:
        _save_to_backend(backend, colors)
    except Exception as exc:
        log.warning('Could not save DAG colors via %s: %s', backend, exc)
        raise ValueError(
            'Could not persist DAG colors. On Cloud Composer, ensure the '
            'webserver can write Airflow Variables or set '
            'AIRFLOW_CALENDAR_COLORS_FILE to a writable path.'
        ) from exc

    return color


def get_dag_color(dag_id, colors=None):
    if colors is None:
        colors = load_dag_colors()
    color = colors.get(dag_id, DEFAULT_BG_COLOR)
    if color == LEGACY_DEFAULT_BG_COLOR:
        return DEFAULT_BG_COLOR
    return color
