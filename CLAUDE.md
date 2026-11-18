CLAUDE.md — Workspace Link Copier

Instructions for any AI coding agent (Claude Code, Copilot, Cursor) working in this repository. The full specification is in PRODUCT_SPEC.md. Read it completely before writing code; it is the source of truth.

Agenda (why)

Sharing a link to one exact email in Gmail, or one exact cell in Google Sheets, takes 4–6 manual steps, and normal Gmail URLs don't work for other people. This extension makes it one click from a button that looks native to Google's UI.

What we are building

A Manifest V3 Chrome extension named Workspace Link Copier ("Copy Email & Cell Links for Gmail™ and Sheets™"):

Gmail: a Share icon button left of the "?" Support icon. Copies https://mail.google.com/mail/#search/rfc822msgid%3A<encoded Message-ID> for the first (oldest) message in the open thread.
Sheets: a Share icon button left of the version‑history ("Last edit") icon. Copies https://docs.google.com/spreadsheets/d/<id>/edit?gid=<gid>#gid=<gid>&range=<A1 range> for the current selection.
How (non‑negotiable rules)
Plain JavaScript, no frameworks, no bundler, no npm runtime dependencies. Must load via "Load unpacked".
Content scripts run with "world": "MAIN". No permissions, no background worker, no popup.
Trusted Types: never use innerHTML, outerHTML, insertAdjacentHTML, DOMParser, or document.write. Create nodes with createElement/createElementNS; parse fetched HTML with regex only.
Use the verified Gmail technique exactly: [data-message-id] → oldest by BigInt('0x'+data-legacy-message-id) → fetch ${acct}?ik=${GLOBALS[9]}&view=om&permmsgid=${encodeURIComponent(id)} → stream body → regex Message-ID: <…>. Never derive msg-f: from a thread id.
Use the verified Sheets technique exactly: #t-name-box value + file id from path + gid from URL. Keep : unencoded in range. Never declare top‑level variables (Sheets already has a global gid).
Injection must be idempotent and survive SPA navigation (MutationObserver + hashchange/popstate, debounced).
All ids/classes prefixed wlc-. All logs prefixed [WLC].
Google‑style UI (mandatory)
The only icon is Google's Material "share" icon (inline SVG path given in PRODUCT_SPEC.md §6.1), fill: currentColor. No text labels, no other icons.
Material 3 standard icon button: 40×40 circle, 24px icon, transparent, hover state layer 8% / pressed 12% of currentColor, :focus-visible ring.
Copy the neighbouring Google icon's computed color (and size/margins) so it matches light, dark and themed UIs.
Google‑style tooltip (§6.3) and Material snackbar toast bottom‑left (§6.4).
Use the page's existing "Google Sans"/Roboto fonts; never load fonts or remote assets.
Browsers (Chrome 111+ and Firefox 128+)
The same src/ runs in both; never use chrome.* or browser.* APIs.
manifest.json is the Chrome manifest and must stay free of Firefox-only keys (Chrome warns about unknown keys). Firefox keys (browser_specific_settings.gecko: id, strict_min_version, data_collection_permissions) are added by scripts/build.py, which writes dist/chrome and dist/firefox plus store zips.
Out of scope

OAuth, Gmail/Drive APIs, sharing‑permission changes, Docs, Slides, popups, options pages, context menus.

Done when

Every acceptance test in PRODUCT_SPEC.md §10 passes, grep -rE "innerHTML|DOMParser|insertAdjacentHTML" src/ returns nothing, and the extension loads unpacked with zero errors.