import json
from functools import lru_cache
from pathlib import Path

from django import template
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

ICONS_FILE = Path(__file__).resolve().parent.parent / 'icons' / 'lucide.json'


@lru_cache(maxsize=1)
def _icon_set():
    with open(ICONS_FILE, encoding='utf-8') as fh:
        return json.load(fh)


def _resolve(name):
    data = _icon_set()
    seen = set()
    while name not in data['icons']:
        alias = data.get('aliases', {}).get(name)
        if not alias or name in seen:
            return None
        seen.add(name)
        name = alias['parent']
    return data['icons'][name]


@register.simple_tag
def icon(name, size=20, css_class=''):
    """Renderiza un ícono Lucide como SVG en línea: {% icon "receipt" 18 "nav-icon" %}."""
    name = name.split(':', 1)[1] if ':' in name else name
    found = _resolve(name)
    if found is None:
        return ''
    data = _icon_set()
    w = found.get('width', data.get('width', 24))
    h = found.get('height', data.get('height', 24))
    cls = f' class="{escape(css_class)}"' if css_class else ''
    return mark_safe(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {w} {h}"{cls} data-icon="{escape(name)}">{found["body"]}</svg>'
    )
