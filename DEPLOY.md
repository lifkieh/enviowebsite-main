# Deploy — Envio Website + CMS

This is a **Node.js app** (zero npm dependencies). It must run on a host that can run Node
(`node server.js`) — e.g. cPanel/Hostinger/Niagahoster "Setup Node.js App", Railway, Render, or a VPS.
A plain static host will show the public pages (they are prerendered) but **/admin and the CMS will not
work** without Node.

## 1. Upload

Upload/extract the zip into your app folder (on cPanel Node apps this is the "Application root", NOT
`public_html`). No `npm install` needed — there are no dependencies.

## 2. Environment variables (required)

Set these in your host's Node-app panel (or a `.env` file next to `server.js`):

```
CMS_SESSION_SECRET=<paste a long random string>   # REQUIRED — login/save disabled without it
NODE_ENV=production                                # forces Secure cookies (needs HTTPS)
CMS_DATA_DIR=/home/USER/envio-cms-data             # a WRITABLE folder OUTSIDE the web root
CMS_TRUST_PROXY=1                                   # if behind a reverse proxy / cPanel Passenger

# First admin (used only when no users exist yet — remove after first login):
CMS_BOOTSTRAP_USER=admin
CMS_BOOTSTRAP_PASSWORD=<min 8 chars>
```

Generate the secret locally:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`CMS_DATA_DIR` holds the live content, users, backups — keep it **outside** the public web root so it is
never served. Default (if unset) is `../enviowebsite-cms-data` next to the app folder.

## 3. Start

- **cPanel Node app**: set Application startup file = `server.js`, then Start/Restart. It listens on the
  `PORT` the panel provides automatically.
- **VPS / manual**: `NODE_ENV=production node server.js` (use pm2/systemd to keep it running).

On first boot it seeds content from `assets/content.seed.json` into `CMS_DATA_DIR`, builds the pages, and
(if the bootstrap env is set) creates the first admin.

## 4. First login

Open `https://yourdomain/admin` → log in with the bootstrap user → change the password
(**Akun Saya**) → remove `CMS_BOOTSTRAP_USER`/`PASSWORD` from the env.

If you did NOT set bootstrap env, create a user over SSH: `node cms-user.js add <name>`.

## 5. Check

`node cms-doctor.js` verifies the secret, data dir permissions, and writability.

## Notes
- Do NOT upload `.env` from your machine — set env vars on the host instead.
- Publishing in the CMS rebuilds `assets/content.js` + the prerendered pages and bumps each asset's cache
  fingerprint, so visitors get updates automatically (no manual cache clearing).
- To point the site at your real domain, edit **Pengaturan Situs → Identitas → Website (URL lengkap)** in
  the CMS (drives canonical/OG/sitemap), and update `robots.txt`/`sitemap.xml` host if needed.
