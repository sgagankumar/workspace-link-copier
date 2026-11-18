/*
 * Workspace Link Copier — Google Sheets.
 * Copies https://docs.google.com/spreadsheets/d/<id>/edit?gid=<gid>#gid=<gid>&range=<A1>
 * for the current selection. See PRODUCT_SPEC.md §5.
 * Everything lives inside this IIFE: Sheets already defines globals such as `gid`.
 */
(() => {
  'use strict';

  const W = window.__WLC;
  if (!W || !W.claim('sheets')) return;

  const TOOLTIP = 'Copy link to this cell';
  const MSG_SHEET_ONLY = 'Copied sheet link';
  const MSG_NAMED_RANGE = "Copied sheet link (named ranges aren't supported)";
  const MSG_CLIPBOARD = "Couldn't copy to clipboard";

  const A1_RE = /^\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d+)?$|^[A-Z]{1,3}:[A-Z]{1,3}$|^\d+:\d+$/i;
  const REVISIONS_RE = /version history|last edit/i;

  /* ------------------------------------------------------------------ URL + selection */

  function getFileId() {
    const id = location.pathname.match(/\/d\/([^/]+)/)?.[1];
    return id && id !== 'e' ? id : null; // "/d/e/…" is a published (read-only) copy
  }

  const isEditor = () => !!getFileId() && /\/d\/[^/]+\/edit/.test(location.pathname);

  /** Current tab. The hash is what Sheets updates on tab switches, so it wins over ?gid=. */
  function getGid() {
    return location.hash.match(/gid=(\d+)/)?.[1] ?? location.href.match(/gid=(\d+)/)?.[1] ?? '0';
  }

  /** Reads the Name Box at click time (§5.1). */
  function readSelection() {
    const raw = (document.querySelector('#t-name-box')?.value || '').trim();
    if (!raw) return { kind: 'none', range: null };
    const range = raw.replace(/\$/g, '');
    if (A1_RE.test(range)) return { kind: 'a1', range: range.toUpperCase() };
    return { kind: 'named', range: null };
  }

  function buildLink(fileId, gid, range) {
    let link = `https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=${gid}#gid=${gid}`;
    if (range) link += `&range=${encodeURIComponent(range).replace(/%3A/gi, ':')}`;
    return link;
  }

  /* ------------------------------------------------------------------ UI */

  async function onActivate() {
    const fileId = getFileId();
    if (!fileId) return;

    const selection = readSelection();
    const link = buildLink(fileId, getGid(), selection.range);

    if (!(await W.copyText(link))) {
      W.showToast(MSG_CLIPBOARD);
      W.logger.info('Link (copy it manually):', link);
      return;
    }

    if (selection.kind === 'a1') W.showToast(`Link to ${selection.range} copied`);
    else if (selection.kind === 'named') W.showToast(MSG_NAMED_RANGE);
    else W.showToast(MSG_SHEET_ONLY);
  }

  const button = W.createShareButton({ tooltip: TOOLTIP, onActivate });

  const topBar = () =>
    document.querySelector('#docs-titlebar-container') || document.querySelector('#docs-chrome') || document;

  const ensurePlaced = W.createPlacer({
    button,
    surface: 'Sheets',
    findAnchor: () =>
      W.findAnchor([
        '#docs-revisions-appbarbutton',
        () =>
          W.queryVisible(
            '[aria-label], [data-tooltip]',
            (el) =>
              REVISIONS_RE.test(el.getAttribute('aria-label') || '') ||
              REVISIONS_RE.test(el.getAttribute('data-tooltip') || ''),
            topBar()
          ),
        '#docs-titlebar-share-client-button',
        () => W.queryVisible('[aria-label^="Share"]', null, topBar()),
      ]),
  });

  function update() {
    if (!isEditor()) {
      if (button.el.isConnected) W.removeButton(button);
      return;
    }
    ensurePlaced();
  }

  W.observe(update);
})();
