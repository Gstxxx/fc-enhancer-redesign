# FC Enhancer — Redesigned (v2)

A complete UI refactor for the **FC Enhancer Trader** browser extension running on the EA FC Web App. Drops a modern glass-morphism interface over the existing controls without changing any of the trader logic.

## What's new in v2

- **Premium glass-morphism theme** — frosted panels, multi-stop accent gradient (teal → cyan → violet), subtle dot-grid backdrop, drop-shadow timer ring.
- **Refactored top bar** — coins / search / profit in clean stat cards, mono timestamps, animated SVG timer with state-aware color (running / paused / waiting).
- **Sticky two-column layout** — filters left, log right; both columns scroll independently, both bring their headers along.
- **Sub-tabs as pills** — Buy/Bid / Selling / Search / Safety / Captcha / Notifications / Common reformatted as a pill switcher with a gradient on the active tab.
- **iOS-style toggles** — gradient track when on, snappy spring transition; CSS uses `data-on` instead of mismatched class names.
- **Polished log entries** — `INFO` / `SUCCESS` / `WARN` / `ERROR` pills with inset border glow, colored left-bar per type, monospace timestamp chip, slide-in animation on each new entry.
- **Live log filter** — search box added to the log header; filters both `log-detail` rows and `search-log` blocks in real time.
- **Live status dot** — the pulse indicator next to "View Logs" turns gray when the bot is idle, green when running, driven by the Start/Stop button state.
- **Search result cards** — each item is a hoverable card with the rating in a gradient badge and a coin-style price.
- **Range sliders** — custom double-range with glow fill and bouncier thumb.
- **Compact mode** — `Ctrl+Shift+C` halves the padding for dense viewing.
- **Theme switcher** — `Ctrl+Shift+T` cycles four accent palettes (aurora / sunset / forest / royal).
- **Bottom tab bar** themed to match (active tab gets a gradient highlight strip).
- **Accessibility** — focus rings, reduced-motion friendly, ARIA-safe overrides.

## Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+C` | Toggle compact density |
| `Ctrl+Shift+T` | Cycle accent theme |

## Files

```
fc-enhancer-redesign/
├── manifest.json    # Manifest V3
├── styles.css       # Visual rules (~1200 lines)
├── content.js       # Toggle sync, autoscroll, log filter, theme switcher
├── README.md
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Install

1. Open `chrome://extensions/` in Chrome / Edge / Brave.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `fc-enhancer-redesign/` folder.
5. Open the EA FC Web App — the redesigned trader UI loads automatically.

If you want it on more hosts, edit `manifest.json`'s `host_permissions` and `content_scripts.matches`.

## How it works

- **No DOM rewrite.** The original FC Enhancer extension renders the trader UI; this extension only injects CSS rules with high-specificity selectors that override the original styles while keeping the DOM intact. Every existing button, input, and handler still works.
- **Content script** is small and additive: it mirrors toggle state into a `data-on` attribute so CSS can style cleanly, keeps the log auto-scroll smart, filters logs, mirrors Start/Stop into a live state dot, and binds the two hotkeys.
- **No network access.** Permissions: `activeTab`, `scripting`, and the EA host. No telemetry.

## Customizing colors

All theme tokens live at the top of `styles.css` under `:root`. Swap the accent in one place:

```css
--fce-accent:      #00ffc2;     /* primary    */
--fce-accent-2:    #0ea5ff;     /* secondary  */
--fce-accent-3:    #a855ff;     /* tertiary   */
--fce-accent-grad: linear-gradient(135deg, #00ffc2 0%, #0ea5ff 50%, #a855ff 100%);
```

Or just hit `Ctrl+Shift+T` to cycle the four built-in palettes.

## Compatibility notes

- Designed against FC Enhancer v26.0.x markup.
- If FC Enhancer ships a redesign and renames classes (`.ut-toggle-control`, `.process-log`, `.search-log-result`, etc.), the overrides on those classes will stop applying — open `styles.css` and update the selectors.
- Tested on Chrome 121+; should work in any Chromium browser.
