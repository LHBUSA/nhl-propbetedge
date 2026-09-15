# Image sources: NHL.PropBetEdge.ai

Every raster image shipped under `public/assets/` has to be listed here (or in a file under `docs/image-sources/` that this file links), with its source and license checked on the source page itself. If an image isn't in this file, it doesn't ship.

Retrieved: 2026-09-11. Untouched originals are kept outside the repo, in the sourcing scratchpad. They are not committed.

---

## 1. Primary hero: `hero-ice-*`

| File(s) | Use | Source page URL | Original file URL | Author | License (with link) | Retrieved | Modifications |
|---|---|---|---|---|---|---|---|
| `hero-ice-640/960/1440/1920/2560.{avif,webp}` | Landscape hero / page background (`srcset`) | https://www.pexels.com/photo/a-person-ice-skating-on-ice-rink-6468935/ | https://images.pexels.com/photos/6468935/pexels-photo-6468935.jpeg (5200×3466 JPEG) | Tony Schnagl (https://www.pexels.com/@tony-schnagl/) | Pexels License, https://www.pexels.com/license/ | 2026-09-11 | Cropped to 16:9, top-anchored (0,0 to 5200×2925: bottom 541 px of ice removed). Mild grade: chroma reduced to 78%, gamma 1.12, highlights compressed to about 93%, slight cool cast in highlights and slight warm lift in deepest shadows. Lanczos resize. AVIF q72 / WebP q86. No text, gradients or vignettes baked in. |
| `hero-ice-m-600.{avif,webp}`, `hero-ice-m-900.{avif,webp}` | Mobile portrait hero (viewports ≤ 600px) | same as above | same as above | Tony Schnagl | Pexels License | 2026-09-11 | Same grade. 4:5 crop at full height, box (1006,0)–(3779,3466) of the original, centred at x = 46% on the skates and spray. Resized to 600×750 and 900×1125. |
| `hero-ice-lqip.webp` | Blurred placeholder / `background-image` before the hero loads | same as above | same as above | Tony Schnagl | Pexels License | 2026-09-11 | Graded 16:9 frame downscaled to 32×18, WebP q40 (158 B) |

**What's in the frame:** ice-level shot of one skater, cut off at the torso (no face, no helmet), throwing a hard ice spray. The background is dark, the light is hard, and the ice texture and shadows are sharp. There are no team logos, league marks or readable text. The only visible gear is a plain dark glove and a white-taped stick blade.

## 2. Secondary editorial: `editorial-ice-*`

| File(s) | Use | Source page URL | Original file URL | Author | License (with link) | Retrieved | Modifications |
|---|---|---|---|---|---|---|---|
| `editorial-ice-960.{avif,webp}`, `editorial-ice-1600.{avif,webp}` | Secondary surfaces (matchup / faceoff panels, section breaks) | https://www.pexels.com/photo/people-wearing-ice-hockey-uniform-holding-an-ice-hockey-stick-6468938/ | https://images.pexels.com/photos/6468938/pexels-photo-6468938.jpeg (5000×3334 JPEG) | Tony Schnagl (https://www.pexels.com/@tony-schnagl/) | Pexels License, https://www.pexels.com/license/ | 2026-09-11 | Full 3:2 frame, not cropped. Same mild grade as the hero. Lanczos resize to 960×640 and 1600×1067. AVIF q72 / WebP q86. |

**What's in the frame:** faceoff at ice level. Two sticks cross over the ice, and you see skates and legs from the waist down. No faces. Amateur practice gear with no team marks; the gloves carry only a small generic manufacturer design.

## 3. Attribution / UI credit

- **Pexels photography (hero, editorial, page backdrops): no credit required.** We credit it anyway in the footer and on Methodology → Image credits (`#/methodology?section=credits`).
- **Player portraits (CC BY / CC BY-SA): credit required and shown.** The player hero shows a visible line (`Author, License, via Wikimedia Commons (cropped)`); every smaller avatar carries the same string as its `title`, and Methodology → Image credits lists every published portrait with author, a license link and the Commons source page. It is generated from the manifest, so it cannot fall out of sync with what ships.
- Any new CC BY / BY-SA image must be added to a manifest that feeds that credits list, and must say it was modified if cropped or graded.

## 4. Rules

1. **Allowed licenses:** CC0, public domain (including US federal government works such as DVIDS or military photos), CC BY, CC BY-SA (with the attribution above), the Unsplash License, and the Pexels License. Check the license **on the source page of that exact image**, not in search snippets or aggregator sites.
2. **Forbidden:** Getty Images (including Getty-supplied "Unsplash+" images), NHLI, AP, Reuters, USA Today, Imagn, team or league editorial photography, anything marked "editorial use only", and anything whose license you can't verify. Unsplash+ / premium images are **not** covered by the free Unsplash License.
3. **Trademark and personality rights:** a photo license doesn't clear logos, jerseys or a person's likeness. This is a betting-adjacent product, so:
   - no NHL/team logos, league marks, or arena naming-rights signage;
   - no identifiable NHL players, and preferably no identifiable faces at all;
   - never place imagery so that it implies a person or brand endorses PropBetEdge. The Pexels License forbids this explicitly: "Don't imply endorsement of your product by people or brands on the imagery", and identifiable people "may not appear in a bad light".
4. **Pexels/Unsplash limits:** don't use these photos in a trademark, logo or business name, and don't redistribute them as standalone files (for example a wallpaper download).
5. **No hotlinking.** Download the original, record it here, and serve our own derivatives from `public/assets/nhl/`.
6. Keep the untouched original out of the repo. Store it with the sourcing notes and record its URL here so it can be downloaded again.

## 5. Page backdrops: `public/assets/nhl/backdrops/`

Full table (page and file URLs, authors, crop boxes, grade, focal points, 18 rejected candidates): **[`docs/image-sources/backdrops.md`](image-sources/backdrops.md)**.

| Surface | Pexels ID · author | Subject |
|---|---|---|
| PBE Cast | 6468933 · Tony Schnagl | goalie in the crease under a floodlight |
| Props | 6539263 · Pavel Danilyuk | dark scratched ice |
| Goalies | 6468959 · Tony Schnagl | blocker, catcher and pads, no head |
| Lines | 6468947 · Tony Schnagl | a line of players cut at the waist |
| Injuries | 6015664 · Tima Miroshnichenko | empty dim rink |
| News | 8972136 · Ron Lach | taped stick blades on a locker-room floor |
| Matchups | 6468938 · Tony Schnagl | faceoff, crossed sticks (the editorial photo) |
| Players | 6468935 · Tony Schnagl | skater and ice spray (the hero photo, graded darker) |
| Standings | 6468744 · Tony Schnagl | defocused stands, light through haze |

Shot Lab, Methodology and Track Record use owned generated SVG art (overhead rink, faceoff geometry, terminal grid) — no photo. **Since the atmosphere pass (2026-09-12) each plate is used twice on its own route**: as the band at the top and, screen-blended under .3 opacity, as a fixed floor layer at the bottom of the viewport (`.backdrop-floor`). It is the same file and the same request — no new asset and no new licence. The Ice Board, which has a hero instead of a band, carries the `standings` plate (Pexels 6468744) as its floor at the 800px size, requested off the critical path. All nine are Pexels License, no marks, no identifiable faces (two faces of about 20–25 px remain in shadow in `cast` and the `standings` landscape crop). The Ice Board hero (§1) is the only preloaded image; backdrops load only for the current route, AVIF with WebP fallback, sized by viewport × DPR.

## 6. Player portraits: `public/assets/players/`

Full contract, method, per-player table and rejection reasons: **[`docs/image-sources/players.md`](image-sources/players.md)**. Pipeline: `scripts/player-portraits/`.

- **Source contract:** Wikimedia Commons only, reached through Wikidata P3522 (NHL player id) → P18; CC0 / PD / CC BY / CC BY-SA verified in Commons `extmetadata`; ≤ 10 years old; visual review ledger in `scripts/player-portraits/review.json`.
- **NHL.com headshots (`assets.nhle.com/mugs`): IN USE IN PRODUCTION since `d119017` (PR #5), pending owner confirmation.** They are the fallback between a reviewed Commons portrait and the initials, requested through `propbet-img-proxy.sales-fd3.workers.dev` and labelled "Player image · NHL asset feed". `docs/NHL_PRODUCT_DEPTH_V1.md` records an owner approval dated 2026-09-11; earlier briefs said these stay unused, so the contradiction is flagged rather than resolved here. A photo licence is still not a likeness licence, and NHL.com terms limit use to non-commercial personal use (`docs/NHL_SOURCE_MATRIX.md` §0).
- **Published: 45** of 153 targets (Sorokin excluded after review — state press-service ceremony photo). Everyone else falls back to initials + team mark, then a neutral PBE mark. No lookalikes, no AI images, no guesses.
- **Owner decisions still open:** (1) 10 published files carry Commons personality-rights tags (Nedeljkovic, Tuch, Keller, Gauthier, LaCombe, Daccord, Hutson, Draisaitl, Celebrini, Thompson) — the copyright license is clean, but a real athlete's likeness next to betting content is a publicity-rights question. A prepared, unmerged withdrawal path removes exactly those 10 and suppresses the NHL headshot for them (branch `nhl-portrait-optout-prep`, `scripts/player-portraits/withdraw.mjs`, dry-run by default); (2) many stars have no usable open photo (e.g. McDavid, MacKinnon, Kucherov) and show initials; a licensed headshot feed would be the fix.

## 7. Candidates considered and rejected (2026-09-11)

| Candidate | License | Why rejected |
|---|---|---|
| Pexels 6468942 (same shoot, single skater, dark, spray) | Pexels | Strong mood, but the skater's face is clearly identifiable |
| Pexels 6468925 / 6468915 / 6468932 (same shoot, floodlit rec game) | Pexels | Several identifiable faces; reads as a rec-league flyer |
| Pexels 6468936 (two pairs of skates facing off) | Pexels | Usable as an alternative secondary; weaker than 6468938 |
| Unsplash `y4DwMFPWBzw`, Klim Musalimov (dark arena, blue ice) | Unsplash | KHL/Dinamo branding visible; high stands angle, not ice-level |
| Unsplash `HwZTYUkIP6c`, Seth Hoffman (Madison Square Garden) | Unsplash | NHL game, NHL/team marks |
| Unsplash `-ofOCf-jen4`, Chris DeSort (empty rink with goal) | Unsplash | Bright fluorescent community rink; no cinematic contrast |
| Commons: US Air Force Academy hockey (Trevor Cokley, USAF) | Public domain (US Gov) | Bright, flat arena action; NCAA team marks and identifiable players' faces |
| Commons: *Homowack indoor ice rink* LCCN2017712935/6 | Public domain (LOC) | Dark and empty, but derelict/abandoned look; wrong tone for a premium product |
| Commons: Western Michigan vs. Michigan 2024 face-off series | CC BY-SA 4.0 | Bright, wide stands shots; NCAA/Big Ten marks; would need a credit |

## 6. Owned generated raster: `grain-128.webp` (2026-09-15)

| File | Use | Source | License | Modifications |
|---|---|---|---|---|
| `public/assets/nhl/grain-128.webp` (128×128, 4.9 KB) | Film grain over the atmosphere field (`.atmos__grain`) | Generated by PropBetEdge: numpy `default_rng(20260915)` gaussian noise (mean 128, sd 30), WebP q40 | Owned | none |

The 2026-09-15 depth pass retired every decorative SVG background (inline
`feTurbulence` grain, the Shot Lab rink / Methodology rink-lines / Track Record
terminal art, the Preseason panel watermark). Those routes, the team page and
PBE Picks now re-use the licensed Pexels plates in §5 (`PHOTO_BACKDROPS[key].file`
in `src/lib/backdrops.js`); no new photograph was added. Guarded by
`tests/frontend-checks.mjs` §3.
