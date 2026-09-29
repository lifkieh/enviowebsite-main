# Envio Website + CMS (Node.js + JSON)

Static marketing site for **PT Envio Kompound Indonesia** with a built-in, login-protected CMS.
Rewritten from the old PHP/MySQL stack to **Node.js + local JSON files** — no database, and **zero npm
dependencies** (Node built-ins only: `http`, `fs`, `path`, `crypto`).

## How it works

```
assets/content.seed.json   ← ships in repo; used to initialize live data on first run
        │  (copied on first boot to)
        ▼
<CMS_DATA_DIR>/content.json ← the LIVE source of truth (outside the web root)
        │  (build-content.js turns it into)
        ├──▶ assets/content.js            ← window.SITE_CONTENT = {...}  (generated; git-ignored)
        └──▶ index/about/products/contact.html  ← PRERENDERED: real body markup + full SEO <head>
                                                   (canonical, Open Graph, Twitter, JSON-LD)
        │  (browser loads content.js + render.js, then)
        ▼
assets/render.js            ← isomorphic renderer (same code prerenders in Node AND hydrates in browser)
assets/app.js               ← thin: calls render.js to hydrate SITE_CONTENT into the page
```

- Public pages are **prerendered at publish time** (`build-content.js` + `render.js`): each `.html`
  ships complete body markup and a full SEO `<head>`, so crawlers/link-preview bots see the real page
  without running JS. In the browser, `app.js` re-hydrates from `content.js` to stay in sync.
- SEO is data-driven: per-page `title`, `seo_desc`, `seo_title`, `og_image` (edited in admin) flow into
  the generated `<head>` — canonical, `og:*`, `twitter:*`, and a JSON-LD `Organization` block.
- The CMS (`/admin`) edits `content.json`, then republishes: rebuilds `content.js`, regenerates the
  prerendered pages, and bumps the `?v=` cache-buster. Every publish makes a timestamped backup first
  (rollback on failure).
- Live data (`content.json`, `users.json`, `audit.log`, `backups/`) lives in **`CMS_DATA_DIR`**
  (default `../enviowebsite-cms-data`), **outside** the web root — `git pull` never clobbers edits,
  and secrets/hashes are never served.

## Run locally

```bash
cp .env.example .env
# generate a session secret and paste it into .env as CMS_SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

node server.js            # http://localhost:3000  (public site + /admin)
```

First admin user — either set `CMS_BOOTSTRAP_USER` / `CMS_BOOTSTRAP_PASSWORD` in `.env` (auto-created
on first boot, then remove them), or:

```bash
node cms-user.js add <username>     # prompts for password
node cms-user.js list
node cms-user.js remove <username>
```

Open **http://localhost:3000/admin** and log in.

## Editing content

The admin is organized into: **Pengaturan Situs** (identity, contact, nav, footer, WhatsApp button,
form), **Koleksi Konten** (services, industries, pillars, compound families, NRC, why-choose, env
items), one section per **Halaman** (Beranda / About / Products / Contact), and **Riwayat** (restore a previous
version, plus **download/import** the whole content as a JSON file for archiving or moving servers).
Each page section has a **"Tampilkan bagian ini di situs"** toggle to show/hide it. Changes are staged —
nothing goes live until you press **Publikasikan** and confirm the review of changes. Images upload via
**PNG/JPG/WEBP** only (max 2 MB; SVG blocked) into `assets/images/uploads/`, or pick an already-uploaded
/ built-in image from the **Galeri** button on any image field.

## Security notes

- Passwords: `scrypt` + per-user salt, constant-time compare, dummy-hash for unknown users.
- Sessions: HMAC-signed HttpOnly cookie (`SameSite=Strict`, `Secure` in production), 8h sliding.
  Writes require a CSRF token; logins are rate-limited per-IP and per-username with escalating lockout.
- Sensitive files are denied from static serving; `CMS_SESSION_SECRET` must be set or login/save is off.
- Set `NODE_ENV=production` (and `CMS_TRUST_PROXY=1` behind a TLS-terminating proxy) when deployed.

## Utilities

```bash
node build-content.js     # rebuild assets/content.js from the live content.json
node cms-doctor.js        # sanity-check config / data dir / users
```
