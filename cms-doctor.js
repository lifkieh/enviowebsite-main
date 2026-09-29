"use strict";
/*
 * cms-doctor — post-deploy sanity checks. Run after every deploy:  node cms-doctor.js
 * Exits non-zero if any check FAILs. Node built-ins only.
 *
 * NOTE: file-permission checks are accurate on Linux (the deploy target). On Windows dev they will look
 * wrong (chmod is a no-op there) — that's expected; trust the result on the actual VPS.
 */
var fs = require("fs");
var path = require("path");
var os = require("os");
var crypto = require("crypto");
var auth = require("./cms-auth");

var REPO = __dirname;
var results = [];
function add(name, status, detail){ results.push({ name: name, status: status, detail: detail || "" }); }
function P(name, d){ add(name, "PASS", d); } function F(name, d){ add(name, "FAIL", d); } function W(name, d){ add(name, "WARN", d); }
function octal(p){ try { return (fs.statSync(p).mode & 0o777).toString(8); } catch(e){ return "?"; } }
function isUnder(child, parent){ var c = path.resolve(child), pa = path.resolve(parent); return c === pa || c.indexOf(pa + path.sep) === 0; }

/* 1. session secret */
(function(){
  var s = process.env.CMS_SESSION_SECRET || "";
  if(!s) F("CMS_SESSION_SECRET", "kosong — login & simpan dinonaktifkan. Set env var ini.");
  else if(s.length < 32) W("CMS_SESSION_SECRET", "ada tapi pendek (" + s.length + " char). Disarankan ≥ 48 hex char.");
  else P("CMS_SESSION_SECRET", "ada, panjang " + s.length + ".");
})();

/* 2. NODE_ENV */
(function(){
  if(process.env.NODE_ENV === "production") P("NODE_ENV", "production");
  else W("NODE_ENV", "'" + (process.env.NODE_ENV || "(kosong)") + "' — set NODE_ENV=production di produksi (memaksa cookie Secure).");
})();

/* 3. HTTPS / Secure cookie posture */
(function(){
  if(process.env.CMS_SECURE_COOKIE === "0") F("Cookie Secure", "CMS_SECURE_COOKIE=0 — Secure dimatikan. JANGAN di produksi.");
  else if(process.env.NODE_ENV === "production") P("Cookie Secure", "aktif (NODE_ENV=production memaksa Secure). Verifikasi lewat proxy: Set-Cookie harus ada 'Secure'.");
  else W("Cookie Secure", "default aktif, tapi NODE_ENV bukan production. Pastikan berjalan di belakang HTTPS + X-Forwarded-Proto: https.");
})();

/* 4. data dir OUTSIDE the web root */
(function(){
  var d = auth.dataDir();
  if(isUnder(d, REPO)) F("Data dir di luar web root", "data dir (" + d + ") berada DI DALAM repo (" + REPO + ") — bisa terunduh/terhapus git. Pindahkan via CMS_DATA_DIR.");
  else P("Data dir di luar web root", d);
})();

/* 5. required files/dirs exist + perms */
[
  { p: auth.dataDir(), kind: "dir", want: "700" },
  { p: auth.backupsDir(), kind: "dir", want: "700" },
  { p: auth.usersFile(), kind: "file", want: "600" },
  { p: auth.auditFile(), kind: "file", want: "600" }
].forEach(function(t){
  if(!fs.existsSync(t.p)){
    if(t.p === auth.auditFile()) W("Ada: " + path.basename(t.p), "belum ada (normal bila belum pernah publish).");
    else F("Ada: " + path.basename(t.p), "tidak ditemukan: " + t.p + (t.p === auth.usersFile() ? " — buat user: node cms-user.js add <nama>" : ""));
    return;
  }
  var m = octal(t.p);
  var ok = t.kind === "dir" ? (m === "700") : (m === "600");
  if(ok) P("Perms " + path.basename(t.p), m);
  else W("Perms " + path.basename(t.p), m + " (diharapkan " + t.want + "). Perbaiki: chmod " + t.want + " " + t.p);
});

/* 6. production content file: outside repo + writable */
(function(){
  var cf = auth.contentFile();
  if(isUnder(cf, path.join(REPO, "assets")) || isUnder(cf, REPO)) F("Konten produksi di luar repo", "content produksi (" + cf + ") ada DI DALAM repo — akan tertimpa git pull. Set CMS_DATA_DIR / CMS_CONTENT_FILE.");
  else if(!fs.existsSync(cf)) F("Konten produksi ada", cf + " tidak ada — jalankan: node cms-init.js");
  else {
    try { fs.accessSync(cf, fs.constants.W_OK); JSON.parse(fs.readFileSync(cf, "utf8")); P("Konten produksi", cf + " (ada, bisa ditulis, JSON valid)"); }
    catch(e){ F("Konten produksi", "tidak bisa ditulis / JSON rusak: " + e.message); }
  }
})();

/* 7. atomic write: rename within the data dir must work (same filesystem) */
(function(){
  try {
    var tmp = path.join(auth.dataDir(), ".doctor-" + crypto.randomBytes(4).toString("hex") + ".tmp");
    var dst = path.join(auth.dataDir(), ".doctor-" + crypto.randomBytes(4).toString("hex") + ".dst");
    fs.writeFileSync(tmp, "x"); fs.renameSync(tmp, dst); fs.unlinkSync(dst);
    P("Atomic rename (dalam data dir)", "OK — temp & data satu filesystem.");
  } catch(e){ F("Atomic rename (dalam data dir)", "GAGAL: " + e.message + " — atomic write bisa patah diam-diam."); }
})();

/* 8. cross-fs rename from OS temp -> data dir (informational; our code uses same-dir temp, so a failure here is only a WARN) */
(function(){
  try {
    var tmp = path.join(os.tmpdir(), ".doctor-" + crypto.randomBytes(4).toString("hex") + ".tmp");
    var dst = path.join(auth.dataDir(), ".doctor-x-" + crypto.randomBytes(4).toString("hex"));
    fs.writeFileSync(tmp, "x"); fs.renameSync(tmp, dst); fs.unlinkSync(dst);
    P("Rename OS-temp → data dir", "OK (satu filesystem).");
  } catch(e){ try { fs.unlinkSync(tmp); } catch(_){}
    W("Rename OS-temp → data dir", "beda filesystem (rename gagal). Aman karena atomic write pakai temp SATU folder dengan target; jangan arahkan temp ke fs lain."); }
})();

/* 9. free disk space on data dir */
(function(){
  try {
    var st = fs.statfsSync(auth.dataDir());
    var free = st.bavail * st.bsize, mb = Math.round(free / 1048576);
    if(free < 50 * 1048576) F("Ruang disk data dir", mb + " MB tersisa — terlalu kecil untuk 30 backup + log.");
    else if(free < 200 * 1048576) W("Ruang disk data dir", mb + " MB tersisa — pantau.");
    else P("Ruang disk data dir", mb + " MB tersisa.");
  } catch(e){ W("Ruang disk data dir", "tak bisa cek (statfs tidak tersedia): " + e.message); }
})();

/* 10. write-read-delete round trip in data dir */
(function(){
  try {
    var f = path.join(auth.dataDir(), ".doctor-rw-" + crypto.randomBytes(4).toString("hex"));
    var payload = crypto.randomBytes(8).toString("hex");
    fs.writeFileSync(f, payload); var back = fs.readFileSync(f, "utf8"); fs.unlinkSync(f);
    if(back === payload) P("Tulis-baca-hapus data dir", "OK");
    else F("Tulis-baca-hapus data dir", "isi tidak cocok.");
  } catch(e){ F("Tulis-baca-hapus data dir", "GAGAL: " + e.message); }
})();

/* ---- report ---- */
var fails = 0, warns = 0;
console.log("\n=== cms-doctor ===  data dir: " + auth.dataDir() + "\n");
results.forEach(function(r){
  if(r.status === "FAIL") fails++; if(r.status === "WARN") warns++;
  var tag = r.status === "PASS" ? "[ OK ]" : (r.status === "WARN" ? "[WARN]" : "[FAIL]");
  console.log(tag + " " + r.name + (r.detail ? " — " + r.detail : ""));
});
console.log("\n" + results.length + " cek · " + fails + " gagal · " + warns + " peringatan\n");
process.exit(fails ? 1 : 0);
