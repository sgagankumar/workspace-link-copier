# Privacy Policy — Workspace Link Copier

_Last updated: 18 November 2026_

Workspace Link Copier runs entirely inside your browser.

**What it does with your data**

- **It collects nothing.** No analytics, tracking, cookies, accounts or sign-in.
- **It sends nothing anywhere.** The extension has no servers and never contacts any.
- **It stores nothing.** Links are held in the open tab's memory only to make the next click faster, and are gone when you close or reload the tab.

**The one network request**

In Gmail, to find an email's Message-ID, the extension asks `mail.google.com` for that email's "Show original" page, the same page Gmail shows you under ⋮ → Show original. The request goes from your browser to Gmail using your existing Gmail session, exactly as if you had opened that page yourself. The extension stops reading the page as soon as it finds the `Message-ID` header, and the content is never stored or sent anywhere else.

In Google Sheets the extension makes no network requests at all. It reads the file address and the selected cell from the page.

**Permissions**

The extension requests **no browser permissions**. It runs only on `https://mail.google.com/*` and `https://docs.google.com/spreadsheets/*`, to add its button there. It does not use OAuth, the Gmail API or the Drive API, and it never changes sharing settings on your files.

**Clipboard**

When you click the button, the extension writes the link to your clipboard. It never reads your clipboard.

**Contact**

Questions or concerns: open an issue at https://github.com/sgagankumar/workspace-link-copier/issues.

Developer: Gagan Kumar · https://sgagankumar.dev

---

Workspace Link Copier is not affiliated with or endorsed by Google. Gmail and Google Sheets are trademarks of Google LLC.
