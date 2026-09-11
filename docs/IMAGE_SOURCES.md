# Image sources: NHL.PropBetEdge.ai

Every raster image shipped under `public/assets/nhl/` has to be listed here, with its source and license checked on the source page itself. If an image isn't in this file, it doesn't ship.

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

- **Required UI credit: none.** The Pexels License doesn't require attribution. We're using no CC BY or CC BY-SA images right now, so no credit string has to be shown.
- Optional credit, e.g. in the footer or an "Image credits" page: `Photography: Tony Schnagl / Pexels`.
- If a CC BY or CC BY-SA image is added later, the UI **must** show `"<Title>" by <Author>, <License short name> (<license URL>)`, and say "modified" if we cropped or graded it. That credit also has to be recorded in a new table in this file.

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

## 5. Candidates considered and rejected (2026-09-11)

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
