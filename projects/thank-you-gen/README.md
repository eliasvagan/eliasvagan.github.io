# Thank-you card generator (thank-you-gen)

Browser-based generator for post-wedding thank-you cards. One cover photo, one message per line, one
print-ready PDF.

**Live:** [eliasvagan.github.io/projects/thank-you-gen/](https://eliasvagan.github.io/projects/thank-you-gen/)

## Formats

| Format | Card | Printing | Fold |
| --- | --- | --- | --- |
| A6 liggende – A4 brettet i fire | 148 × 105 mm | single-sided, 1 page per card | top, stands like a tent |
| A6 stående – A4 brettet i fire | 105 × 148 mm | single-sided, 1 page per card | left, opens like a book |
| A5 liggende – tosidig | 210 × 148 mm | duplex, flip on long edge, 2 pages per card | top |
| A5 stående – tosidig | 148 × 210 mm | duplex, flip on short edge, 2 pages per card | left |

The quarter-fold impositions put the faces that sit upside down on the sheet at 180°. In landscape
that's only the cover. In portrait it's both inside panels, which is where rotated text is needed:

```
A6 liggende (print side up)        A6 stående (print side up)
┌──────────────┬──────────────┐    ┌───────────┬───────────┐
│ (inside top) │ cover (180°) │    │ message ↻ │ (blank) ↻ │
├──────────────┼──────────────┤    ├───────────┼───────────┤
│ message      │ back         │    │ back      │ cover     │
└──────────────┴──────────────┘    └───────────┴───────────┘
```

A format is one entry in `STYLES` in `index.html`: the card size, the fold, and where each face
(`cover`, `inside`, `insideBlank`, `back`) sits on each page. Faces are laid out upright in their own
millimetres by `layoutFace()`. The PDF writer, the print-sheet preview and the 3D preview all draw the
same ops.

## Typography

`TYPOGRAPHY` pairs a text face, a signature face and sizes: *Klassisk* (Cormorant Garamond + Eyesome
Script), *Romantisk* (Cormorant italic + Pinyon Script), *Tidløs* (EB Garamond + Great Vibes) and
*Moderne* (Jost Light + Cormorant italic). The PDF embeds only the faces it uses.

- The text size steps down (to 9 pt in *Klassisk*) until the message fits. Lines are balanced
  (same line count, narrowest measure), and leading or trailing punctuation hangs, so centred lines
  look centred.
- Straight quotes become «», apostrophes become ’, `...` becomes … and ` - ` becomes a spaced en dash
  glued to the word before it.
- The back gets a monogram made from the signature («Line & Elias» → «L & E») and an optional line in
  spaced capitals.

## Photo and print output

- **Shared cover:** every page references a single image object.
- **Crop:** drag to pan, zoom up to 300 %. The page shows how many DPI the photo really gives.
- **Downscaling:** large photos are halved in steps before the final resize, which avoids aliasing.
- **Tones:** original, black-and-white (with a gentle S-curve), warm and film.
- **CMYK (default):** a device separation with medium GCR, rich black and a 300 % total ink limit.
  Black-and-white photos print from the black plate only. The pixels are stored as Paeth-predicted,
  Flate-compressed DeviceCMYK through a custom jsPDF image processor.
- **Text:** solid 100 % K, because any tint gets screened and makes hairlines look fuzzy.
- **RGB:** embeds a q95 JPEG instead.
- **DPI** (default 300) sets the cover's resolution.
- **Prøveark** makes a one-card PDF of the previewed card for testing the printer and the fold.

## Mail merge

Paste columns from a spreadsheet into *Hilsener* (tab-separated) and write a template such as
`Kjære {1},|tusen takk for {2}!`. Without tabs, the whole line is `{1}`.

## Fonts

All are TrueType, so jsPDF can embed them as real text. They're subset to Latin-1 plus typographic
punctuation, with kerning dropped so the canvas preview spaces text exactly like jsPDF does (jsPDF
doesn't kern).

| File | Source |
| --- | --- |
| `CormorantGaramond-Medium.ttf`, `-MediumItalic.ttf` | Google Fonts variable fonts, instanced at wght 500 (holds up better in print than 400) |
| `EBGaramond-Regular.ttf` | Google Fonts, wght 400 |
| `Jost-Light.ttf` | Google Fonts, wght 300 |
| `PinyonScript-Regular.ttf`, `GreatVibes-Regular.ttf` | Google Fonts |
| `Eyesome-Script.ttf` | `../bingo-gen/resources/fonts/Eyesome-Script.otf`, converted from CFF by `tools/otf2ttf.py` |

The OFL licences are next to the fonts.

```bash
fonttools varLib.instancer "CormorantGaramond[wght].ttf" wght=500 -o cg-500.ttf
pyftsubset cg-500.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+20AC" \
  --layout-features='' --no-hinting --output-file=CormorantGaramond-Medium.ttf
python3 tools/otf2ttf.py ../bingo-gen/resources/fonts/Eyesome-Script.otf Eyesome-Script.ttf
```

## Development

Static files only. Serve the repo root (`python3 -m http.server 8000`) and open
`http://localhost:8000/projects/thank-you-gen/`. Tests: `python3 -m pytest thank_you/` from `test/`.
