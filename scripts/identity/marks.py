"""Writes the NHL mark masters beside this file. The SVGs are committed; this
is the geometry they came from. After editing: python marks.py, then
node render.mjs (icons) and node og.mjs (social card).

  mark-full.svg      192/512 icons, OG card, public/brand/pbe-nhl-mark.svg
  mark-small.svg     favicon.svg, 16/32/48 (ICO), top-bar mark: heavier
                     weights, less lean, flat gold, no keyline (optical size)
  mark-bleed.svg     apple-touch-icon: square full-bleed tile, no keyline
  mark-maskable.svg  maskable 512: full bleed, glyph inside the safe circle
"""
import pathlib
import sys

DEST = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent

# The stick-P, drawn upright; the lean is a skew about the tile centre.
# Stem = shaft, heel curve, blade on the ice toward the left, P bowl on top.
FULL_P = ("M226 94 Q226 84 236 84 H336 A114 114 0 0 1 336 312 H310 V360 "
          "A64 64 0 0 1 246 424 H98 Q64 424 64 398 Q64 374 96 370 L204 366 "
          "Q226 365 226 342 Z "
          "M310 150 H336 A48 48 0 0 1 336 246 H310 Z")
SMALL_P = ("M214 82 Q214 72 224 72 H330 A122 122 0 0 1 330 316 H318 V352 "
           "A88 88 0 0 1 230 440 H92 Q52 440 52 406 Q52 372 92 368 L190 364 "
           "Q214 362 214 336 Z "
           "M318 142 H328 A52 52 0 0 1 328 246 H318 Z")

GOLD = """    <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="120" y1="80" x2="400" y2="440">
      <stop offset="0" stop-color="#f5e08e"/>
      <stop offset=".45" stop-color="#d9b441"/>
      <stop offset="1" stop-color="#9a7719"/>
    </linearGradient>
    <linearGradient id="ice" x1="0" x2="1">
      <stop offset="0" stop-color="#cfe6f5" stop-opacity="0"/>
      <stop offset=".5" stop-color="#e6f2fa" stop-opacity=".85"/>
      <stop offset="1" stop-color="#cfe6f5" stop-opacity="0"/>
    </linearGradient>"""
GLOW = """    <radialGradient id="glow" cx="50%" cy="34%" r="74%">
      <stop offset="0" stop-color="#2a2318"/>
      <stop offset="1" stop-color="#0c0a07"/>
    </radialGradient>"""


def glyph(scale, dx, skew, fill, ice):
    ice_line = '\n    <rect x="40" y="440" width="430" height="7" rx="3.5" fill="url(#ice)"/>' if ice else ""
    return (f'  <g transform="translate({256 + dx} 256) scale({scale}) skewX({skew}) translate(-256 -256)">\n'
            f'    <path fill="{fill}" fill-rule="evenodd" d="{FULL_P if fill.startswith("url") else SMALL_P}"/>{ice_line}\n'
            f"  </g>")


HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'
        "  <!-- PropBetEdge NHL: a P drawn as a hockey stick. Shaft = stem,\n"
        "       heel + blade on the ice, gold on near-black. Our own mark; no league marks. -->\n")

full = (HEAD + "  <defs>\n" + GLOW + "\n" + GOLD + "\n  </defs>\n"
        '  <rect width="512" height="512" rx="112" fill="url(#glow)"/>\n'
        '  <rect x="12" y="12" width="488" height="488" rx="102" fill="none" stroke="#d4af37" stroke-opacity=".32" stroke-width="5"/>\n'
        + glyph(0.9, 8, -10, "url(#gold)", True) + "\n</svg>\n")

bleed = (HEAD + "  <defs>\n" + GLOW + "\n" + GOLD + "\n  </defs>\n"
         '  <rect width="512" height="512" fill="url(#glow)"/>\n'
         + glyph(0.9, 8, -10, "url(#gold)", True) + "\n</svg>\n")

small = (HEAD + '  <rect width="512" height="512" rx="104" fill="#14110d"/>\n'
         + glyph(0.96, 4, -7, "#e8c452", False) + "\n</svg>\n")

# Maskable: same full-bleed tile, glyph shrunk into the 80% safe circle so a
# platform circle/squircle mask never clips the blade or the bowl.
maskable = (HEAD + "  <defs>\n" + GLOW + "\n" + GOLD + "\n  </defs>\n"
            '  <rect width="512" height="512" fill="url(#glow)"/>\n'
            + glyph(0.66, 6, -10, "url(#gold)", True) + "\n</svg>\n")

for name, text in (("mark-full.svg", full), ("mark-bleed.svg", bleed), ("mark-maskable.svg", maskable), ("mark-small.svg", small)):
    (DEST / name).write_text(text, encoding="utf-8", newline="\n")
print("wrote masters to", DEST)
