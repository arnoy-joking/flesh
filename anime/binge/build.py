#!/usr/bin/env python3
"""Bundle Anime Class Player into a single portable HTML file."""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / 'Anime-Class-Player.html'

MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'}

def inline_css_assets(css: str) -> str:
    def repl(m):
        ref = m.group(2).strip('\'"')
        p = ROOT / ref
        if not p.exists():
            return m.group(0)
        mime = MIME.get(p.suffix.lower(), 'application/octet-stream')
        b64 = base64.b64encode(p.read_bytes()).decode()
        return f'url("data:{mime};base64,{b64}")'
    return re.sub(r'url\((?!["\']?data:)(["\']?)([^"\')]+)\1\)', repl, css)

def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    js1 = (ROOT / 'app.js').read_text(encoding='utf-8')
    js2 = (ROOT / 'ui.js').read_text(encoding='utf-8')

    css = inline_css_assets(css)

    link_tag = '<link rel="stylesheet" href="style.css">'
    script1 = '<script src="app.js"></script>'
    script2 = '<script src="ui.js"></script>'
    for tag in (link_tag, script1, script2):
        if tag not in html:
            print(f'ERROR: expected tag not found in index.html: {tag}', file=sys.stderr)
            sys.exit(1)

    banner = '<!-- Anime Class Player — single-file build. Works offline (except the YouTube stream itself). -->\n'
    html = html.replace(link_tag, '<style>\n' + css + '\n</style>')
    html = html.replace(script1, '<script>\n' + js1 + '\n</script>')
    html = html.replace(script2, '<script>\n' + js2 + '\n</script>')
    html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + banner)

    OUT.write_text(html, encoding='utf-8')
    size = OUT.stat().st_size
    print(f'built {OUT.name}: {size/1024:.0f} KB')
    # sanity checks
    assert 'src="app.js"' not in html and 'src="ui.js"' not in html and 'href="style.css"' not in html
    assert 'data:image/jpeg;base64,' in html, 'hero image not inlined'
    print('sanity checks passed')

if __name__ == '__main__':
    main()
