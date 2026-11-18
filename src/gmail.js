/*
 * Workspace Link Copier — Gmail.
 * Copies https://mail.google.com/mail/#search/rfc822msgid%3A<Message-ID> for the first (oldest)
 * message of the open thread. See PRODUCT_SPEC.md §4.
 */
(() => {
  'use strict';

  const W = window.__WLC;
  if (!W || !W.claim('gmail')) return;

  const TOOLTIP_READY = 'Copy link to this email';
  const MSG_OPEN_EMAIL = 'Open an email to copy its link';
  const MSG_SUCCESS = 'Link to email copied';
  const MSG_NO_ID = "Couldn't find the email's Message-ID";
  const MSG_CLIPBOARD = "Couldn't copy to clipboard";

  const MAX_BYTES = 2 * 1024 * 1024;
  const SCAN_OVERLAP = 2048;
  const CACHE_LIMIT = 50;
  const NOT_FOUND_TEXT = 'The message you requested does not exist';
  const MESSAGE_ID_RE = /(?:^|[\s>])Message-ID:\s*(<[^>\s]+>)/i;
  const LINK_PREFIX = 'https://mail.google.com/mail/#search/rfc822msgid%3A';

  /** key (account + thread id) → { permId, promise: Promise<string> } */
  const cache = new Map();
  /** `${key}|${permId}` whose background prefetch failed; clicks still retry. */
  const prefetchFailed = new Set();
  let busy = false;

  const fail = (code, detail) => Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });

  /* ------------------------------------------------------------------ thread + message */

  function accountPrefix() {
    return location.pathname.match(/\/mail\/u\/\d+\//)?.[0] ?? '/mail/';
  }

  /** The visible open conversation, or null (§4.1). The thread id is used only as a cache key. */
  function getOpenThread() {
    for (const h2 of document.querySelectorAll('h2[data-legacy-thread-id]')) {
      const threadId = h2.getAttribute('data-legacy-thread-id');
      if (!threadId || !W.isVisible(h2)) continue;
      const root = h2.closest('[role="main"]') || document.querySelector('[role="main"]') || document;
      return { key: accountPrefix() + threadId, root };
    }
    return null;
  }

  /** permmsgid of the oldest rendered message, chosen by legacy hex id (§4.2). */
  function pickFirstMessage(root) {
    const entries = [];
    for (const node of root.querySelectorAll('[data-message-id]')) {
      const permId = (node.getAttribute('data-message-id') || '').replace(/^#/, '');
      if (!permId) continue;
      entries.push({ permId, legacy: node.getAttribute('data-legacy-message-id') || '' });
    }
    if (!entries.length) return null;

    // If any message lacks a legacy id we can't compare reliably: fall back to DOM order.
    if (!entries.every((e) => /^[0-9a-f]+$/i.test(e.legacy))) return entries[0].permId;

    let best = entries[0];
    let bestValue = BigInt('0x' + best.legacy);
    for (const entry of entries) {
      const value = BigInt('0x' + entry.legacy);
      if (value < bestValue) {
        best = entry;
        bestValue = value;
      }
    }
    return best.permId;
  }

  /* ------------------------------------------------------------------ "Show original" fetch */

  function showOriginalUrl(permId) {
    const acct = accountPrefix();
    const params = `view=om&permmsgid=${encodeURIComponent(permId)}`;
    const ik = window.GLOBALS?.[9];
    if (typeof ik === 'string' && ik) return `${acct}?ik=${encodeURIComponent(ik)}&${params}`;
    W.logger.warnOnce('gmail-ik', 'GLOBALS[9] (ik) not found; requesting "Show original" without ik.');
    return `${acct}?${params}`;
  }

  const NAMED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

  /** Single-pass decode so "&amp;lt;" becomes "&lt;", not "<". */
  function decodeEntities(text) {
    return text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|lt|gt|amp|quot|apos);/gi, (match, body) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });
  }

  /**
   * Scans the newly received part of the page (plus an overlap for headers split across chunks).
   * A leading "x" stops `^` from matching mid-word at the window start.
   */
  function matchMessageId(raw, from) {
    const start = Math.max(0, from - SCAN_OVERLAP);
    const text = decodeEntities(raw.slice(start));
    const match = MESSAGE_ID_RE.exec(start === 0 ? text : 'x' + text);
    return match ? match[1] : null;
  }

  /** Streams the "Show original" page and stops as soon as the Message-ID header is found (§4.4). */
  async function fetchMessageId(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw fail('HTTP', String(response.status));

    let raw = '';
    let bytes = 0;
    let scanned = 0;

    if (!response.body) {
      raw = (await response.text()).slice(0, MAX_BYTES);
      const id = matchMessageId(raw, 0);
      if (id) return id;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            raw += decoder.decode();
          } else {
            bytes += value.byteLength;
            raw += decoder.decode(value, { stream: true });
          }
          const id = matchMessageId(raw, scanned);
          scanned = raw.length;
          if (id) return id;
          if (done || bytes >= MAX_BYTES) break;
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    }

    if (raw.includes(NOT_FOUND_TEXT)) throw fail('MSG_NOT_FOUND');
    throw fail('NO_MESSAGE_ID', bytes >= MAX_BYTES ? 'not found in the first 2 MB' : 'header missing');
  }

  /* ------------------------------------------------------------------ link cache */

  /** Cached link promise for this thread + first message; rejected entries are dropped (§4.6). */
  function linkFor(key, permId) {
    const hit = cache.get(key);
    if (hit && hit.permId === permId) return hit.promise;

    const entry = { permId, promise: null };
    entry.promise = fetchMessageId(showOriginalUrl(permId))
      .then((messageId) => LINK_PREFIX + encodeURIComponent(messageId))
      .catch((err) => {
        if (cache.get(key) === entry) cache.delete(key);
        throw err;
      });

    cache.delete(key); // re-insert so Map order tracks recency
    cache.set(key, entry);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return entry.promise;
  }

  /* ------------------------------------------------------------------ UI */

  async function onActivate() {
    const thread = getOpenThread();
    if (!thread) {
      W.showToast(MSG_OPEN_EMAIL);
      return;
    }
    if (busy) return;

    busy = true;
    button.setLoading(true);
    try {
      const permId = pickFirstMessage(thread.root);
      if (!permId) {
        W.logger.warn('No [data-message-id] elements found in the open thread.');
        W.showToast(MSG_NO_ID);
        return;
      }

      let link;
      try {
        link = await linkFor(thread.key, permId);
        prefetchFailed.delete(`${thread.key}|${permId}`);
      } catch (err) {
        W.logger.warn("Couldn't resolve the Message-ID:", err);
        W.showToast(MSG_NO_ID);
        return;
      }

      if (await W.copyText(link)) {
        W.showToast(MSG_SUCCESS);
      } else {
        W.showToast(MSG_CLIPBOARD);
        W.logger.info('Link (copy it manually):', link);
      }
    } finally {
      busy = false;
      button.setLoading(false);
    }
  }

  const button = W.createShareButton({ tooltip: MSG_OPEN_EMAIL, onActivate });
  button.setDisabled(true);

  const SUPPORT_RE = /support|help/i;
  const ensurePlaced = W.createPlacer({
    button,
    surface: 'Gmail',
    findAnchor: () =>
      W.findAnchor([
        'header [aria-label="Support"]',
        'header [data-tooltip="Support"]',
        'header a[href*="support.google.com"]',
        () =>
          W.queryVisible(
            'header [aria-label], header [data-tooltip]',
            (el) =>
              SUPPORT_RE.test(el.getAttribute('aria-label') || '') ||
              SUPPORT_RE.test(el.getAttribute('data-tooltip') || '')
          ),
      ]),
  });

  function update() {
    ensurePlaced();

    const thread = getOpenThread();
    button.setDisabled(!thread);
    button.setTooltip(thread ? TOOLTIP_READY : MSG_OPEN_EMAIL);
    if (!thread) return;

    // Prefetch so the click can copy immediately, inside the user-activation window.
    const permId = pickFirstMessage(thread.root);
    if (!permId) return;
    const failKey = `${thread.key}|${permId}`;
    if (prefetchFailed.has(failKey)) return;
    linkFor(thread.key, permId).catch((err) => {
      prefetchFailed.add(failKey);
      W.logger.debug('Prefetch failed', err);
    });
  }

  W.observe(update);
})();
