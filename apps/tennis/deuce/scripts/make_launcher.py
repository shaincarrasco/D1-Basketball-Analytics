"""Build the Deuce.app Desktop launcher (custom icon) into dist/.

The app opens an iTerm window running scripts/start.sh (falls back to a background run with a log file
if iTerm isn't installed), which refreshes data when stale, starts the server and opens the dashboard.

Usage: python scripts/make_launcher.py [--project-dir DIR]

DIR defaults to $DEUCE_DIR if set, else $HOME/workspace/Sports-Analytics/apps/tennis/deuce (where the monorepo
checkout lives on the Mac). The path is written into the launcher with $HOME left unexpanded, so it keeps working
if the home folder moves.
"""
from __future__ import annotations

import argparse
import math
import os
import stat
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

DEFAULT_PROJECT_DIR = "$HOME/workspace/Sports-Analytics/apps/tennis/deuce"

NIGHT = (11, 16, 48)
CHALK = (232, 236, 255)
OPTIC = (228, 255, 60)
PLASMA = (255, 79, 216)


def draw_icon(size: int = 1024) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # macOS icon grid: ~824px rounded square inside 1024 canvas
    inset = int(s * 0.098)
    box = (inset, inset, s - inset, s - inset)
    radius = int(s * 0.185)
    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle(box, radius, fill=NIGHT + (255,))

    # court lines, faint chalk
    lines = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    w = max(2, s // 128)
    c = CHALK + (48,)
    x0, y0, x1, y1 = box
    ld.line([(x0, s * 0.62), (x1, s * 0.62)], fill=c, width=w)           # service line
    ld.line([(s * 0.5, s * 0.62), (s * 0.5, y1)], fill=c, width=w)        # centre line
    ld.line([(x0 + s * 0.08, y0), (x0 + s * 0.08, y1)], fill=c, width=w)  # tramline left
    ld.line([(x1 - s * 0.08, y0), (x1 - s * 0.08, y1)], fill=c, width=w)  # tramline right
    # net: plasma
    ld.line([(x0, s * 0.40), (x1, s * 0.40)], fill=PLASMA + (210,), width=w * 2)
    base = Image.alpha_composite(base, lines)

    # optic ball with glow
    cx, cy, r = s * 0.5, s * 0.40, s * 0.17
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - r * 1.5, cy - r * 1.5, cx + r * 1.5, cy + r * 1.5), fill=OPTIC + (110,))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.05))
    base = Image.alpha_composite(base, glow)
    bd = ImageDraw.Draw(base)
    bd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=OPTIC + (255,))
    # felt seams: two arcs
    seam = NIGHT + (255,)
    sw = max(3, s // 64)
    bd.arc((cx - r * 1.9, cy - r * 0.95, cx - r * 0.2, cy + r * 0.95), -50, 50, fill=seam, width=sw)
    bd.arc((cx + r * 0.2, cy - r * 0.95, cx + r * 1.9, cy + r * 0.95), 130, 230, fill=seam, width=sw)

    # clip everything to the rounded square
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius, fill=255)
    img.paste(base, (0, 0), mask)
    return img


LAUNCH_SCRIPT = """#!/bin/bash
PROJECT="{project}"
if [ ! -d "$PROJECT" ]; then
  osascript -e 'display alert "Deuce" message "Project folder not found: {project}"'
  exit 1
fi
if [ -d "/Applications/iTerm.app" ] || [ -d "$HOME/Applications/iTerm.app" ]; then
  osascript <<EOF
tell application "iTerm"
  activate
  set w to (create window with default profile)
  tell current session of w to write text "cd " & quoted form of "$PROJECT" & " && bash scripts/start.sh"
end tell
EOF
else
  mkdir -p "$HOME/Library/Logs"
  cd "$PROJECT" && nohup bash scripts/start.sh > "$HOME/Library/Logs/deuce.log" 2>&1 &
  open "$HOME/Library/Logs/deuce.log"
fi
"""

INFO_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Deuce</string>
  <key>CFBundleDisplayName</key><string>Deuce</string>
  <key>CFBundleIdentifier</key><string>local.deuce.launcher</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Deuce</string>
  <key>CFBundleIconFile</key><string>Deuce</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-dir", default=os.environ.get("DEUCE_DIR") or DEFAULT_PROJECT_DIR,
                    help=f"Deuce folder inside your Sports-Analytics checkout (default: {DEFAULT_PROJECT_DIR})")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    app = root / "dist" / "Deuce.app"
    (app / "Contents" / "MacOS").mkdir(parents=True, exist_ok=True)
    (app / "Contents" / "Resources").mkdir(parents=True, exist_ok=True)

    icon = draw_icon(1024)
    icon.save(root / "dist" / "deuce-icon.png")
    icon.save(app / "Contents" / "Resources" / "Deuce.icns",
              sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])

    (app / "Contents" / "Info.plist").write_text(INFO_PLIST)
    exe = app / "Contents" / "MacOS" / "Deuce"
    exe.write_text(LAUNCH_SCRIPT.format(project=args.project_dir))
    exe.chmod(exe.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"Built {app}")


if __name__ == "__main__":
    main()
