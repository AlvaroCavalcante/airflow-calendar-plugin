import os

_STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')
_STYLE_FILES = ('calendar_modal.css', 'calendar_colors.css')


def load_modal_styles():
    parts = []
    for name in _STYLE_FILES:
        path = os.path.join(_STATIC_DIR, name)
        with open(path, encoding='utf-8') as handle:
            parts.append(handle.read())
    return '\n'.join(parts)
