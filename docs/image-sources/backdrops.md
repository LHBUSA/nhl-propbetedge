# Image sources: surface backdrops (`public/assets/nhl/backdrops/`)

This file extends `docs/IMAGE_SOURCES.md` and follows the same rules. Every file under `public/assets/nhl/backdrops/` is listed here, and each license was checked on that photo's own Pexels page ("Free to use", linking to https://www.pexels.com/license/).

- **Retrieved:** 2026-09-11. Untouched originals stay in the sourcing scratchpad and are not committed. The original file URL is recorded for each image so it can be downloaded again.
- **License, all nine:** Pexels License, https://www.pexels.com/license/. No CC BY, CC BY-SA or Unsplash images are used.
- **Required UI credit: none.** The Pexels License doesn't require attribution. Optional footer credit: `Photography: Tony Schnagl, Pavel Danilyuk, Tima Miroshnichenko, Ron Lach / Pexels`.
- **Pexels terms that still apply:** don't imply that the people in a photo endorse PropBetEdge, don't sell or redistribute the files unaltered as standalone downloads, and don't use them in a logo or trademark.

## Files and grade (all surfaces)

- `{surface}-2000|1400|800.{avif,webp}`: a 16:7 landscape crop at 2000×875, 1400×613 and 800×350.
- `{surface}-m-700.{avif,webp}`: a 7:9 mobile crop at 700×900.
- **Crop:** made at source resolution first, then a Lanczos resize.
- **Grade:** the same for every surface, applied at output size.
  - Chroma reduced to 70% (50% for injuries, whose source has a strong teal cast).
  - Gamma 1.18.
  - Exposure scaled down toward a shared family target of mean sRGB luminance 0.15 to 0.18.
  - Highlight shoulder at about 90%.
  - Slight cool shift in shadows and low mids (R −0.018, B +0.030 at peak), with the deepest blacks nudged very slightly warm so they sit on the warm near-black UI.
- **Nothing baked in:** no text, vignettes, gradients or retouching. Scrims are the UI's job.
- **Encoding:** AVIF q64 (speed 4), WebP q80 (method 6).
- **Budgets:** every file is under budget (2000 AVIF ≤ 180 KB, 1400 ≤ 100 KB, 800 ≤ 45 KB, m-700 ≤ 60 KB). The largest are lines-2000.avif at 105 KB and props-2000.avif at 94 KB.
- **Total:** 72 files, 2,289,243 bytes (about 2.18 MiB).

**Focal point** is given as a CSS `background-position` for `background-size: cover`: first the landscape set, then the mobile file.

## Per surface

| Surface | Files (AVIF/WebP KB: 2000 · 1400 · 800 · m-700) | Source page | Original file | Author | License | Modifications (crop box in source px, x0,y0,x1,y1) | Focal point (landscape / mobile) | UI credit |
|---|---|---|---|---|---|---|---|---|
| **cast** | `cast-*`, 49/48 · 29/27 · 12/11 · 20/19 | https://www.pexels.com/photo/men-playing-ice-hockey-6468933/ | https://images.pexels.com/photos/6468933/pexels-photo-6468933.jpeg (5000×3334) | Tony Schnagl (https://www.pexels.com/@tony-schnagl/) | Pexels License | Landscape (0,560)–(5000,2747). Starts below the floodlight core, so only its beam shows, and the right skater's head is cropped out. Mobile (1587,600)–(3713,3334). Family grade. | `52% 46%` / `50% 32%` (goalie in the crease) | none required |
| **props** | `props-*`, 94/88 · 51/45 · 18/15 · 31/26 | https://www.pexels.com/photo/scratched-ice-in-ice-rink-6539263/ | https://images.pexels.com/photos/6539263/pexels-photo-6539263.jpeg (4740×3164) | Pavel Danilyuk (https://www.pexels.com/@pavel-danilyuk/) | Pexels License | Landscape (0,703)–(4740,2777). Mobile (1614,0)–(4074,3164). The source is monochrome, so the grade adds only the cool shadow tint. | `50% 40%` / `45% 45%` (light streak and groove line) | none required |
| **goalies** | `goalies-*`, 39/39 · 25/24 · 12/12 · 26/22 | https://www.pexels.com/photo/person-in-black-suit-and-white-padded-gears-6468959/ | https://images.pexels.com/photos/6468959/pexels-photo-6468959.jpeg (3334×5000) | Tony Schnagl | Pexels License | Landscape (0,171)–(3334,1629): dark torso, blocker and catcher, net behind. Mobile (111,0)–(3223,4000): full pads and stick. No head in either crop. | `47% 65%` / `50% 45%` | none required |
| **lines** | `lines-*`, 105/97 · 62/58 · 25/23 · 43/42 | https://www.pexels.com/photo/ice-hockey-players-looking-at-camera-6468947/ | https://images.pexels.com/photos/6468947/pexels-photo-6468947.jpeg (4800×3200) | Tony Schnagl | Pexels License | Landscape (672,1688)–(4128,3200). Mobile (1778,1600)–(3022,3200). Both are cut at the waist: a row of skates, sticks and hard shadows, with **all faces removed**. The source is a team portrait. | `50% 60%` / `50% 60%` | none required |
| **injuries** | `injuries-*`, 30/29 · 18/18 · 9/8 · 18/17 | https://www.pexels.com/photo/empty-ice-skating-rink-6015664/ | https://images.pexels.com/photos/6015664/pexels-photo-6015664.jpeg (3934×5901) | Tima Miroshnichenko (https://www.pexels.com/@tima-miroshnichenko/) | Pexels License | Landscape (0,2355)–(3934,4077). Mobile (246,1092)–(3688,5517). Chroma 50% (not 70%) to pull back the teal cast. | `50% 52%` / `50% 50%` (far boards line) | none required |
| **news** | `news-*`, 63/74 · 29/29 · 11/10 · 19/20 | https://www.pexels.com/photo/black-and-red-framed-eyeglasses-8972136/ (the Pexels title is wrong: the photo shows taped stick blades on a locker-room floor) | https://images.pexels.com/photos/8972136/pexels-photo-8972136.jpeg (4480×6720) | Ron Lach (https://www.pexels.com/@ron-lach/) | Pexels License | Landscape (0,2884)–(4480,4844). Mobile (358,1478)–(4122,6317). Both crops exclude the blurred jersey at the top right of the source, so no person is visible. | `65% 70%` / `60% 58%` (front taped blade) | none required |
| **matchups** | `matchups-*`, 59/53 · 36/31 · 16/13 · 24/22 | https://www.pexels.com/photo/people-wearing-ice-hockey-uniform-holding-an-ice-hockey-stick-6468938/ | https://images.pexels.com/photos/6468938/pexels-photo-6468938.jpeg (5000×3334) | Tony Schnagl | Pexels License | **Reuses the existing `editorial-ice` source** (faceoff, crossed sticks). Landscape (0,973)–(5000,3161). Mobile (1203,0)–(3797,3334). | `58% 25%` / `60% 45%` (crossed sticks) | none required |
| **players** | `players-*`, 50/45 · 30/26 · 13/10 · 15/13 | https://www.pexels.com/photo/a-person-ice-skating-on-ice-rink-6468935/ | https://images.pexels.com/photos/6468935/pexels-photo-6468935.jpeg (5200×3466) | Tony Schnagl | Pexels License | **Reuses the existing `hero-ice` source** (skater cut at the torso, ice spray; no face). Landscape (0,249)–(5200,2524). Mobile (1044,0)–(3740,3466). Graded darker than the hero. | `50% 55%` / `55% 45%` (skates and spray) | none required |
| **standings** | `standings-*`, 22/24 · 14/14 · 6/6 · 8/8 | https://www.pexels.com/photo/men-playing-ice-hockey-6468744/ | https://images.pexels.com/photos/6468744/pexels-photo-6468744.jpeg (5000×3334) | Tony Schnagl | Pexels License | Landscape (0,6)–(5000,2194): blurred dark stands with light beams through haze, and rink-level players in the lower half. Mobile (1028,0)–(2972,2500), shifted left so the nearest skater's face is out of frame. | `50% 40%` / `50% 45%` | none required |

**Content checks (all nine):**
- No NHL, league or team marks.
- No readable brand or sponsor text. The standings banners are defocused and unreadable. The injuries far wall has faint decorative snowflakes and a small script word, unreadable at 2000 px.
- No faces are identifiable. Goalies wear cage masks. Two faces survive only as small, unidentifiable profiles: the red-helmet skater in `cast` (in shadow, about 20 px) and the near skater in the `standings` landscape (profile, about 25 px, looking down).

**Surfaces without a photo:** shotlab, methodology and track. They were optional, and nothing I found was both very dark and minimal enough to beat a generated SVG. The closest was Unsplash `Lv8O1pMxpS0` (overhead mini-net and puck on black ice), but a 16:7 crop can't hold both the net and the puck, and the loud red frame breaks the family grade.

## Candidates considered and rejected (2026-09-11)

| Candidate | License | Why rejected |
|---|---|---|
| Pexels 19909823, Vadim Braydov (spotlit goalie, black arena) | Pexels | Best mood of the search, but it is a KHL game. "Salavat Yulaev" text, team crest, a "MEGA" helmet sponsor, and the pro goalie's name on his pads (identifiable professional). |
| Unsplash `rLzV1LRAPxI`, Just Filip (goalie seen past spectators) | Unsplash | "Hockey Club Tachov" crest readable on the chest, a sponsor board ("…sano… zdraví") and a CCM mask mark |
| Pexels 6468927 / 6468928 (same night rink, action at the net) | Pexels | Near-duplicate of the cast frame (6468933). Faces visible. |
| Pexels 6468915 / 6468932 / 6468925 (wide floodlit rec game) | Pexels | Several identifiable faces. Same reason as in `IMAGE_SOURCES.md`. |
| Pexels 6468924 (skaters lined up at the net, bench behind the glass) | Pexels | Good "lines" alternative, but it repeats the cast composition |
| Pexels 6468917 (black vs white gloves under floodlight) | Pexels | Strong alternative for players or matchups. The floodlight core falls in the heading zone. |
| Pexels 6468942 (lone skater under floodlight) | Pexels | Face clearly identifiable |
| Pexels 6847387 / 6847535, Tima Miroshnichenko (empty net, dim warm rink) | Pexels | Usable alternative for goalies. Weaker than real goalie gear, and warmer than the family. |
| Pexels 20584516 / 20584514, K (Penn "Class of 1923 Arena") | Pexels | University marks, "Penn" signage, Coke Zero scoreboard, crest at centre ice |
| Pexels 27771147, Lu Zhao (black-and-white arena) | Pexels | Readable adidas and sponsor boards |
| Pexels 33974836 (black-and-white arena crowd, flags) | Pexels | Sponsor boards, "MESSI" jersey, identifiable spectators; minor-league venue |
| Unsplash `ZUV3OCLCArM`, Logan Weaver (very dark arena) | Unsplash | US Bank, Pepsi and Great Clips boards and arena naming signage |
| Unsplash `W7t3cNm8LXk`, Matthieu Pétiard (U17 bench from behind) | Unsplash | Minors, plus readable sponsor boards (Angers, SPIE, Atlanta) |
| Unsplash `kxMG1AiNFjw`, Klim Musalimov (dark empty seats) | Unsplash | Usable for injuries or standings. The rink frame (6015664 / 6468744) reads more clearly as hockey. |
| Pexels 8972142 / 8972146, Ron Lach (locker room) | Pexels | Minors, and a "Krasnaya Zvezda" team crest |
| Pexels 10676416 / 10676418, Vilnis Husko (skates on black) | Pexels | "BAUER" and "ONE.4" product marks; generic studio stock |
| Pexels 6539xxx series, Pavel Danilyuk (empty rinks) | Pexels | Bright, flat daylight rinks with coloured seating |
| Wikimedia Commons (bench, arena and crease searches) | CC BY-SA / PD | Every relevant hit was NHL, AHL, PWHL, KHL or NCAA editorial with team marks |
