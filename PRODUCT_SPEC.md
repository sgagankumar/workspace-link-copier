# Workspace Link Copier — Product & Build Specification

> **Store name:** Workspace Link Copier
> **Store subtitle:** Copy Email & Cell Links for Gmail™ and Sheets™
> **Type:** Chrome extension, Manifest V3, plain JavaScript, no build step, no dependencies
> **Status of research:** Every Gmail and Sheets technique in this document was verified by hand in the browser console on 2026‑11‑18. Use these techniques exactly; do not substitute alternatives.

---

## 1. Agenda — why this exists

Sharing a pointer to *one exact thing* inside Google Workspace is slow and unreliable today:

- **Gmail:** the URL in the address bar (`/mail/u/0/#sent/FMfcgz…`) only works for the person who copied it. A colleague who received the same email cannot open it, and `u/0` points at whichever account they signed into first. The only portable link is a search for the email's RFC 822 `Message-ID` (`#search/rfc822msgid:…`), and building it by hand takes ~6 steps: open ⋮ → Show original → copy Message‑ID → URL‑encode → prepend the search prefix → paste.
- **Sheets:** linking to a specific cell takes 4 clicks: right‑click → View more cell actions → Get link to this cell → copy.

**Goal:** one click, from a button that looks like it shipped with Google's UI, copies the correct shareable link to the clipboard.

## 2. What we are building (scope)

### In scope (v1)

| Surface | Button location | What gets copied |
|---|---|---|
| **Gmail** | Top‑right header, immediately left of the **"?" Support** icon | Search link for the RFC 822 Message‑ID of the **first (oldest) message** in the open thread |
| **Google Sheets** | Top‑right toolbar, immediately left of the **version‑history / "Last edit"** (clock) icon | Link to the current file, current tab (gid) and current selected cell or range |

- One button per surface, using **only the Material "Share" icon** (Section 6).
- A Google‑style snackbar toast confirms "Link copied" or shows a short error.
- Everything runs locally in the browser. No servers, no analytics, no OAuth, no Google APIs.

### Out of scope (do NOT build)

- Changing file sharing permissions, OAuth, Drive API, Gmail API
- Google Docs, Google Slides (future, Section 12)
- Toolbar popup UI, options page, context menus, keyboard shortcuts
- Per‑message buttons in Gmail (we deliberately use the first message only)
- Any remote code, CDN fonts, external network requests

## 3. How it works — overview

```
Gmail tab (content script, MAIN world)
  ├─ watch for SPA view changes (MutationObserver + hashchange)
  ├─ inject Share button next to "?" (idempotent)
  ├─ when a thread is open:
  │    read all [data-message-id] elements → pick oldest by legacy hex id
  │    fetch same-origin "Show original" page using ik + permmsgid
  │    regex the Message-ID header → build link → cache by thread id
  └─ on click: copy cached link (or fetch now) → toast

Sheets tab (content script, MAIN world)
  ├─ watch for DOM readiness (MutationObserver)
  ├─ inject Share button next to version-history icon (idempotent)
  └─ on click: read Name Box + URL → build link → copy → toast
```

## 4. Gmail — verified technical details

### 4.1 Detecting an open thread
- A thread is open when `document.querySelector('h2[data-legacy-thread-id]')` exists.
- Use the attribute value (hex, e.g. `1a1ef9186ac5f665`) **only as a cache key**.
- **Verified:** the thread ID is **not** the first message's ID. Do not use it to fetch anything.

### 4.2 Finding the first message
- Every rendered message element carries:
  - `data-message-id` — e.g. `#msg-a:r-3495723440329498411` (sent by user) or `#msg-f:1882215577553335909` (received). Strip the leading `#`.
  - `data-legacy-message-id` — hex, e.g. `1a1ef91a96617ffe`.
- **Verified:** not every message in a thread is guaranteed to appear (a 3‑message thread returned 2 elements). Therefore pick the **oldest** message by comparing `BigInt('0x' + legacyId)` and choosing the smallest, rather than trusting DOM order. If an element lacks a legacy id, fall back to DOM order (first element).
- Scope the query to the open conversation: prefer `document.querySelector('[role="main"]')` as the root, falling back to `document`.
- **Never** construct `msg-f:` from a hex id. Sent messages use `msg-a:r…` and can only be read from the DOM. (Verified: building `msg-f:` from the thread id returned "The message you requested does not exist".)

### 4.3 Getting the session key `ik`
- `ik` is `window.GLOBALS[9]` (verified value shape: `4bf02b0d33`).
- `GLOBALS` exists only in the page's **MAIN world**, which is why the content script runs with `"world": "MAIN"`.

### 4.4 Fetching the raw message ("Show original")
- Account path prefix: `location.pathname.match(/\/mail\/u\/\d+\//)?.[0] ?? '/mail/'`
- URL (verified working, returned 200 and ~24 KB):
  ```
  ${acct}?ik=${ik}&view=om&permmsgid=${encodeURIComponent(permId)}
  ```
  Example: `/mail/u/0/?ik=4bf02b0d33&view=om&permmsgid=msg-a%3Ar-3495723440329498411`
- `fetch(url, { credentials: 'include' })` — same origin, uses the user's session.
- **Stream the body** with `response.body.getReader()` + `TextDecoder`, append chunks, test the regex after each chunk, and `reader.cancel()` as soon as the Message‑ID is found. Stop reading after 2 MB regardless (emails with attachments can be huge).
- Decode HTML entities before matching: `&lt;`→`<`, `&gt;`→`>`, `&amp;`→`&`, plus numeric `&#60;`, `&#x3c;` forms.
- Match: `/(?:^|[\s>])Message-ID:\s*(<[^>\s]+>)/i` and take capture group 1 (includes the angle brackets).
- If the body contains `The message you requested does not exist`, treat as error `MSG_NOT_FOUND`.

### 4.5 Building the link (verified)
```js
const link = 'https://mail.google.com/mail/#search/rfc822msgid%3A' + encodeURIComponent(messageId);
```
- `messageId` includes `<` and `>`; they encode to `%3C`/`%3E`.
- Deliberately **omit `u/N/`** so the recipient opens it in their default account.
- Verified output:
  `https://mail.google.com/mail/#search/rfc822msgid%3A%3CCAAQkyhDrc3H4hkpEvVexvmrDkJ0aK1NApz7DDg18eLWczM723w%40mail.gmail.com%3E`

### 4.6 Prefetch and caching
- When a thread becomes visible, resolve the link in the background and store it in a `Map<threadId, Promise<string>>`.
- On click: `await` the cached promise (or start one) and copy. Prefetching keeps the click within the browser's user‑activation window for clipboard writes.
- Clear a cache entry if it rejected, so the next click retries.

### 4.7 Button placement in Gmail
Insert the button immediately **before** the Support ("?") control in the top header. Locate it with this fallback chain, first match wins:
1. `header [aria-label="Support"]`
2. `header [data-tooltip="Support"]`
3. `header a[href*="support.google.com"]`
4. Any element in `header` whose `aria-label` or `data-tooltip` matches `/support|help/i`

Then walk up from the found element while `parentElement.children.length === 1` to reach the flex item that is a sibling of the other header icons, and insert before that item.
**Fallback:** if nothing is found after the page has settled (~5 s), render the button `position: fixed` in the top‑right header area (class `wlc-floating`) so the feature still works. Log a `[WLC]` warning.

### 4.8 Gmail button states
- Always visible in the header.
- When no thread is open: `aria-disabled="true"`, reduced opacity, tooltip "Open an email to copy its link"; clicking shows a toast with the same text.
- While resolving: `data-state="loading"` (cursor: progress, no spinner needed).

## 5. Google Sheets — verified technical details

### 5.1 Reading the selection
- Name Box: `document.querySelector('#t-name-box')?.value` — verified values `D31` and `C30:G30`.
- **Read at click time** (selection changes constantly; no prefetch).

### 5.2 Reading file and tab
- File ID: `location.pathname.match(/\/d\/([^/]+)/)?.[1]`
- gid: `location.href.match(/gid=(\d+)/)?.[1] ?? '0'`
- Wrap all logic in functions/modules: Sheets already defines globals such as `gid`, so top‑level `const gid` throws "Identifier 'gid' has already been declared" (verified).

### 5.3 Building the link (verified)
```js
`https://docs.google.com/spreadsheets/d/${fileId}/edit?gid=${gid}#gid=${gid}&range=${range}`
```
- Keep `:` unencoded so links match Google's own "Get link to this cell" format (`range=C30:G30`). Encode other characters with `encodeURIComponent` and then replace `%3A` back to `:`.
- Validate the Name Box value as A1 notation: `/^\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d+)?$|^[A-Z]{1,3}:[A-Z]{1,3}$|^\d+:\d+$/i`. Strip `$`.
- If it is not A1 notation (e.g. a **named range**), copy the link **without** `&range=…` and toast "Copied sheet link (named ranges aren't supported)".

### 5.4 Button placement in Sheets
Insert immediately **before** the version‑history / "Last edit" (clock) control at the top right. Fallback chain:
1. `#docs-revisions-appbarbutton`
2. Element whose `aria-label` or `data-tooltip` matches `/version history|last edit/i` within the top bar
3. Immediately left of the Share button: `#docs-titlebar-share-client-button`, or element whose `aria-label` starts with `Share`
4. Floating fallback as in Gmail

Walk up single‑child wrappers as in 4.7 before inserting. Selectors in Google apps change; the fallback chain and console warnings are mandatory.

## 6. Visual design — must look native to Google

The button must be indistinguishable in style from Google's own header icon buttons (Material Design 3 "standard icon button").

### 6.1 Icon — Material "Share" only
Use exactly this icon (Google Material Icons "share", Apache License 2.0), rendered as **inline SVG** built with `document.createElementNS` (no icon fonts, no external requests):

```
viewBox="0 0 24 24"
path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"
fill="currentColor"
```
No text label, no other icons anywhere in the UI.

### 6.2 Button
- 40 × 40 px circle (`border-radius: 50%`), icon 24 × 24 px, centered; `margin: 0 4px` (match neighbours if different — measure the neighbour's computed width/height/margin and copy it).
- Transparent background, no border.
- **Color:** at injection time copy `getComputedStyle(neighbourIcon).color` onto the button, and set `fill: currentColor` on the SVG. This automatically matches light, dark and themed Gmail/Sheets.
- **Hover:** state layer `background-color: color-mix(in srgb, currentColor 8%, transparent)`; **pressed:** 12%; transition 150 ms.
- **Focus:** keyboard focus ring `outline: 2px solid #1a73e8; outline-offset: 2px` (light) — use `:focus-visible` only.
- **Disabled:** `opacity: .38`, `cursor: default`.
- Accessibility: `role="button"`, `tabindex="0"`, `aria-label="Copy shareable link"`, activate on Enter/Space.

### 6.3 Tooltip (Google style)
- Appears below the button after 500 ms hover or on focus; disappears on leave/blur.
- `background: #3c4043` (dark theme: `#e8eaed` with `#202124` text), `color: #fff`, `font: 500 12px/16px "Google Sans", Roboto, Arial, sans-serif`, `padding: 4px 8px`, `border-radius: 4px`, max one line.
- Text: Gmail → "Copy link to this email"; Sheets → "Copy link to this cell". Disabled Gmail → "Open an email to copy its link".

### 6.4 Snackbar toast (Google style)
- Fixed bottom‑left: `left: 24px; bottom: 24px`, `z-index: 2147483647`.
- `background: #323232` (Material snackbar), `color: #fff`, `font: 400 14px/20px "Google Sans", Roboto, Arial, sans-serif`, `padding: 14px 24px`, `border-radius: 4px`, Material elevation shadow, min‑width 288 px.
- Fade/slide in 150 ms, auto‑dismiss after 4 s; a new toast replaces the old one.
- Messages:
  - Success Gmail: "Link to email copied"
  - Success Sheets: "Link to C30:G30 copied" (use the actual range)
  - Errors: "Couldn't find the email's Message-ID", "Open an email to copy its link", "Couldn't copy to clipboard"

### 6.5 Fonts and CSS
- Do not load fonts; rely on the page's already loaded Google Sans/Roboto.
- Prefix every id/class with `wlc-` to avoid collisions. Ship styles in `content.css` (declared in the manifest).

## 7. Platform constraints (verified, mandatory)

1. **Trusted Types:** Gmail enforces Trusted Types. `DOMParser.parseFromString` threw *"This document requires 'TrustedHTML' assignment"*. Therefore:
   - Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`, `document.write`.
   - Build every node with `createElement` / `createElementNS`, set text with `textContent`.
   - Parse fetched HTML with regex on the decoded string only.
   Apply the same rule to Sheets.
2. **MAIN world:** content scripts use `"world": "MAIN"` (Chrome 111+) so `GLOBALS` is readable. Consequence: `chrome.*` APIs are unavailable in the scripts — none are needed.
3. **SPA navigation:** Gmail and Sheets never reload. Use one `MutationObserver` on `document.body` (`childList: true, subtree: true`) throttled with `requestAnimationFrame` + 250 ms debounce, plus `hashchange` and `popstate` listeners. Injection must be **idempotent** (check `#wlc-btn` exists and is still connected).
4. **Clipboard:** call `navigator.clipboard.writeText(link)` inside the click handler. Fallback: temporary off‑screen `<textarea>` + `document.execCommand('copy')`.
5. **No globals leakage:** wrap each script in an IIFE; expose shared helpers only on `window.__WLC` (frozen object).
6. **Logging:** `console.debug('[WLC]', …)` behind `const DEBUG = false`; warnings (selector not found) always log with `[WLC]` prefix.

## 8. Project structure

```
workspace-link-copier/
├── manifest.json
├── src/
│   ├── common.js     # window.__WLC: createShareButton, showToast, showTooltip, copyText, observe, findAnchor, logger
│   ├── gmail.js      # Gmail logic (Section 4)
│   └── sheets.js     # Sheets logic (Section 5)
├── styles/
│   └── content.css   # all wlc- styles (Section 6)
├── icons/
│   ├── icon16.png, icon32.png, icon48.png, icon128.png
│   └── icon.svg      # source: white Share glyph on #1a73e8 circle
├── scripts/
│   └── make-icons.mjs  # optional: renders icon.svg to PNG sizes (dev-only)
├── README.md
└── PRIVACY.md
```

### 8.1 manifest.json (target)
```json
{
  "manifest_version": 3,
  "name": "Workspace Link Copier",
  "short_name": "Link Copier",
  "version": "1.0.0",
  "description": "Copy Email & Cell Links for Gmail™ and Sheets™ in one click.",
  "minimum_chrome_version": "111",
  "icons": { "16": "icons/icon16.png", "32": "icons/icon32.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["src/common.js", "src/gmail.js"],
      "css": ["styles/content.css"],
      "run_at": "document_idle",
      "world": "MAIN"
    },
    {
      "matches": ["https://docs.google.com/spreadsheets/*"],
      "js": ["src/common.js", "src/sheets.js"],
      "css": ["styles/content.css"],
      "run_at": "document_idle",
      "world": "MAIN"
    }
  ]
}
```
- No `permissions`, no `host_permissions`, no background service worker, no popup.
- If PNG icons are not generated, remove the `icons` key rather than referencing missing files (the extension must load unpacked without errors).

## 9. Error handling matrix

| Situation | Behaviour |
|---|---|
| Gmail: no thread open | Disabled button; click → toast "Open an email to copy its link" |
| Gmail: no `[data-message-id]` found | Toast "Couldn't find the email's Message-ID"; warn in console |
| Gmail: `GLOBALS` / `ik` missing | Retry fetch without `ik=` once; then error toast |
| Gmail: fetch non‑200, `MSG_NOT_FOUND`, or regex miss within 2 MB | Error toast; drop cache entry |
| Sheets: Name Box missing/empty | Copy file+gid link without range; toast "Copied sheet link" |
| Sheets: named range | Copy without range; toast as in 5.3 |
| Clipboard write fails | Fallback copy; if that fails, toast "Couldn't copy to clipboard" and `console.info` the link |
| Anchor icon not found | Floating fallback button + console warning |

## 10. Acceptance tests (manual, load unpacked via chrome://extensions → Developer mode)

**Gmail**
1. Open a thread whose first message **you sent**. Click Share → clipboard contains `https://mail.google.com/mail/#search/rfc822msgid%3A%3C…%3E` and the Message‑ID equals ⋮ → Show original → Message‑ID of the first message.
2. Open a thread whose first message you **received** (`msg-f:`) → same check.
3. Thread with a bounce/collapsed messages → still the oldest message's ID.
4. Paste the link in another account that received the email → it finds the conversation.
5. Inbox list view (no thread) → button disabled, toast on click.
6. Switch between threads quickly → each copy matches the thread on screen (no stale cache).
7. Light theme, dark theme, and a picture theme → icon colour matches neighbouring icons.
8. Multiple signed‑in accounts (`/u/1/`) → fetch uses the right account prefix; link has no `u/N`.
9. Console shows no Trusted Types violations.

**Sheets**
10. Select `D31` → link ends `#gid=<gid>&range=D31` and opens with D31 selected.
11. Select `C30:G30` → `range=C30:G30` (colon unencoded) and opens with the range selected.
12. Switch tabs → gid updates.
13. Select a named range → copies without range + explanatory toast.
14. Button sits left of the version‑history icon, same size/colour, tooltip "Copy link to this cell".

**General**
15. Keyboard: Tab to the button, Enter/Space copies.
16. Reloading the page or navigating never creates duplicate buttons.

## 11. Privacy, permissions, store listing

- No data leaves the browser; the only network request is a same‑origin fetch to `mail.google.com` that Gmail itself serves for "Show original".
- No permissions requested; content scripts only on `mail.google.com` and `docs.google.com/spreadsheets`.
- PRIVACY.md: state the above in plain language.
- Store listing text must include: "Workspace Link Copier is not affiliated with or endorsed by Google. Gmail and Google Sheets are trademarks of Google LLC."
- Never start the name with "Google" or "Gmail"; product names only after "for".

## 12. Future (not v1)

- Docs: copy link to the current document tab (`?tab=t.xxxx` from URL).
- Slides: copy link to the current slide (`#slide=id.xxx` from URL).
- Optional: domain‑wide sharing via Drive API (needs OAuth; deliberately deferred).

## 13. Definition of done

- Loads unpacked in Chrome ≥ 111 with zero errors/warnings on chrome://extensions.
- All acceptance tests in Section 10 pass.
- No `innerHTML`/`DOMParser` anywhere (`grep` clean).
- README explains install (load unpacked), usage, and limitations: Gmail links work only for people who received the first email of the thread; Google UI changes may require selector updates.
