#!/usr/bin/env python3
"""Cross-check: every #id referenced in JS exists in index.html; warn on CSS classes used in JS but missing from style.css."""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'style.css').read_text(encoding='utf-8')
js = (ROOT / 'app.js').read_text(encoding='utf-8') + '\n' + (ROOT / 'ui.js').read_text(encoding='utf-8')

html_ids = set(re.findall(r'id="([\w-]+)"', html))

# ids referenced via $('#x'), $$('#x'), "#x" strings, getElementById('x')
used_ids = set(re.findall(r"""[\$]{1,2}\(\s*['"]#([\w-]+)['"]""", js))
used_ids |= set(re.findall(r"""querySelector\(\s*['"]#([\w-]+)['"]""", js))
used_ids |= set(re.findall(r"""getElementById\(\s*['"]([\w-]+)['"]""", js))
used_ids |= set(re.findall(r"""\[\s*'#([\w-]+)'\s*\]""", js))
# also ids referenced inside selector strings like '#ov-clear' in arrays
for m in re.findall(r"""['"](#([\w-]+)(?:,\s*#[\w-]+)*)['"]""", js):
    used_ids |= set(re.findall(r'#([\w-]+)', m[0]))
used_ids |= set(re.findall(r"""['"]#([\w-]+)['"]""", js))

missing = sorted(i for i in used_ids if i not in html_ids)
print('── ID audit ──')
if missing:
    print('MISSING IDS (used in JS, not in HTML):')
    for i in missing: print('  -', i)
else:
    print(f'all {len(used_ids)} referenced ids exist in HTML ✓')

# CSS classes used in JS (classList.toggle/add, className=, el('div','cls'), template class="...")
js_classes = set()
for m in re.findall(r"""classList\.(?:add|toggle|remove)\(\s*['"]([\w -]+)['"]""", js):
    for c in m.split(): js_classes.add(c)
for m in re.findall(r"""el\(\s*['"]\w+['"]\s*,\s*['"]([\w -]+)['"]""", js):
    for c in m.split(): js_classes.add(c)
for m in re.findall(r'class="([\w -]+)"', js):
    for c in m.split(): js_classes.add(c)
for m in re.findall(r"""className\s*=\s*['"]([\w -]+)['"]""", js):
    for c in m.split(): js_classes.add(c)
css_classes = set(re.findall(r'\.([A-Za-z_][\w-]*)', css))
# classes that are state toggles with CSS rules may include compound; just check membership
missing_css = sorted(c for c in js_classes if c not in css_classes)
print('── CSS class audit ──')
if missing_css:
    print('classes used in JS with no CSS rule (may be fine if purely stateful):')
    for c in missing_css: print('  -', c)
else:
    print('all JS-referenced classes styled ✓')

unused_html_ids = sorted(i for i in html_ids if i not in used_ids)
print('── unused HTML ids (informational) ──')
print(', '.join(unused_html_ids) if unused_html_ids else 'none')
