# Store listings — Workspace Link Copier

Everything needed for the **Chrome Web Store** Developer Dashboard and **addons.mozilla.org (AMO)**. Images are in this folder; regenerate them with `scripts/make-store-assets.ps1`.

## Packages

Run `python scripts/build.py`, then upload:

- Chrome Web Store: `dist/workspace-link-copier-chrome-<version>.zip`
- AMO: `dist/workspace-link-copier-firefox-<version>.zip`

Both contain only `manifest.json`, `src/`, `styles/` and `icons/`. Bump `version` in `manifest.json` before each upload.

# Chrome Web Store

## Store listing tab

| Field | Value |
|---|---|
| Name (from manifest) | Workspace Link Copier |
| Summary (from manifest, ≤ 132 chars) | Copy Email & Cell Links for Gmail™ and Sheets™ in one click. |
| Category | Productivity → Workflow & Planning |
| Language | English |
| Store icon (128×128) | `../icons/icon128.png` |
| Screenshots (1280×800) | `screenshot-1-gmail.png`, `screenshot-2-sheets.png`, `screenshot-3-privacy.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `promo-marquee-1400x560.png` |
| Homepage URL | https://sgagankumar.github.io/workspace-link-copier/ |
| Support URL | https://github.com/sgagankumar/workspace-link-copier/issues |

**Tip:** real screenshots from your own Gmail and Sheets (1280×800, with private content blurred) convert better than illustrations. Consider replacing screenshots 1 and 2 with them.

### Description

```
Share a link to one exact email or one exact cell in a single click.

Workspace Link Copier adds a Share button to the top-right of Gmail™ and Google Sheets™. It looks and behaves like Google's own icon buttons, and a short message confirms every copy.

GMAIL: LINK TO THE EMAIL
The link in your address bar only works for you. Workspace Link Copier copies a link that finds the conversation in anyone's mailbox if they received it, using the email's unique Message-ID.
• Uses the first email in the thread, so everyone on the thread can open it
• Opens in the recipient's default account (no /u/0/ in the link)
• Ready the moment you open a thread, so the copy is instant

GOOGLE SHEETS: LINK TO THE CELL OR RANGE
Skip right-click → View more cell actions → Get link to this cell.
• Works for single cells, ranges, whole columns and whole rows
• Opens the right file and tab with your selection highlighted
• Same link format as Sheets' own "Get link to this cell"

PRIVATE BY DESIGN
• No permissions requested
• No data collected, no analytics, no servers
• No OAuth, no Google APIs, and your sharing settings are never touched
• Open source: https://github.com/sgagankumar/workspace-link-copier

GOOD TO KNOW
• Gmail links work for people who received the first email of the thread.
• Named ranges in Sheets aren't supported; you get a link to the tab instead.

Workspace Link Copier is not affiliated with or endorsed by Google. Gmail and Google Sheets are trademarks of Google LLC.
```

## Privacy practices tab

| Field | Value |
|---|---|
| Single purpose | Adds a button to Gmail and Google Sheets that copies a shareable link to the open email or the selected cell or range. |
| Permission justification: host access (content scripts on `mail.google.com` and `docs.google.com/spreadsheets`) | The extension injects its button only on these pages. On Gmail it reads the open email's "Show original" page from mail.google.com (same origin, the user's own session) to find the email's Message-ID, which the copied link is built from. On Sheets it reads the file address and the selected cell from the page. |
| Remote code | No, I am not using remote code. All JavaScript is in the package. |
| Data usage | Collects none of the listed data types. |
| Certifications | Check all three: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending. |
| Privacy policy URL | https://sgagankumar.github.io/workspace-link-copier/privacy.html |

## Distribution tab

- **Unlisted**: only people with the link can install it.
- **Private**: only users in your Google Workspace domain (an admin can force-install it).
- **Public**: anyone can find it in the store.

# Firefox Add-ons (AMO)

Submit at https://addons.mozilla.org/developers/addon/submit/. Choose **On this site** for a public listing, or **On your own** to get a signed `.xpi` you distribute yourself. Either way the add-on is signed and installs permanently, unlike a temporary add-on.

| Field | Value |
|---|---|
| Add-on ID (set by the build) | `workspace-link-copier@sgagankumar.dev` |
| Minimum Firefox (set by the build) | 128.0 (first version with `"world": "MAIN"` content scripts) |
| Compatibility | Firefox for desktop only. Gmail and Sheets on Android use a different UI. |
| Name | Workspace Link Copier |
| Summary (≤ 250 chars) | Copy Email & Cell Links for Gmail™ and Sheets™ in one click. A Share button copies a link to the exact email or cell you're looking at. No permissions; nothing leaves your browser. |
| Description | Same text as the Chrome description above |
| Categories | Productivity (primary) |
| Tags | gmail, google sheets, link, share, productivity |
| Homepage | https://sgagankumar.github.io/workspace-link-copier/ |
| Support site | https://github.com/sgagankumar/workspace-link-copier/issues |
| License | Pick the license you add to the repo (AMO asks for one) |
| Privacy policy | Paste the text of `PRIVACY.md`, or link https://sgagankumar.github.io/workspace-link-copier/privacy.html |
| Icon | `../icons/icon128.png` (AMO also accepts 64×64) |
| Screenshots | `screenshot-1-gmail.png`, `screenshot-2-sheets.png`, `screenshot-3-privacy.png` |

**Data collection** is declared in the manifest as `"data_collection_permissions": { "required": ["none"] }`, which AMO requires for new add-ons. AMO will show "This add-on doesn't collect data."

**Source code:** the code isn't minified or bundled, so AMO doesn't need a separate source upload.

**Notes for reviewers** (optional field):

```
No build step, no minification, no remote code. Content scripts run in the MAIN world on
mail.google.com and docs.google.com/spreadsheets so they can read Gmail's page variable
GLOBALS[9] (the "ik" session key). On Gmail the only network request is a same-origin fetch of
the open email's "Show original" page (mail.google.com/mail/?ik=…&view=om&permmsgid=…) to read
its Message-ID header. Nothing is stored or transmitted elsewhere.
```

## Developer

Gagan Kumar · https://sgagankumar.dev · https://github.com/sgagankumar
