# FC Enhancer — Redesigned

A focused UI refactor for the **Trader** screen of the FC Enhancer browser extension running on the EA FC Web App. The top navbar and the side nav are themed across **every** page; everything else outside the Trader is left alone.

## Scope

| Surface | Restyled? |
|---|---|
| Top navbar (title, coins, profit, search count, countdown, timer) | ✅ on all pages |
| Side nav (Home / Squads / SBC / Trader / Store / etc.) | ✅ on all pages |
| Account menu (`⋯` with Manage Subscription + Sign out) | ✅ on all pages |
| **Trader** screen (filters + log + bot settings) | ✅ — full refactor |
| Squads / SBC / Transfer List / Store / Club / Login / Pack open / Dialogs | ❌ left as native EA |

## What changes on the Trader page

The Trader is broken into clean, separate cards rendered in a 2-column / 2-row grid:

```
┌──────────────────────┬──────────────────────────────┐
│  Tabs                │  Purchases (stats)           │
│  Quick Filters    ⋯  │  ┌────┬────┬─────┬─────┐    │
│  Filter Rotation     │  │Buys│Avg │Coins│Prof │    │
│  Search Parameters   │  └────┴────┴─────┴─────┘    │
│  Bot Settings        ├──────────────────────────────┤
│  ────────────────    │  View Logs                   │
│  Reset Start Stop CH │  [INFO] Bot Ready  04:31:38  │
└──────────────────────┴──────────────────────────────┘
```

### Left column (filter panel)
- **Tabs card** — Players / Managers / Club Items / Consumables; selected tab is a green pill.
- **Quick Filters card** — the Select Filters multiselect, with a `⋯` dropdown in the header that consolidates Save / Delete / Upload / Download / Reset / Search.
- **Filter Rotation card** — Searches Before Changing range + Randomize Filter Switch toggle.
- **Search Parameters card** — Player Name, Quality, Rarity, Position, Chemistry, Country, League, Club, PlayStyles, Enhancer Filters, Rating, Bid Price, Buy Now Price (all stacked one-per-row).
- **Bot Settings card** — `#futmenuitem` moved out of `.search-prices` into its own card; tabs (Buy/Bid / Selling / Search / Safety / Captcha / Notification / Common) wrap to multiple rows instead of horizontal scroll.
- **Action bar (sticky bottom)** — Reset / **START** (primary white) / Stop (red) / Clear History.

### Right column
- **Purchases stats card** — four sparkline tiles updating every 5s:
  - **Buys** — count of `Successfully W: …at NNNN` log entries
  - **Avg Price** — `totalSpent / buyCount`
  - **Coins** — sampled from `#idAbCoins`
  - **Profit** — sampled from `#idAbProfit`; turns red on negative
- **View Logs card** — color-coded `INFO` / `SUCCESS` / `WARN` / `ERROR` pills (cyan / green / amber / red), monospace timestamps, sticky header with a live status dot (green = running, gray = idle).

### Visual
- Monochrome dark palette with a single **emerald accent** (`#10b981`).
- Compact spacing (28px inputs/buttons, 13px base font).
- No scrollbars visible anywhere (scroll still works via mouse wheel / touchpad).
- All `[KeyB]` / `[Enter]` / `[ArrowLeft]` keyboard-hint labels from FC Enhancer hidden.
- "FC Enhancer" branding + discord/donation panels hidden from the navbar.

## Hotkey

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+C` | Toggle compact density |

## Files

```
fc-enhancer-redesign/
├── manifest.json   # Manifest V3
├── styles.css      # Visual rules (Trader + navbar + side nav)
├── content.js      # Section header injection, stats sampler, account menu,
│                   # saved-filters dropdown, orphan-timer fix, toggle sync,
│                   # log autoscroll, running-state indicator
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
5. Open the EA FC Web App — the redesign loads automatically on the Trader page.

## How it works

- **No DOM rewrite of the trader logic.** The FC Enhancer renders its UI; this extension only adds CSS overrides + a small content script for the bits CSS can't do alone:
  - **Section headers** — `<div class="fce-section-header">` injected above the saved-filter multiselect, filter-rotation row, and search-parameters block.
  - **Cards** — JS wraps `(header + body)` pairs in a single `<div class="fce-card">` so the outer flex `gap` lands between cards, not between a header and its body.
  - **`⋯` dropdown** — Save / Delete / Upload / Download / Reset / Search are proxied to the original FC Enhancer buttons via `dispatchEvent('mousedown') + .click()`.
  - **Stats panel** — `setInterval` every 5s reads `#idAbCoins` / `#idAbProfit`; a MutationObserver on `.process-log-messages` counts buys by regex on log text.
  - **Orphan timer fix** — relocates `.timer-container` back into the navbar if FC Enhancer's `.phone .timer-container { position: fixed }` leaks on landscape.
  - **Account menu** — finds the original `.btn-standard.section-header-btn.call-to-action` / `.btn-sign` buttons and hides their wrappers; injects a `⋯` next to the user info that triggers the same clicks.
- **No network access.** Permissions: `activeTab` + the EA host. No telemetry.
- **Idempotent** — every JS function checks for existing elements / wired flags before mutating, so the MutationObserver firing 200×/s during a tab switch doesn't pile up listeners or duplicate cards.

## Customizing the accent

Change one variable at the top of `styles.css`:

```css
--fce-accent:        #10b981;   /* emerald — default */
--fce-accent-hover:  #34d399;
```

Used by: selected nav tab pill, START button, sparkline strokes, Search menu item, profit color when positive.

## Compatibility notes

- Designed against **FC Enhancer v26.0.x** markup.
- If FC Enhancer ships a redesign and renames classes (`.ut-market-search-filters-view.trader.floating`, `.process-log`, `#futmenuitem`, `.panelActionRow.ab-filters`, etc.), the overrides on those classes stop applying — open `styles.css` and update the selectors. The JS side will mostly fail safely (functions return early if their anchor element is missing).
- Tested on Chrome 121+ / Edge / Brave; works in any Chromium browser with `:has()` support (Chrome 105+).
