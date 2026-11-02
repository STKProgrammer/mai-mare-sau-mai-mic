"""
Adauga ?v=<versiune> la referintele locale catre .js / .css / .json din HTML si din modulele JS,
ca browserul sa nu amestece fisiere vechi din cache cu cele noi.

Folosit de:
  - workflow-ul de publicare:  python tools/cache_bust.py web <commit>   (modifica fisierele pe loc, in CI)
  - serve.py, la fiecare cerere, cu versiunea = momentul pornirii serverului
"""

import re
import sys
from pathlib import Path

# src="js/x.js", href="css/x.css" in HTML
HTML_REF = re.compile(r'((?:src|href)=")((?!https?:|//)[^"?#]+\.(?:js|css))(")')
# import ... from './x.js' / import('./x.js') / loadJSON('data/x.json') in JS
JS_REF = re.compile(r"""((?:from\s+|import\s*\(\s*|loadJSON\(\s*)['"])((?:\./|\.\./|data/)[^'"?#]+\.(?:js|json))(['"])""")


def bust(text: str, suffix: str, version: str) -> tuple[str, int]:
    pattern = HTML_REF if suffix == ".html" else JS_REF
    return pattern.subn(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(3)}", text)


def applies_to(path: Path) -> bool:
    return path.suffix in (".html", ".js") and "vendor" not in path.parts


def main():
    root, version = Path(sys.argv[1]), sys.argv[2]
    count = 0
    for path in root.rglob("*"):
        if not applies_to(path):
            continue
        new, n = bust(path.read_text(encoding="utf-8"), path.suffix, version)
        if n:
            path.write_text(new, encoding="utf-8")
            count += n
            print(f"{path}: {n}")
    print(f"total: {count} referinte versionate cu v={version}")


if __name__ == "__main__":
    main()
