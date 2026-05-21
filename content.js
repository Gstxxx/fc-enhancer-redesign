/* FC Enhancer Redesign — Content Script (v2)
   Adds dynamic behaviors that pure CSS can't handle:
   - Mirrors toggle on/off state to data-on so CSS can style cleanly
   - Auto-scrolls log to newest entry, pausing when user scrolls up
   - Adds tooltips with full timestamp to log entries
   - Compact-mode hotkey (Ctrl+Shift+C)
   - Theme accent switcher (Ctrl+Shift+T) — cycles teal/violet/amber
   - Live status dot reflects whether the bot is running (Start button text)
*/

(function () {
  'use strict';

  const ROOT_SELECTOR = '.ut-navigation-container-view';

  // ------------------------------------------------------------------
  // Wait for the FC Enhancer UI to be present
  // ------------------------------------------------------------------
  const waitForRoot = () =>
    new Promise((resolve) => {
      const found = document.querySelector(ROOT_SELECTOR);
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(ROOT_SELECTOR);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

  // ------------------------------------------------------------------
  // 1. Toggle state tracking — mirror class to data-on for CSS
  // ------------------------------------------------------------------
  function syncToggle(el) {
    const grip = el.querySelector('.ut-toggle-control--grip');
    const onByClass = el.classList.contains('toggled') ||
                      el.classList.contains('on') ||
                      el.dataset.on === 'true';
    // Some toggles use transform on the grip instead of a class flip
    let onByTransform = false;
    if (grip) {
      const t = getComputedStyle(grip).transform;
      // Any non-identity translate means it's been moved right (= on)
      onByTransform = t && t !== 'none' && !t.startsWith('matrix(1, 0, 0, 1, 0,');
    }
    el.dataset.on = String(onByClass || onByTransform);
  }

  function installToggleHandlers(root) {
    root.querySelectorAll('.ut-toggle-control').forEach((toggle) => {
      if (toggle.dataset.fceBound) return;
      toggle.dataset.fceBound = '1';

      syncToggle(toggle);

      const mo = new MutationObserver(() => syncToggle(toggle));
      mo.observe(toggle, { attributes: true, attributeFilter: ['class', 'style'] });

      const grip = toggle.querySelector('.ut-toggle-control--grip');
      if (grip) mo.observe(grip, { attributes: true, attributeFilter: ['class', 'style'] });
    });
  }

  // ------------------------------------------------------------------
  // 2. Auto-scroll log to newest entry on update
  // ------------------------------------------------------------------
  function installLogAutoscroll(root) {
    const logBox = root.querySelector('.process-log-messages');
    if (!logBox || logBox.dataset.fceBound) return;
    logBox.dataset.fceBound = '1';

    let userScrolling = false;
    let scrollTimer;
    logBox.addEventListener('scroll', () => {
      const nearBottom =
        logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 80;
      userScrolling = !nearBottom;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { userScrolling = false; }, 5000);
    });

    const mo = new MutationObserver(() => {
      if (!userScrolling) {
        requestAnimationFrame(() => {
          logBox.scrollTop = logBox.scrollHeight;
        });
      }
    });
    mo.observe(logBox, { childList: true });
  }

  // ------------------------------------------------------------------
  // 3. Add tooltips with full timestamp to log entries
  // ------------------------------------------------------------------
  function decorateNewLogEntries(root) {
    const logBox = root.querySelector('.process-log-messages');
    if (!logBox) return;

    const decorate = (entry) => {
      if (!entry || entry.nodeType !== 1) return;
      const timeEl = entry.querySelector?.('.time, .search-log-time');
      if (timeEl && !timeEl.title) {
        timeEl.title = `Logged at ${timeEl.textContent.trim()}`;
      }
      // Mark log type on the wrapper for the :has-less fallback
      const typeEl = entry.querySelector?.('.log-type');
      if (typeEl && entry.classList) {
        const type = typeEl.textContent.trim();
        entry.dataset.logType = type;
      }
    };

    logBox.querySelectorAll('.log-detail, .search-log').forEach(decorate);

    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => decorate(n)));
    });
    mo.observe(logBox, { childList: true });
  }

  // ------------------------------------------------------------------
  // 4. Compact-mode + accent switcher hotkeys
  // ------------------------------------------------------------------
  function installHotkeys(root) {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+C — compact mode
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        root.classList.toggle('fce-compact');
      }
    });
  }

  // ------------------------------------------------------------------
  // 5. Live "bot running" indicator
  //    The Start button toggles between enabled/disabled when the bot is
  //    running. We mirror that into a data-state on the process-log header
  //    so the pulse dot can change color.
  // ------------------------------------------------------------------
  function installRunningIndicator(root) {
    const startBtn = root.querySelector('.button-container .btn-standard.primary.call-to-action');
    const stopBtn  = root.querySelector('.button-container .btn-standard.primary.cancel-btn');
    const header   = root.querySelector('.process-log-header h3');
    if (!startBtn || !header) return;

    const update = () => {
      const running = startBtn.classList.contains('disabled') ||
                      startBtn.hasAttribute('disabled');
      const stopped = stopBtn ? (stopBtn.classList.contains('disabled') ||
                                 stopBtn.hasAttribute('disabled')) : !running;
      header.dataset.state = running ? 'running' : (stopped ? 'idle' : 'unknown');
    };

    update();

    const mo = new MutationObserver(update);
    mo.observe(startBtn, { attributes: true, attributeFilter: ['class', 'disabled'] });
    if (stopBtn) mo.observe(stopBtn, { attributes: true, attributeFilter: ['class', 'disabled'] });
  }

  // Inject state-dependent dot color
  function injectIndicatorStyles() {
    if (document.getElementById('fce-indicator-styles')) return;
    const style = document.createElement('style');
    style.id = 'fce-indicator-styles';
    style.textContent = `
      .process-log-header h3[data-state="idle"]::before {
        background: #52525b !important;
        box-shadow: none !important;
        animation: none !important;
      }
      .process-log-header h3[data-state="running"]::before {
        background: #fafafa !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }


  // ------------------------------------------------------------------
  // 7. Account menu — proxy "Manage Subscription" and "Sign out"
  //    into a single "⋯" dropdown in the top-right of the navbar.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // The FC Enhancer extension occasionally renders the circular timer
  // (`.timer-container`) OUTSIDE the navbar — typically as a free-floating
  // element near the top of the document when `.phone` styles trigger.
  // Detect orphans (timers whose ancestor chain misses .ut-navigation-bar-view)
  // and either hide them or move them back into the navbar.
  // ------------------------------------------------------------------
  function fixOrphanTimer() {
    const navBar = document.querySelector(
      '.ut-navigation-bar-view.navbar-style-landscape.currency-purchase'
    );
    const allTimers = document.querySelectorAll('.timer-container, svg.timer');
    allTimers.forEach((el) => {
      // Skip if it's already inside the navbar
      if (el.closest('.ut-navigation-bar-view')) return;
      // Skip if it's inside our own injected wrapper
      if (el.closest('.fce-account-menu')) return;
      // Orphan — try to relocate it back into the navbar, else hide it
      if (navBar) {
        // Look for an existing `.view-navbar-clubinfo-name` to host it
        const host = navBar.querySelector('.view-navbar-clubinfo-name');
        if (host && el.tagName === 'svg') {
          // Wrap in a timer-container if it's a raw <svg class="timer">
          let container = el.parentElement;
          if (!container || !container.classList?.contains('timer-container')) {
            container = document.createElement('div');
            container.className = 'timer-container';
            el.parentNode?.insertBefore(container, el);
            container.appendChild(el);
          }
          host.appendChild(container);
        } else {
          host?.appendChild(el);
        }
      } else {
        el.style.display = 'none';
      }
    });
  }

  // ------------------------------------------------------------------
  // Aggressively hide any FC Enhancer / Discord branding in the navbar.
  // The CSS rule covers the common case, but extension re-renders can
  // wrap the logo in new elements that miss the selector.
  // ------------------------------------------------------------------
  function hideEnhancerBranding(navBar) {
    if (!navBar) return;
    // Hide explicit logo anchors
    navBar.querySelectorAll('.app-logo, a[href*="discord.com"]').forEach((el) => {
      el.style.display = 'none';
    });
    // Hide any DIRECT child of navbar whose text matches "FC Enhancer"
    Array.from(navBar.children).forEach((child) => {
      if (child.classList?.contains('fce-account-menu')) return;
      const text = (child.textContent || '').trim();
      // Only hide if the WHOLE child is the branding (short text, no nested controls)
      if (
        text === 'FC Enhancer' ||
        text === 'FC Enhancerv' ||
        /^FC Enhancer( v[\d.]+)?$/.test(text)
      ) {
        child.style.display = 'none';
      }
    });
  }

  function installAccountMenu(root) {
    const navBar = document.querySelector(
      '.ut-navigation-bar-view.navbar-style-landscape.currency-purchase'
    );
    if (!navBar) return;

    hideEnhancerBranding(navBar);

    // Prefer exact class matches; fall back to text content if classes change.
    const matchByText = (selector, terms) => {
      const els = navBar.querySelectorAll(selector);
      for (const el of els) {
        if (el.closest('.fce-account-menu')) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        if (terms.some((t) => text === t || text.includes(t))) return el;
      }
      return null;
    };

    // Manage Subscription = .section-header-btn that ISN'T the sign-out (btn-sign)
    let manageBtn = navBar.querySelector(
      '.btn-standard.section-header-btn.call-to-action:not(.btn-sign)'
    );
    if (!manageBtn) manageBtn = matchByText('button, a', ['manage subscription', 'manage sub']);

    // Sign out = btn-sign
    let signOutBtn = navBar.querySelector('.btn-standard.section-header-btn.btn-sign');
    if (!signOutBtn) signOutBtn = matchByText('button, a', ['sign out', 'signout', 'sign-out']);

    if (!manageBtn && !signOutBtn) return;

    // Update menu refs if it already exists
    let menu = navBar.querySelector('.fce-account-menu');
    if (menu) {
      const manageItem = menu.querySelector('[data-action="manage"]');
      const signOutItem = menu.querySelector('[data-action="signout"]');
      if (manageItem && manageBtn) manageItem._proxyTarget = manageBtn;
      if (signOutItem && signOutBtn) signOutItem._proxyTarget = signOutBtn;
      return;
    }

    // Build menu
    menu = document.createElement('div');
    menu.className = 'fce-account-menu';

    const iconCard = `
      <svg class="fce-account-menu-item-icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
        <line x1="6" y1="15" x2="10" y2="15"/>
      </svg>`;
    const iconExit = `
      <svg class="fce-account-menu-item-icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>`;

    const manageHtml = manageBtn ? `
      <button type="button" class="fce-account-menu-item" data-action="manage">
        ${iconCard}<span>Manage Subscription</span>
      </button>` : '';
    const dividerHtml = (manageBtn && signOutBtn)
      ? '<div class="fce-account-menu-divider"></div>' : '';
    const signOutHtml = signOutBtn ? `
      <button type="button" class="fce-account-menu-item danger" data-action="signout">
        ${iconExit}<span>Sign out</span>
      </button>` : '';

    menu.innerHTML = `
      <button type="button" class="fce-account-menu-btn" aria-label="Account menu" title="Account">⋯</button>
      <div class="fce-account-menu-dropdown" role="menu">
        ${manageHtml}${dividerHtml}${signOutHtml}
      </div>`;

    const trigger = menu.querySelector('.fce-account-menu-btn');
    const dropdown = menu.querySelector('.fce-account-menu-dropdown');

    const manageItem = menu.querySelector('[data-action="manage"]');
    const signOutItem = menu.querySelector('[data-action="signout"]');
    if (manageItem) manageItem._proxyTarget = manageBtn;
    if (signOutItem) signOutItem._proxyTarget = signOutBtn;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !dropdown.classList.contains('open');
      dropdown.classList.toggle('open', willOpen);
      trigger.classList.toggle('open', willOpen);
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      }
    });

    menu.querySelectorAll('.fce-account-menu-item').forEach((item) => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const target = item._proxyTarget;
        if (target) {
          // Some buttons listen on mousedown rather than click — fire both for safety
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          target.click();
        }
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      });
    });

    navBar.appendChild(menu);
  }


  // ------------------------------------------------------------------
  // 7b. Inject section headers in the trader filter panel so we can
  //     style logically-grouped blocks as separate cards.
  // ------------------------------------------------------------------
  function injectSectionHeaders() {
    const panel = document.querySelector('.ut-market-search-filters-view.trader.floating');
    if (!panel) return;

    const iconBolt =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' +
      '</svg>';

    // Wrap an anchor element + a new header inside one .fce-card div so the
    // outer flex `gap` lands BETWEEN cards, not between header and its body.
    const wrap = (anchor, headerClass, titleHtml) => {
      if (!anchor) return;
      const cardClass = 'fce-card--' + headerClass.replace('fce-', '').replace('-header', '');
      // Already wrapped (parent IS a .fce-card)?
      if (anchor.parentElement && anchor.parentElement.classList.contains('fce-card')) return;
      // Duplicate guard: a card with this specific name already exists somewhere.
      // (Happens if FC Enhancer rebuilds an anchor element and we'd otherwise
      // create a second empty card.)
      if (panel.querySelector('.' + cardClass)) return;

      const card = document.createElement('div');
      card.className = 'fce-card ' + cardClass;

      const header = document.createElement('div');
      header.className = 'fce-section-header ' + headerClass;
      header.innerHTML = titleHtml;

      // Insert the card where the anchor was, then move both inside
      anchor.parentNode.insertBefore(card, anchor);
      card.appendChild(header);
      card.appendChild(anchor);
    };

    // Quick Filters: header + Select Filters multiselect
    wrap(
      panel.querySelector('.panelActionRow.ab-filters'),
      'fce-quick-filters-header',
      '<div class="fce-section-title">' + iconBolt + '<span>Quick Filters</span></div>'
    );

    // Filter Rotation: header + Searches Before Changing + Randomize Filter Switch
    wrap(
      panel.querySelector('.panelActionRow.filters:not(.filter-action-btn)'),
      'fce-rotation-header',
      '<div class="fce-section-title"><span>Filter Rotation</span></div>'
    );

    // Search Parameters: header + main .ut-item-search-view
    wrap(
      panel.querySelector('.ut-item-search-view:not(.extended-filters)'),
      'fce-search-params-header',
      '<div class="fce-section-title"><span>Search Parameters</span></div>'
    );

    // Bot Settings: extract #futmenuitem from its deep nesting inside
    // `.ut-item-search-view > .search-prices` and promote it to a sibling
    // card right after Search Parameters. FC Enhancer's tab-switching logic
    // uses document.getElementById('futmenuitem') so the move is safe.
    const futmenu = panel.querySelector('#futmenuitem');
    if (
      futmenu &&
      !(futmenu.parentElement && futmenu.parentElement.classList.contains('fce-card'))
    ) {
      const searchCard = panel.querySelector('.fce-card--search-params');
      if (searchCard) {
        const card = document.createElement('div');
        card.className = 'fce-card fce-card--bot-settings';

        const header = document.createElement('div');
        header.className = 'fce-section-header fce-bot-settings-header';
        header.innerHTML = '<div class="fce-section-title"><span>Bot Settings</span></div>';

        card.appendChild(header);
        card.appendChild(futmenu);  // moves it out of .search-prices

        // Insert the new card right after the Search Parameters card
        searchCard.parentNode.insertBefore(card, searchCard.nextSibling);
      }
    }
  }

  // ------------------------------------------------------------------
  // 8a. Saved Filters dropdown — collapse the Save/Delete/Upload/Download
  //     buttons into a single ⋯ menu next to the multiselect.
  // ------------------------------------------------------------------
  function installSavedFiltersDropdown() {
    const panel = document.querySelector('.ut-market-search-filters-view.trader.floating');
    if (!panel) return;
    if (panel.querySelector('.fce-saved-actions')) return; // already installed

    const buttonsRow = panel.querySelector('.panelActionRow.filters.filter-action-btn');
    if (!buttonsRow) return;
    const buttons = buttonsRow.querySelectorAll('button.btn-standard');
    if (buttons.length < 4) return;

    const abFiltersRow = panel.querySelector('.panelActionRow.ab-filters');
    if (!abFiltersRow) return;

    // Hide the original buttons row (CSS does this too, belt-and-suspenders)
    buttonsRow.dataset.fceHidden = 'true';

    // Also proxy the bottom bot-control buttons (Reset / Start) into the menu
    const bottomContainer = panel.querySelector('.button-container');
    const containerBtns = bottomContainer?.querySelectorAll('.btn-standard') || [];
    const resetBtn = containerBtns[0] || null;          // Reset
    const startBtn = bottomContainer?.querySelector('.btn-standard.primary.call-to-action') || containerBtns[1] || null;

    // Map action → original button
    const actions = {
      save: buttons[0],
      delete: buttons[1],
      upload: buttons[2],
      download: buttons[3],
      reset: resetBtn,
      search: startBtn,
    };

    // Build the actions dropdown
    const iconSave = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    const iconTrash = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
    const iconUp = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    const iconDown = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const iconReset = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    const iconSearch = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'fce-saved-actions';
    menu.innerHTML =
      '<button type="button" class="fce-saved-actions-btn" title="Filter actions" aria-label="Saved filter actions">⋯</button>' +
      '<div class="fce-saved-actions-dropdown" role="menu">' +
        '<button type="button" data-fce-saved="save" role="menuitem">' + iconSave + '<span>Save</span></button>' +
        '<button type="button" data-fce-saved="delete" role="menuitem" class="danger">' + iconTrash + '<span>Delete</span></button>' +
        '<button type="button" data-fce-saved="upload" role="menuitem">' + iconUp + '<span>Upload</span></button>' +
        '<button type="button" data-fce-saved="download" role="menuitem">' + iconDown + '<span>Download</span></button>' +
        '<button type="button" data-fce-saved="reset" role="menuitem">' + iconReset + '<span>Reset</span></button>' +
        '<button type="button" data-fce-saved="search" role="menuitem" class="accent">' + iconSearch + '<span>Search</span></button>' +
      '</div>';

    // Anchor: prefer the injected Quick Filters header; fall back to ab-filters row
    const quickHeader = panel.querySelector('.fce-quick-filters-header');
    (quickHeader || abFiltersRow).appendChild(menu);

    const trigger = menu.querySelector('.fce-saved-actions-btn');
    const dropdown = menu.querySelector('.fce-saved-actions-dropdown');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !dropdown.classList.contains('open');
      dropdown.classList.toggle('open', open);
      trigger.classList.toggle('open', open);
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      }
    });

    menu.querySelectorAll('[data-fce-saved]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = actions[item.dataset.fceSaved];
        if (target) {
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          target.click();
        }
        dropdown.classList.remove('open');
        trigger.classList.remove('open');
      });
    });
  }

  // ------------------------------------------------------------------
  // 8b. Trader stats panel — sparkline cards above the log showing
  //     coins / profit / buys over time.
  // ------------------------------------------------------------------
  const FCE_STATS_MAX = 60;
  const FCE_STATS_INTERVAL_MS = 5000;
  const fceStats = {
    coins: [],
    profit: [],
    buys: [],
    buyCount: 0,
    totalSpent: 0,
  };

  function parseNumericText(el) {
    if (!el) return null;
    const raw = (el.textContent || '').replace(/[^\d.-]/g, '');
    if (raw === '' || raw === '-') return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }

  function sampleTraderStats() {
    const coins = parseNumericText(document.querySelector('#idAbCoins'));
    const profit = parseNumericText(document.querySelector('#idAbProfit'));
    const now = Date.now();
    if (coins === null && profit === null) return;
    pushPoint(fceStats.coins, now, coins ?? 0);
    pushPoint(fceStats.profit, now, profit ?? 0);
    pushPoint(fceStats.buys, now, fceStats.buyCount);
    renderTraderStats();
  }
  function pushPoint(arr, t, v) {
    arr.push({ t, v });
    while (arr.length > FCE_STATS_MAX) arr.shift();
  }

  function trackBuysFromLog() {
    const logBox = document.querySelector('.process-log-messages');
    if (!logBox || logBox._fceBuyTracking) return;
    logBox._fceBuyTracking = true;
    logBox.querySelectorAll('.log-detail').forEach(scanForBuy);
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach(scanForBuy));
    });
    mo.observe(logBox, { childList: true });
  }
  function scanForBuy(node) {
    if (!node || node.nodeType !== 1) return;
    const msg = node.querySelector?.('.log-message .message')?.textContent || '';
    const m = msg.match(/Successfully\s+[WB]:\s*\d+\s+.+?\s+at\s+(\d+)/i);
    if (m) {
      fceStats.buyCount++;
      fceStats.totalSpent += parseInt(m[1], 10) || 0;
    }
  }

  function fmtNum(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(n).toString();
  }

  function renderSparkline(svg, points) {
    if (!svg || !points || points.length < 2) {
      if (svg) svg.innerHTML = '';
      return;
    }
    const vals = points.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const N = points.length;
    const W = 100, H = 30, PAD = 2;
    const d = points.map((p, i) => {
      const x = (i / (N - 1)) * W;
      const y = H - PAD - ((p.v - min) / range) * (H - PAD * 2);
      return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
    }).join(' ');
    const area = d + ' L ' + W + ' ' + H + ' L 0 ' + H + ' Z';
    svg.innerHTML =
      '<path d="' + area + '" fill="rgba(250,250,250,0.06)"/>' +
      '<path d="' + d + '" fill="none" stroke="#fafafa" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function renderTraderStats() {
    const panel = document.querySelector('.fce-stats-panel');
    if (!panel) return;
    const card = (m) => panel.querySelector('[data-metric="' + m + '"]');

    const coinsC = card('coins');
    if (coinsC) {
      coinsC.querySelector('.fce-stat-value').textContent =
        fmtNum(fceStats.coins[fceStats.coins.length - 1]?.v);
      renderSparkline(coinsC.querySelector('svg'), fceStats.coins);
    }
    const profC = card('profit');
    if (profC) {
      const last = fceStats.profit[fceStats.profit.length - 1]?.v;
      profC.querySelector('.fce-stat-value').textContent = fmtNum(last);
      profC.classList.toggle('fce-stat-negative', (last ?? 0) < 0);
      renderSparkline(profC.querySelector('svg'), fceStats.profit);
    }
    const buysC = card('buys');
    if (buysC) {
      buysC.querySelector('.fce-stat-value').textContent = fmtNum(fceStats.buyCount);
      renderSparkline(buysC.querySelector('svg'), fceStats.buys);
    }
    const avgC = card('avg');
    if (avgC) {
      const avg = fceStats.buyCount > 0 ? fceStats.totalSpent / fceStats.buyCount : null;
      avgC.querySelector('.fce-stat-value').textContent = fmtNum(avg);
    }
  }

  function installStatsPanel() {
    const log = document.querySelector('.process-log');
    if (!log) return;
    const container = log.parentElement;
    if (!container) return;
    if (container.querySelector('.fce-stats-panel')) return;

    const panel = document.createElement('section');
    panel.className = 'fce-stats-panel';
    panel.innerHTML =
      '<div class="fce-stats-header">' +
        '<h3>Purchases</h3>' +
        '<span class="fce-stats-range">live</span>' +
      '</div>' +
      '<div class="fce-stats-grid">' +
        '<div class="fce-stat-card" data-metric="buys">' +
          '<div class="fce-stat-label">Buys</div>' +
          '<div class="fce-stat-value">0</div>' +
          '<svg class="fce-stat-chart" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>' +
        '</div>' +
        '<div class="fce-stat-card" data-metric="avg">' +
          '<div class="fce-stat-label">Avg Price</div>' +
          '<div class="fce-stat-value">—</div>' +
          '<div class="fce-stat-chart-empty">—</div>' +
        '</div>' +
        '<div class="fce-stat-card" data-metric="coins">' +
          '<div class="fce-stat-label">Coins</div>' +
          '<div class="fce-stat-value">—</div>' +
          '<svg class="fce-stat-chart" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>' +
        '</div>' +
        '<div class="fce-stat-card" data-metric="profit">' +
          '<div class="fce-stat-label">Profit</div>' +
          '<div class="fce-stat-value">—</div>' +
          '<svg class="fce-stat-chart" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>' +
        '</div>' +
      '</div>';
    container.insertBefore(panel, log);

    trackBuysFromLog();
    sampleTraderStats();
    if (!window.__fceStatsTimer) {
      window.__fceStatsTimer = setInterval(sampleTraderStats, FCE_STATS_INTERVAL_MS);
    }
  }

  // ------------------------------------------------------------------
  // 9. Global observer to wire up newly-rendered elements
  // ------------------------------------------------------------------
  function installGlobalObserver(root) {
    const mo = new MutationObserver(() => {
      installToggleHandlers(root);
      installLogAutoscroll(root);
      decorateNewLogEntries(root);
      installRunningIndicator(root);
      installAccountMenu(root);
      fixOrphanTimer();
      installStatsPanel();
      injectSectionHeaders();          // run BEFORE dropdown so it can anchor inside
      installSavedFiltersDropdown();
    });
    mo.observe(root, { childList: true, subtree: true });

    // Also observe document body — the navbar can be re-rendered outside `root`,
    // and the timer-container can leak out too.
    const moBody = new MutationObserver(() => {
      installAccountMenu(root);
      fixOrphanTimer();
    });
    moBody.observe(document.body, { childList: true, subtree: true });
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  waitForRoot().then((root) => {
    injectIndicatorStyles();
    installToggleHandlers(root);
    installLogAutoscroll(root);
    decorateNewLogEntries(root);
    installHotkeys(root);
    installRunningIndicator(root);
    installAccountMenu(root);
    fixOrphanTimer();
    installStatsPanel();
    injectSectionHeaders();
    installSavedFiltersDropdown();
    installGlobalObserver(root);

    root.classList.add('fce-redesigned');
    console.log(
      '%c[FC Enhancer Redesign v3] %cloaded ✓  (Ctrl+Shift+C = compact)',
      'color:#fafafa; font-weight:bold',
      'color:#a1a1aa'
    );
  });
})();
