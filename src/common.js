/*
 * Workspace Link Copier — shared helpers.
 * Runs in the page's MAIN world. Exposes a frozen API on window.__WLC and nothing else.
 * Trusted Types: nodes are built with createElement/createElementNS and textContent only.
 */
(() => {
  'use strict';

  if (window.__WLC) return;

  const DEBUG = false;
  const PREFIX = '[WLC]';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Google Material Icons "share" (Apache License 2.0).
  const SHARE_ICON_PATH =
    'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z';

  const BUTTON_ID = 'wlc-btn';
  const BUTTON_LABEL = 'Copy shareable link';
  const TOOLTIP_DELAY_MS = 500;
  const TOAST_MS = 4000;
  const TOAST_FADE_MS = 150;
  const FLOATING_AFTER_MS = 5000;
  const OBSERVER_DELAY_MS = 250;

  /* ------------------------------------------------------------------ logger */

  const warned = new Set();
  const logger = Object.freeze({
    debug: (...args) => {
      if (DEBUG) console.debug(PREFIX, ...args);
    },
    warn: (...args) => console.warn(PREFIX, ...args),
    warnOnce: (key, ...args) => {
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(PREFIX, ...args);
    },
    info: (...args) => console.info(PREFIX, ...args),
  });

  /* ------------------------------------------------------------------ misc */

  const claimed = new Set();
  /** Returns true the first time a surface name is claimed, so each script starts only once. */
  function claim(name) {
    if (claimed.has(name)) return false;
    claimed.add(name);
    return true;
  }

  const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const isOurs = (el) => !!el.closest('.wlc-btn, .wlc-tooltip, .wlc-toast');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /* ------------------------------------------------------------------ anchors */

  /** First visible element matching `selector` (and `predicate`) inside `root`, ignoring our own UI. */
  function queryVisible(selector, predicate = null, root = document) {
    for (const el of root.querySelectorAll(selector)) {
      if (isOurs(el)) continue;
      if (predicate && !predicate(el)) continue;
      if (isVisible(el)) return el;
    }
    return null;
  }

  /** Tries each strategy (CSS selector string or function) in order; first visible match wins. */
  function findAnchor(strategies) {
    for (const strategy of strategies) {
      const el = typeof strategy === 'string' ? queryVisible(strategy) : strategy();
      if (el) return el;
    }
    return null;
  }

  /** Walks up single-child wrappers to reach the flex item that sits beside the other icons. */
  function toFlexItem(el) {
    let node = el;
    while (
      node.parentElement &&
      node.parentElement !== document.body &&
      node.parentElement !== document.documentElement &&
      node.parentElement.children.length === 1
    ) {
      node = node.parentElement;
    }
    return node;
  }

  /* ------------------------------------------------------------------ colour helpers */

  function parseRgb(value) {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(value || '');
    if (!m) return null;
    let alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[4] && m[4].endsWith('%')) alpha /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a: alpha };
  }

  function isLightColor(value) {
    const c = parseRgb(value);
    if (!c) return false;
    const lin = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b) > 0.5;
  }

  /** The colour Google uses for the neighbouring icon (SVG fill first, then text colour). */
  function pickIconColor(anchor) {
    for (const node of [anchor.querySelector('svg path'), anchor.querySelector('svg')]) {
      if (!node) continue;
      const fill = getComputedStyle(node).fill;
      const c = parseRgb(fill);
      if (c && c.a > 0) return fill;
    }
    const color = getComputedStyle(anchor).color;
    const c = parseRgb(color);
    return c && c.a > 0 ? color : null;
  }

  function pickSize(candidates) {
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && Math.abs(r.width - r.height) <= 2 && r.height >= 28 && r.height <= 48) {
        return Math.round(r.height);
      }
    }
    return null;
  }

  function setVar(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }

  const centerX = (r) => r.left + r.width / 2;
  const centerY = (r) => r.top + r.height / 2;
  const halfPx = (n) => Math.round(n * 2) / 2;

  /** Rect of the visible icon inside a Google button (falls back to the button itself). */
  function iconRect(el) {
    const icon = el.querySelector('svg, .docs-icon');
    const r = icon && icon.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : el.getBoundingClientRect();
  }

  const CONTROL_SELECTOR = '[role="button"], button, a[href], [aria-label]';

  /**
   * Centre-to-centre distance from the anchor's icon to the nearest Google icon on its right.
   * The next icon isn't always a sibling (Sheets nests the clock in its own container), so this
   * checks the next siblings of the flex item and of up to 3 of its ancestors.
   */
  function iconPitch(flexItem, anchorIcon) {
    let level = flexItem;
    for (let depth = 0; level && level !== document.body && depth < 4; depth++, level = level.parentElement) {
      for (let sib = level.nextElementSibling; sib; sib = sib.nextElementSibling) {
        if (isOurs(sib) || !isVisible(sib)) continue;
        for (const control of [sib, ...sib.querySelectorAll(CONTROL_SELECTOR)]) {
          if (!control.matches(CONTROL_SELECTOR) || !isVisible(control)) continue;
          const r = iconRect(control);
          if (r.width < 16 || r.width > 56) continue;
          if (Math.abs(centerY(r) - centerY(anchorIcon)) > 20) continue;
          const pitch = centerX(r) - centerX(anchorIcon);
          return pitch >= 24 && pitch <= 72 ? pitch : null;
        }
      }
    }
    return null;
  }

  /** Margin derived from the neighbour's own box, used when no icon pitch can be measured. */
  function fallbackMargin(flexItem, size) {
    const rect = flexItem.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ownMargin = clamp(parseFloat(getComputedStyle(flexItem).marginLeft) || 0, 0, 8);
    const squareish = Math.abs(rect.width - rect.height) <= 2;
    const extra = squareish ? Math.max(0, (rect.width - size) / 2) : 0;
    return squareish || ownMargin ? clamp(ownMargin + extra, 0, 12) : 4;
  }

  /**
   * Copies colour, size and spacing from Google's neighbouring icon button, then measures the
   * result and corrects it: the gap to the anchor matches the gap between Google's own icons,
   * and the icon is vertically centred on the anchor's icon. Self-correcting, so it converges
   * whatever layout (flex, inline, wrappers with padding) the host page uses.
   */
  function syncFromNeighbour(btn, anchor, flexItem) {
    const color = pickIconColor(anchor);
    if (color) {
      setVar(btn, '--wlc-color', color);
      const theme = isLightColor(color) ? 'dark' : 'light';
      if (btn.dataset.theme !== theme) btn.dataset.theme = theme;
    }

    const size = pickSize([anchor, flexItem]) || 40;
    setVar(btn, '--wlc-size', `${size}px`);

    // Horizontal: match the neighbours' centre-to-centre spacing.
    const anchorIcon = iconRect(anchor);
    const pitch = iconPitch(flexItem, anchorIcon);
    const btnRect = btn.getBoundingClientRect();
    const sameRow = Math.abs(centerY(btnRect) - centerY(anchorIcon)) < Math.max(anchorIcon.height, size);
    let margin;
    if (pitch && sameRow && btnRect.width > 0) {
      const gap = centerX(anchorIcon) - centerX(btnRect);
      const current = parseFloat(getComputedStyle(btn).marginRight) || 0;
      margin = clamp(current + (pitch - gap), 0, 24);
    } else {
      margin = fallbackMargin(flexItem, size);
    }
    if (margin !== null) {
      const current = parseFloat(btn.style.getPropertyValue('--wlc-margin'));
      if (!(Math.abs(margin - current) < 0.5)) setVar(btn, '--wlc-margin', `${halfPx(margin)}px`);
    }

    // Vertical: centre our icon on the anchor's icon (re-measured: the margin change may reflow).
    const target = iconRect(anchor);
    const ours = btn.getBoundingClientRect();
    if (target.height > 0 && ours.height > 0) {
      const currentOffset = parseFloat(btn.style.getPropertyValue('--wlc-offset-y')) || 0;
      const offset = clamp(currentOffset + (centerY(target) - centerY(ours)), -16, 16);
      if (Math.abs(offset - currentOffset) >= 0.5) setVar(btn, '--wlc-offset-y', `${halfPx(offset)}px`);
    }
  }

  /* ------------------------------------------------------------------ tooltip */

  let tooltipEl = null;
  let tooltipOwner = null;

  function getTooltipEl() {
    if (!tooltipEl || !tooltipEl.isConnected) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'wlc-tooltip';
      tooltipEl.className = 'wlc-tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  /** Shows a Google-style tooltip below `target` (above it if there is no room). */
  function showTooltip(target, text, { dark = false } = {}) {
    if (!target.isConnected) return;
    const tip = getTooltipEl();
    tip.textContent = text;
    tip.dataset.theme = dark ? 'dark' : 'light';
    tip.style.left = '0px';
    tip.style.top = '0px';

    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = clamp(r.left + r.width / 2 - t.width / 2, 8, Math.max(8, window.innerWidth - t.width - 8));
    let top = r.bottom + 8;
    if (top + t.height > window.innerHeight - 8) top = r.top - t.height - 8;

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.classList.add('wlc-visible');
    tooltipOwner = target;
    target.setAttribute('aria-describedby', tip.id);
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('wlc-visible');
    if (tooltipOwner) tooltipOwner.removeAttribute('aria-describedby');
    tooltipOwner = null;
  }

  /* ------------------------------------------------------------------ toast */

  let toastEl = null;
  let toastTimer = 0;

  /** Material snackbar, bottom-left. A new toast replaces the current one. */
  function showToast(message) {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();

    const toast = document.createElement('div');
    toast.id = 'wlc-toast';
    toast.className = 'wlc-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    document.body.appendChild(toast);
    toastEl = toast;

    void toast.offsetWidth; // commit the start state so the transition runs
    toast.classList.add('wlc-visible');

    toastTimer = setTimeout(() => {
      toast.classList.remove('wlc-visible');
      setTimeout(() => {
        toast.remove();
        if (toastEl === toast) toastEl = null;
      }, TOAST_FADE_MS + 50);
    }, TOAST_MS);
  }

  /* ------------------------------------------------------------------ clipboard */

  function legacyCopy(text) {
    const previous = document.activeElement;
    const ta = document.createElement('textarea');
    ta.className = 'wlc-offscreen';
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      logger.debug('execCommand copy failed', err);
    }
    ta.remove();
    if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    return ok;
  }

  /** Writes text to the clipboard. Resolves to true on success. */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      logger.debug('navigator.clipboard.writeText failed, using fallback', err);
    }
    return legacyCopy(text);
  }

  /* ------------------------------------------------------------------ button */

  function createIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'wlc-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', SHARE_ICON_PATH);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  /**
   * Creates the Material 3 standard icon button.
   * `onActivate` runs on click, Enter and Space — including while disabled, so callers can explain why.
   */
  function createShareButton({ tooltip, onActivate }) {
    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.className = 'wlc-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', BUTTON_LABEL);
    btn.appendChild(createIcon());

    let tooltipText = tooltip;
    let hoverTimer = 0;

    const show = () => showTooltip(btn, tooltipText, { dark: btn.dataset.theme === 'dark' });
    const hide = () => {
      clearTimeout(hoverTimer);
      if (tooltipOwner === btn) hideTooltip();
    };

    btn.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(show, TOOLTIP_DELAY_MS);
    });
    btn.addEventListener('mouseleave', hide);
    btn.addEventListener('focus', () => {
      if (btn.matches(':focus-visible')) show();
    });
    btn.addEventListener('blur', hide);

    const activate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      hide();
      Promise.resolve()
        .then(() => onActivate(event))
        .catch((err) => logger.warn('Unexpected error', err));
    };
    btn.addEventListener('click', activate);
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        activate(event);
      } else if (event.key === 'Escape') {
        hide();
      }
    });

    return Object.freeze({
      el: btn,
      setTooltip(text) {
        if (text === tooltipText) return;
        tooltipText = text;
        if (tooltipOwner === btn) show();
      },
      setDisabled(disabled) {
        if (disabled) {
          if (btn.getAttribute('aria-disabled') !== 'true') btn.setAttribute('aria-disabled', 'true');
        } else if (btn.hasAttribute('aria-disabled')) {
          btn.removeAttribute('aria-disabled');
        }
      },
      setLoading(loading) {
        if (loading) {
          btn.dataset.state = 'loading';
          btn.setAttribute('aria-busy', 'true');
        } else {
          delete btn.dataset.state;
          btn.removeAttribute('aria-busy');
        }
      },
    });
  }

  /**
   * Returns an idempotent `ensure()` that keeps the button placed before the anchor's flex item,
   * or floating in the top-right corner if no anchor is found once the page has settled.
   */
  function createPlacer({ button, findAnchor: locate, surface }) {
    const btn = button.el;
    const startedAt = performance.now();

    return function ensure() {
      for (const stale of document.querySelectorAll(`#${BUTTON_ID}, .wlc-btn`)) {
        if (stale !== btn) stale.remove();
      }

      const anchor = locate();
      if (anchor) {
        const item = toFlexItem(anchor);
        const placed = btn.isConnected && btn.nextElementSibling === item && !btn.classList.contains('wlc-floating');
        if (!placed && item.parentElement) {
          const before = iconRect(anchor);
          btn.classList.remove('wlc-floating');
          item.parentElement.insertBefore(btn, item);
          logger.debug(`${surface}: button placed`, item);
          syncFromNeighbour(btn, anchor, item);
          const after = iconRect(anchor);
          const shiftY = centerY(after) - centerY(before);
          if (Math.abs(shiftY) >= 1) {
            logger.warnOnce(`${surface}-shift`, `${surface}: inserting the button moved Google's icon by ${shiftY}px.`, item);
          }
          return true;
        }
        syncFromNeighbour(btn, anchor, item);
        return true;
      }

      // Anchor not found this time, but the button is still sitting in Google's header: leave it.
      if (btn.isConnected && !btn.classList.contains('wlc-floating')) return true;

      if (performance.now() - startedAt >= FLOATING_AFTER_MS) {
        if (!btn.isConnected || !btn.classList.contains('wlc-floating')) {
          btn.classList.add('wlc-floating');
          document.body.appendChild(btn);
          logger.warnOnce(
            `${surface}-anchor`,
            `${surface}: could not find the header icon to sit next to; showing a floating button instead.`
          );
        }
        return true;
      }
      return false;
    };
  }

  function removeButton(button) {
    if (tooltipOwner === button.el) hideTooltip();
    button.el.remove();
  }

  /* ------------------------------------------------------------------ SPA observer */

  /**
   * Calls `callback` after DOM changes (throttled: 250 ms + requestAnimationFrame) and on
   * hashchange / popstate. Returns a function that schedules a run manually.
   */
  function observe(callback) {
    let timer = 0;
    const run = () => {
      timer = 0;
      requestAnimationFrame(() => {
        try {
          callback();
        } catch (err) {
          logger.warn('Update failed', err);
        }
      });
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(run, OBSERVER_DELAY_MS);
    };

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    // Make sure the floating fallback gets a chance to run even if the page goes quiet.
    for (const ms of [1000, 3000, FLOATING_AFTER_MS + 100]) setTimeout(schedule, ms);
    run();
    return schedule;
  }

  /* ------------------------------------------------------------------ export */

  Object.defineProperty(window, '__WLC', {
    value: Object.freeze({
      logger,
      claim,
      isVisible,
      queryVisible,
      findAnchor,
      toFlexItem,
      createShareButton,
      createPlacer,
      removeButton,
      showTooltip,
      hideTooltip,
      showToast,
      copyText,
      observe,
    }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
})();
