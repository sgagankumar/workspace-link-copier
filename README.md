# Workspace Link Copier

**Copy Email & Cell Links for Gmail™ and Sheets™**

A Chrome extension (Manifest V3) that adds one Share button, styled like Google's own icon buttons, to Gmail and Google Sheets. One click copies a link that points at one exact thing:

| Where | Button position | What gets copied |
|---|---|---|
| Gmail | Top-right header, just left of the **?** (Support) icon | A search link for the RFC 822 `Message-ID` of the **first (oldest) message** in the open thread, e.g. `https://mail.google.com/mail/#search/rfc822msgid%3A%3C…%40mail.gmail.com%3E` |
| Google Sheets | Top-right, just left of the version-history (clock) icon | A link to the file, the current tab and the selected cell or range, e.g. `https://docs.google.com/spreadsheets/d/<id>/edit?gid=123#gid=123&range=C30:G30` |

A short snackbar at the bottom-left confirms the copy or says what went wrong.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome 111 or newer.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder (the one containing `manifest.json`).
4. Reload any Gmail or Sheets tabs that were already open.

## Usage

- **Gmail:** open a conversation and click the Share icon next to **?**. In the inbox list (no conversation open) the button is dimmed; clicking it tells you to open an email first.
- **Sheets:** select a cell or range and click the Share icon next to the clock icon.
- Keyboard: Tab to the button and press Enter or Space.

## Limitations

- **Gmail links only work for people who received the first email of the thread.** The link is a Gmail search for that message's `Message-ID`, so it finds the conversation only in mailboxes that contain that message.
- The Gmail link deliberately leaves out `/u/N/`, so it opens in the recipient's default signed-in account.
- Gmail picks the oldest message *rendered on the page*. Gmail sometimes doesn't render every message of a long thread; the oldest one it shows is used.
- Sheets **named ranges** aren't supported: the link points at the tab without a range, and the toast says so.
- The extension finds its place in Google's UI with CSS selectors. Google changes its UI from time to time, so selectors may need updating. If the neighbouring icon can't be found, the button floats in the top-right corner and a `[WLC]` warning is logged in the console.

## How it works

- Content scripts run in the page's **MAIN world** (`"world": "MAIN"`) so Gmail's `GLOBALS` session key is readable. No `chrome.*` APIs are used.
- Gmail: the oldest `[data-message-id]` in the open thread is chosen by its legacy hex id. The script then fetches Gmail's own "Show original" page (same origin, `?ik=…&view=om&permmsgid=…`), streams it until the `Message-ID:` header appears, and caches the result per thread. The work starts as soon as a thread opens, so the click can copy right away.
- Sheets: the selection is read from the Name Box at click time, the file id from the URL path, and the tab id (`gid`) from the URL.
- All UI is built with `createElement`/`createElementNS` (Gmail enforces Trusted Types). No `innerHTML`, no `DOMParser`.

## Project layout

```
manifest.json
src/common.js        shared helpers on window.__WLC (button, tooltip, toast, clipboard, observer, anchors)
src/gmail.js         Gmail logic
src/sheets.js        Sheets logic
styles/content.css   all wlc- styles
icons/               icon.svg (source) and the PNG sizes
scripts/make-icons.ps1  dev-only: renders the PNGs on Windows (PowerShell + System.Drawing)
PRIVACY.md
```

To regenerate the icons: `powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1`.

Debug logging: set `const DEBUG = true` in `src/common.js`.

## Privacy

No data leaves your browser. See [PRIVACY.md](PRIVACY.md).

---

Workspace Link Copier is not affiliated with or endorsed by Google. Gmail and Google Sheets are trademarks of Google LLC.

The Share icon is from Google's Material Icons, licensed under the Apache License 2.0.
