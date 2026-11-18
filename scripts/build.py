#!/usr/bin/env python3
"""
Builds store-ready packages for Chrome and Firefox from the single source manifest.json.

    python scripts/build.py

Output (dist/ is git-ignored):
    dist/chrome/                                  unpacked Chrome build (Load unpacked)
    dist/firefox/                                 unpacked Firefox build (about:debugging)
    dist/workspace-link-copier-chrome-<ver>.zip   upload to the Chrome Web Store
    dist/workspace-link-copier-firefox-<ver>.zip  upload to addons.mozilla.org (AMO)

manifest.json stays Chrome-clean (Chrome warns about unknown keys); the Firefox manifest is
derived from it here, so the two can never drift apart.
Uses only the Python standard library. Zip entries always use forward slashes, which AMO requires.
"""

import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# Everything the extension needs at runtime; nothing else goes into a package.
PACKAGE_DIRS = ["src", "styles", "icons"]
PACKAGE_EXCLUDE_SUFFIXES = {".svg"}  # icons/icon.svg is design source, not used at runtime

FIREFOX_ID = "workspace-link-copier@sgagankumar.dev"
FIREFOX_MIN_VERSION = "128.0"  # first Firefox with "world": "MAIN" in manifest content_scripts


def firefox_manifest(chrome: dict) -> dict:
    manifest = {k: v for k, v in chrome.items() if k != "minimum_chrome_version"}
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": FIREFOX_ID,
            "strict_min_version": FIREFOX_MIN_VERSION,
            # Required by AMO for new add-ons: this extension collects and transmits nothing.
            "data_collection_permissions": {"required": ["none"]},
        }
    }
    return manifest


def package_files():
    for name in PACKAGE_DIRS:
        for path in sorted((ROOT / name).rglob("*")):
            if path.is_file() and path.suffix.lower() not in PACKAGE_EXCLUDE_SUFFIXES:
                yield path


def build(target: str, manifest: dict, version: str) -> Path:
    out_dir = DIST / target
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    (out_dir / "manifest.json").write_text(manifest_text, encoding="utf-8")
    for src in package_files():
        dest = out_dir / src.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)

    zip_path = DIST / f"workspace-link-copier-{target}-{version}.zip"
    zip_path.unlink(missing_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(p for p in out_dir.rglob("*") if p.is_file()):
            zf.write(path, path.relative_to(out_dir).as_posix())
    return zip_path


def check_icons(manifest: dict) -> None:
    missing = [p for p in manifest.get("icons", {}).values() if not (ROOT / p).is_file()]
    for script in manifest.get("content_scripts", []):
        missing += [p for p in script.get("js", []) + script.get("css", []) if not (ROOT / p).is_file()]
    if missing:
        sys.exit(f"Missing files referenced by manifest.json: {', '.join(missing)}")


def main() -> None:
    chrome = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    check_icons(chrome)
    version = chrome["version"]
    DIST.mkdir(exist_ok=True)

    for target, manifest in (("chrome", chrome), ("firefox", firefox_manifest(chrome))):
        zip_path = build(target, manifest, version)
        size_kb = zip_path.stat().st_size / 1024
        print(f"{target:8} dist/{target}/  +  dist/{zip_path.name}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
