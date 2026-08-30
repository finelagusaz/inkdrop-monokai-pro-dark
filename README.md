# Monokai Pro Dark for Inkdrop

A [Monokai Pro](https://monokai.pro/) theme for [Inkdrop](https://www.inkdrop.app/) 6 —
app chrome, editor syntax and Markdown preview in a single package.

Inkdrop 5 needed three separate theme packages for those; Inkdrop 6 unified them,
so this one package styles the whole app.

> Requires Inkdrop **6.0.0 or later**. It will not load on Inkdrop 5.

## Palette

Monokai Pro's default filter.

| | Hex | Role |
|---|---|---|
| ⬛ | `#19181A` | sidebar, menus, preferences |
| ⬛ | `#221F22` | note list, panels |
| ⬛ | `#2D2A2E` | editor — Monokai's own background |
| ⬛ | `#403E41` | selection, buttons |
| ⬜ | `#5B595C` | borders |
| ⬜ | `#727072` | comments |
| ⬜ | `#FCFCFA` | foreground |
| 🔴 | `#FF6188` | keywords, operators, tags |
| 🟠 | `#FC9867` | parameters, `this` / `self` |
| 🟡 | `#FFD866` | strings |
| 🟢 | `#A9DC76` | function names, attributes |
| 🔵 | `#78DCE8` | types, classes, links |
| 🟣 | `#AB9DF2` | numbers, constants |

Acrylic windows are supported — the surfaces go translucent and keep their depth
order rather than flattening.

## Install

From Inkdrop: **Preferences → Plugins**, search for `monokai-pro-dark`.

Or from a terminal:

```
ipm install monokai-pro-dark
```

## Development

```
npm install
npm run tokens     # regenerate styles/tokens.css from the palette
npx dev-server     # browse every CSS variable at http://localhost:5173/
ipm link --dev     # symlink into <USER_DATA>/inkdrop/dev/packages
```

**`ipm link --dev` alone is not enough.** It links into `<USER_DATA>/inkdrop/dev/packages`,
and Inkdrop only scans that directory when Development Mode is on:

```js
// Inkdrop 6.1.3, renderer
if (this.devMode) this.packageDirPaths.push(path.join(configDirPath, "dev", "packages"));
this.packageDirPaths.push(path.join(configDirPath, "packages"));
```

Without it the theme never appears under **Preferences → Themes**, with no error to
explain why. So:

1. **Preferences → General → Hacking → Development Mode** (sets `core.devMode`)
2. Reload — <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>R</kbd> /
   <kbd>Alt</kbd>+<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>. `packageDirPaths` is
   built once when the window opens, so the toggle does nothing until you reload.
3. Enable the theme under **Preferences → Themes**

Then install the `dev-tools` plugin and pick **Plugins → dev-tools → Start hot
reloading themes** to skip the reload from then on.

To work without Development Mode, link into the regular packages directory with
plain `ipm link` — always scanned, but mixed in with your installed plugins.

### How it is put together

| File | Layer | What it does |
|---|---|---|
| `styles/tokens.css` | `@layer theme` | Replaces the built-in `--hsl-*` / `--color-*` ramps with Monokai. Generated. |
| `styles/ui.css` | `@layer theme.ui` | Only what the ramps cannot express — surface depth order, and accents that must land on a specific color. |
| `styles/syntax.css` | `@layer theme.syntax` | `--editor-*`, `--syntax-*`, `--md-*`. |
| `styles/preview.css` | `@layer theme.preview` | `--mde-preview-*`, `--gfm-alert-*`, and the mermaid base tokens. |

The leverage is in `tokens.css`. Inkdrop resolves ~890 semantic UI variables
through the design-token ramps, so replacing the ramps colors almost everything
at once; `ui.css` then names the few dozen places where Inkdrop's assumptions and
Monokai's differ. That is why `ui.css` is short.

`tokens.css` is generated — edit the palette in `scripts/lib/palette.mjs` and run
`npm run tokens`, don't hand-edit the CSS. The checks read that same palette, so
moving an anchor moves what they grade the theme against.

### Checks

```
npm run check
```

- **`check-tokens`** — converts every generated ramp back to hex for eyeballing,
  and asserts lightness decreases monotonically across each one. A ramp that dips
  inverts hover/border/disabled relationships across the whole UI without any
  single variable looking wrong.
- **`check-variables`** — verifies every variable this theme sets actually exists,
  against `@inkdropapp/css`'s own `variables.json`. There are 1638 of them; a name
  written from memory parses, cascades, and does nothing. Nothing else catches it.
- **`check-conditionals`** — the theme's layers outrank Inkdrop's, and layer order
  is decided before selector specificity, so a plain `:root { --x: … }` here beats
  a built-in `:root:has(body.acrylic-window) { --x: … }` there and quietly turns
  that branch off. This compares against the installed `@inkdropapp/css` and fails
  if any unconditional override shadows a conditional built-in. It is what keeps
  acrylic working.
- **`audit-palette`** — reads `palette.json` (the browser's resolved values for
  every theme variable) and reports any color whose hue sits outside the Monokai
  anchors. This is how you find variables the ramps did not reach.
- **`check-acrylic`** — renders the same stylesheet stack `generate-palette` uses,
  but with the acrylic body classes added, and asserts the surfaces come back
  translucent in all three states (plain, acrylic, acrylic on Windows).
  `generate-palette` only ever renders the opaque state, so without this the
  acrylic path — the one most likely to break — goes unchecked.

`palette.json` comes from `npm run palette`, which renders the theme in a real
browser. It needs Chrome; if Puppeteer has not downloaded its own, point it at an
installed one:

```
PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npm run palette
```

## License

MIT
