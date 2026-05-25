import json
import os
import re

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
COLORS_FILE = os.path.join(CURRENT_DIR, 'data', 'dag_colors.json')

DEFAULT_BG_COLOR = '#3788d8'

COLOR_PALETTE = (
    '#D50000', '#E67C73', '#F4511E', '#F6BF26', '#33B679', '#0B8043',
    '#039BE5', '#3F51B5', '#7986CB', '#8E24AA', '#616161',
)

_HEX_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


def load_dag_colors():
    if not os.path.exists(COLORS_FILE):
        return {}
    try:
        with open(COLORS_FILE, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            return {}
        return {
            dag_id: color
            for dag_id, color in data.items()
            if isinstance(dag_id, str) and _HEX_COLOR_RE.match(str(color))
            and str(color) in COLOR_PALETTE
        }
    except (OSError, json.JSONDecodeError):
        return {}


def save_dag_color(dag_id, color):
    if not dag_id or not isinstance(dag_id, str):
        raise ValueError('Invalid dag_id')
    if not _HEX_COLOR_RE.match(color) or color not in COLOR_PALETTE:
        raise ValueError('Invalid color')
    os.makedirs(os.path.dirname(COLORS_FILE), exist_ok=True)
    colors = load_dag_colors()
    colors[dag_id] = color
    with open(COLORS_FILE, 'w', encoding='utf-8') as handle:
        json.dump(colors, handle, indent=2, sort_keys=True)
    return color


def get_dag_color(dag_id, colors=None):
    if colors is None:
        colors = load_dag_colors()
    return colors.get(dag_id, DEFAULT_BG_COLOR)
