"use strict";
/*
 * cms-init — one-time (idempotent) initialization of the DATA DIR on a server.
 *   - ensures the data dir + backups dir exist (0700)
 *   - copies the repo seed (assets/content.seed.json) to the live content file ONLY if it doesn't exist,
 *     so it NEVER overwrites the team's live edits on a redeploy
 *   - (re)generates assets/content.js from the live content so the public site is in sync
 *
 * Safe to run on every deploy. Node built-ins only.
 *   node cms-init.js
 */
var fs = require("fs");
var auth = require("./cms-auth");
var builder = require("./build-content");

auth.ensureDataDir();

var cf = auth.contentFile();
if(fs.existsSync(cf)){
  console.log("[init] Konten produksi sudah ada — TIDAK ditimpa: " + cf);
} else {
  var seed = auth.seedFile();
  if(!fs.existsSync(seed)){ console.error("[init] GAGAL: seed tidak ditemukan di " + seed); process.exit(1); }
  fs.copyFileSync(seed, cf);
  try { fs.chmodSync(cf, 0o600); } catch(e){}
  console.log("[init] Seed disalin ke konten produksi: " + cf);
}

try {
  builder.build();
  console.log("[init] assets/content.js diregenerasi dari konten produksi.");
} catch(e){
  console.error("[init] GAGAL regenerasi content.js: " + e.message);
  process.exit(1);
}
console.log("[init] Selesai. Data dir: " + auth.dataDir());
