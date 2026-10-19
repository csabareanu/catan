# Illustrated board prototype

This is the approved visual prototype for the Illustrated board appearance.
Classic is already implemented and remains available; it is not redesigned here.

## Open the prototype

From the repository root:

```sh
python3 -m http.server 4174 --bind 0.0.0.0 --directory prototypes
```

Open `http://127.0.0.1:4174/illustrated-board.html` on the development machine.
The HTML can also be opened directly from disk. Use the **Full island** and
**Terrain details** controls to switch views. On a phone, **Overview** opens
the resource guide. The plus control provides one closer inspection level;
Fit board restores the full island.

## Design direction

- Use one cohesive painted terrain atlas with recognisable forests, sheep
  pastures, wheat fields, clay hills, mountains, and desert.
- Keep number tokens, production pips, coastal trade rates, and hex edges
  readable above the artwork.
- Retain the application's dark teal surroundings, gold accents, typography,
  medieval keep mark, large board workspace, and compact phone controls.
- Extend the existing water treatment with a narrow sandy coast, shallow
  water, and restrained wave lines.
- Reuse the existing standard-board browser fixture. All 19 hexes, number
  tokens, ports, and coordinates come from that fixture, without game-rule
  calculations in the prototype.
- Show a red road and settlement on the enlarged clay-hills sample solely to
  test future overlay legibility. These are design samples, not persisted
  gameplay state or implemented mechanics.

## Files

- `theme.css`: shared theme variables and artwork-specific presentation tokens.
- `illustrated-board.css`: the responsive mockup layout and SVG presentation.
- `illustrated-board.html`: a self-contained static page with the full board
  and six enlarged samples. A small script switches between two zoom levels.
- `assets/terrain-atlas.png`: the original generated 3-by-2 texture atlas.
- `assets/terrain-atlas.prompt.md`: the final art-generation prompt and layout.
- `assets/catan-mark.svg`: a copy of the existing application emblem.

The artwork was produced with the built-in image generation tool. The atlas
is displayed through SVG viewports and is not edited into separate bitmap
files. The art direction and atlas are approved as the production reference;
their integration and legibility still need verification in the real renderer.

## Boundary for later implementation

Feature 14 integrates the approved Illustrated appearance as explicit UI work.
Classic and Illustrated should share the existing board renderer, topology,
state, port positions, and viewport controls. A browser
preference remembers the selected appearance without changing the seed, saved
game, replay position, or rules. Verify the artwork at fitted and zoomed phone
sizes before deciding how many individual texture variations are worthwhile.
A full Settings page can wait.

This prototype does not implement account preferences, API changes, gameplay,
replay controls, production gesture handling, or a new application palette.
No production source or dependency is changed.

Keep these prototype files in version control as the approved design reference.
Preserve the terrain asset and generation prompt in the real application before
removing any consumed mockups during feature completion.

## Browser review

Reviewed with the existing managed Playwright Chromium at 1440x900, 1366x768,
768x1024, 390x844, 320x568, and 844x390. The full-island view fits each window
without document scrolling. Both views load, the zoom/fit controls work, the
phone guide opens, and no JavaScript errors or failed asset requests occur.
The fitted board has 19 terrain tiles, 18 number tokens, and 9 ports; its zoom
controls overlap no port badges. Landscape phones still make a fitted board
small; the prototype's inspection level is a visual study, while the real
application keeps its existing pan and pinch behaviour during implementation.

Reference captures are in `previews/`: desktop island, phone island, and desktop
terrain details. Production lint/build and application tests were not rerun
because only static prototype files changed.
