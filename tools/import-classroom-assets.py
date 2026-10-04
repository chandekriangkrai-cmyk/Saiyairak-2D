#!/usr/bin/env python3
"""Import the CC0 classroom asset ZIP into the web public asset tree.

Usage: python tools/import-classroom-assets.py /path/to/2dClassroomAssetPackByStyloo.zip
"""
from __future__ import annotations
import hashlib, json, os, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "metaverse/apps/web/public/assets/classroom-v2/source"
MANIFEST = ROOT / "metaverse/apps/web/public/assets/classroom-v2/manifest.json"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python tools/import-classroom-assets.py /path/to/2dClassroomAssetPackByStyloo.zip")
        return 2
    archive = Path(sys.argv[1]).expanduser().resolve()
    if not archive.is_file():
        print(f"ERROR: asset archive not found: {archive}")
        return 2
    if archive.read_bytes()[:4] != b"PK\x03\x04":
        print("ERROR: this is not a ZIP archive. Download the actual 103 MB ZIP, not the itch.io HTML page.")
        return 2
    with zipfile.ZipFile(archive) as zf:
        files = [i for i in zf.infolist() if not i.is_dir()]
        pngs = [i for i in files if i.filename.lower().endswith(".png")]
        if not pngs:
            print("ERROR: ZIP contains no PNG assets")
            return 2
        DEST.mkdir(parents=True, exist_ok=True)
        for info in pngs:
            rel = Path(info.filename)
            if rel.is_absolute() or ".." in rel.parts:
                print(f"ERROR: unsafe archive path: {info.filename}")
                return 2
            target = DEST / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open("wb") as dst:
                dst.write(src.read())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = {
        "source": "2D School Classroom Asset Pack by styloo",
        "license": "CC0 1.0 Universal",
        "archive": archive.name,
        "sha256": digest,
        "png_count": len(pngs),
        "asset_root": "/assets/classroom-v2/source",
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(pngs)} PNG files into {DEST}")
    print(f"Manifest: {MANIFEST}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
