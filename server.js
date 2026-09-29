"use strict";
/*
 * Envio CMS server — serves the public static site AND the (login-protected) CMS API + /admin shell.
 * Node built-ins only (http, fs, path, crypto). No third-party dependencies.
 *
 * Security: login sessions (scrypt + timingSafeEqual, serialized), CSRF on writes, per-IP/user login
 * rate-limit, HttpOnly+SameSite=Strict+Secure signed cookie (8h), sensitive data OUTSIDE web root,
 * atomic write + backup + auto-publish (content.js + ?v=) + rollback + audit.
 *
 * Run: node server.js   Open: http://localhost:3000   User: node cms-user.js add <name>   Admin: /admin
 */
var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var auth = require("./cms-auth");      // also loads .env
var builder = require("./build-content");

var ROOT = __dirname;
var PORT = process.env.PORT || 3000;
var CONTENT_JSON = auth.contentFile();
var ADMIN_HTML = path.join(ROOT, "admin.html");
var INDEX_HTML = path.join(ROOT, "index.html");
var SECRET = process.env.CMS_SESSION_SECRET || "";
var SESSION_TTL = 8 * 60 * 60 * 1000;
var COOKIE = "cms_session";
var KEEP_BACKUPS = 5;
var CAP_LOGIN = 4 * 1024;
var CAP_CONTENT = 8 * 1024 * 1024;
var UPLOAD_DIR = path.join(ROOT, "assets", "images", "uploads");

auth.ensureDataDir();

/* One-time idempotent bootstrap (LiteSpeed/no-CLI hosts): seed content, build content.js, bump version,
 * auto-create first admin from env only when NO users exist. */
(function bootstrap(){
  try {
    if(!fs.existsSync(CONTENT_JSON)){
      var seed = auth.seedFile();
      if(fs.existsSync(seed)){ fs.copyFileSync(seed, CONTENT_JSON); try { fs.chmodSync(CONTENT_JSON, 0o600); } catch(e){} console.log("[bootstrap] Seed disalin ke: " + CONTENT_JSON); }
    }
    builder.build();
    bumpCacheBuster();
  } catch(e){ console.error("[bootstrap] Gagal siapkan konten: " + e.message); }
  try {
    var bu = process.env.CMS_BOOTSTRAP_USER, bp = process.env.CMS_BOOTSTRAP_PASSWORD;
    var hasUsers = Object.keys(auth.loadUsers().users || {}).length > 0;
    if(!hasUsers && bu && bp){
      if(String(bp).length < 8) console.warn("[bootstrap] CMS_BOOTSTRAP_PASSWORD terlalu pendek (min 8) — user TIDAK dibuat.");
      else { auth.setUser(bu, bp); console.log("[bootstrap] User '" + bu + "' dibuat dari env. Hapus env-nya setelah login."); }
    }
  } catch(e){ console.error("[bootstrap] Gagal siapkan user: " + e.message); }
})();

var MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json; charset=utf-8"
};

function send(res, status, body, type, headers){ var h = { "Content-Type": type || "text/plain; charset=utf-8" }; if(headers) for(var k in headers) h[k]=headers[k]; res.writeHead(status, h); res.end(body); }
function json(res, status, obj, headers){ send(res, status, JSON.stringify(obj), "application/json; charset=utf-8", headers); }
function readBody(req, res, limit, cb){
  var len = parseInt(req.headers["content-length"] || "0", 10);
  if(len && len > limit){ json(res, 413, { error: "Payload terlalu besar (maks " + Math.round(limit/1024) + " KB)." }); try { req.destroy(); } catch(e){} return; }
  var chunks = [], size = 0, done = false;
  function fail(status, msg){ if(done) return; done = true; try { json(res, status, { error: msg }); } catch(e){} try { req.destroy(); } catch(e){} }
  req.on("data", function(c){ if(done) return; size += c.length; if(size > limit) return fail(413, "Payload terlalu besar."); chunks.push(c); });
  req.on("end", function(){ if(done) return; done = true; cb(Buffer.concat(chunks).toString("utf8")); });
  req.on("error", function(){ if(done) return; done = true; try { req.destroy(); } catch(e){} });
}

var _usersCache = { mtime: -1, db: { users: {} } };
function usersDb(){ try { var st = fs.statSync(auth.usersFile()); if(st.mtimeMs !== _usersCache.mtime) _usersCache = { mtime: st.mtimeMs, db: auth.loadUsers() }; } catch(e){ _usersCache = { mtime: -1, db: { users: {} } }; } return _usersCache.db; }

var sessions = {};
function newSession(username, user){ var token = crypto.randomBytes(32).toString("hex"); sessions[token] = { username: username, expires: Date.now() + SESSION_TTL, csrf: crypto.randomBytes(24).toString("hex"), credStamp: (user && user.updatedAt) || "" }; return token; }
function sign(token){ return token + "." + crypto.createHmac("sha256", SECRET).update(token).digest("base64url"); }
function parseCookies(req){ var out = {}, h = req.headers.cookie; if(h) h.split(";").forEach(function(p){ var i = p.indexOf("="); if(i > 0) out[p.slice(0,i).trim()] = p.slice(i+1).trim(); }); return out; }
function currentUser(req){
  if(!SECRET) return null;
  var value = parseCookies(req)[COOKIE]; if(!value) return null;
  var i = value.lastIndexOf("."); if(i < 0) return null;
  var token = value.slice(0, i), sig = value.slice(i + 1);
  var expect = crypto.createHmac("sha256", SECRET).update(token).digest("base64url");
  var a = Buffer.from(sig), b = Buffer.from(expect);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  var s = sessions[token]; if(!s || s.expires < Date.now()){ delete sessions[token]; return null; }
  var u = auth.getUser(usersDb(), s.username); if(!u || u.updatedAt !== s.credStamp){ delete sessions[token]; return null; }
  s.expires = Date.now() + SESSION_TTL; return { token: token, username: s.username, csrf: s.csrf };
}
function isSecureReq(req){ if(process.env.NODE_ENV === "production") return true; if(req.socket && req.socket.encrypted) return true; var xfp = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase(); if(xfp === "https") return true; return process.env.CMS_SECURE_COOKIE !== "0"; }
function cookieHeader(value, maxAge, secure){ return COOKIE + "=" + value + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + maxAge + (secure ? "; Secure" : ""); }
function csrfOk(req, sess){ var hdr = req.headers["x-csrf-token"] || ""; var a = Buffer.from(String(hdr)), b = Buffer.from(sess.csrf); return a.length === b.length && crypto.timingSafeEqual(a, b); }

var ipFails = {}, userFails = {};
function blockSecs(map, key){ var r = map[key]; if(r && r.lockUntil && Date.now() < r.lockUntil) return Math.ceil((r.lockUntil - Date.now())/1000); return 0; }
function bump(map, key){ var r = map[key] || { count: 0, lockUntil: 0 }; r.count++; if(r.count >= 5){ var over = r.count - 4; r.lockUntil = Date.now() + Math.min(30000 * Math.pow(2, over - 1), 15*60*1000); } map[key] = r; }
function loginWait(ip, u){ return Math.max(blockSecs(ipFails, ip), blockSecs(userFails, "u:" + u)); }
function recordFail(ip, u){ bump(ipFails, ip); bump(userFails, "u:" + u); }
function resetFails(ip, u){ delete ipFails[ip]; delete userFails["u:" + u]; }
function clientIp(req){ if(process.env.CMS_TRUST_PROXY === "1"){ var xff = req.headers["x-forwarded-for"]; if(xff){ var p = String(xff).split(","); return p[p.length-1].trim(); } } return (req.socket && req.socket.remoteAddress) || "?"; }
var verifyChain = Promise.resolve();
function serialVerify(password, user){ var run = verifyChain.then(function(){ return auth.verifyPasswordAsync(password, user); }); verifyChain = run.then(function(){}, function(){}); return run; }

/* ============================== content validation (Envio) ============================== */
function validateContent(obj){
  var errs = [];
  if(!obj || typeof obj !== "object" || Array.isArray(obj)) return ["Payload bukan objek JSON."];
  ["settings","collections","pages"].forEach(function(k){ if(!obj[k] || typeof obj[k] !== "object") errs.push("Bagian '" + k + "' hilang atau bukan objek."); });
  if(obj.settings){ ["identity","contact","nav","footer"].forEach(function(k){ if(!obj.settings[k]) errs.push("settings." + k + " hilang."); }); }
  if(obj.pages){ ["home","about","products","contact"].forEach(function(k){ if(!obj.pages[k]) errs.push("pages." + k + " hilang."); }); }
  return errs;
}

function chmod600(p){ try { fs.chmodSync(p, 0o600); } catch(e){} }
function atomicWrite(file, data){ var tmp = file + "." + crypto.randomBytes(4).toString("hex") + ".tmp"; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }
function backupCurrentContent(){ if(!fs.existsSync(CONTENT_JSON)) return null; var name = "content-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json"; var dest = path.join(auth.backupsDir(), name); fs.copyFileSync(CONTENT_JSON, dest); chmod600(dest); pruneBackups(); return name; }
function pruneBackups(){ var dir = auth.backupsDir(); var files = fs.readdirSync(dir).filter(function(f){ return /^content-.*\.json$/.test(f); }).sort(); while(files.length > KEEP_BACKUPS){ try { fs.unlinkSync(path.join(dir, files.shift())); } catch(e){} } }
function currentVersion(){ try { var v = parseInt(fs.readFileSync(auth.versionFile(), "utf8").trim(), 10); if(!isNaN(v)) return v; } catch(e){} var seed = 1; try { atomicWrite(auth.versionFile(), String(seed)); chmod600(auth.versionFile()); } catch(e){} return seed; }
function bumpCacheBuster(){ var next = currentVersion() + 1; atomicWrite(auth.versionFile(), String(next)); chmod600(auth.versionFile()); return next; }
/* Per-asset cache fingerprint: a short hash of the file's size+mtime. Stable while the file is unchanged
 * (so browsers reuse the immutable-cached copy), and it changes the instant the file changes — content.js
 * on every CMS publish, admin.js/style.css on deploy — so clients refetch exactly what changed, nothing more. */
var _fpCache = {};
function assetFingerprint(rel){
  try {
    var fp = path.normalize(path.join(ROOT, rel));
    if(fp.indexOf(ROOT) !== 0) return null;
    var st = fs.statSync(fp);
    var c = _fpCache[rel];
    if(c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.tag;
    var tag = crypto.createHash("sha1").update(rel + ":" + st.size + ":" + st.mtimeMs).digest("hex").slice(0, 10);
    _fpCache[rel] = { mtimeMs: st.mtimeMs, size: st.size, tag: tag };
    return tag;
  } catch(e){ return null; }
}
// Rewrite every assets/* reference in served HTML to carry its own file fingerprint as ?v=.
function injectVersion(html){
  return html.replace(/((?:src|href)=")(assets\/[^"?#]+)(?:\?v=[^"#]*)?(["#])/g, function(m, pre, asset, post){
    var tag = assetFingerprint(asset) || String(currentVersion());
    return pre + asset + "?v=" + tag + post;
  });
}
function audit(user, summary){ try { fs.appendFileSync(auth.auditFile(), new Date().toISOString() + "\t" + user + "\t" + summary + "\n", { mode: 0o600 }); chmod600(auth.auditFile()); } catch(e){} }
function lastPublish(){ try { var lines = fs.readFileSync(auth.auditFile(), "utf8").trim().split("\n"); for(var i = lines.length - 1; i >= 0; i--){ var p = lines[i].split("\t"); if(p.length >= 3 && /publish/.test(p[2])) return { time: p[0], user: p[1], summary: p[2] }; } } catch(e){} return null; }

function publishContent(parsed, username, note){
  var backup = backupCurrentContent();
  atomicWrite(CONTENT_JSON, JSON.stringify(parsed, null, 2) + "\n");
  var version;
  try { builder.build(); version = bumpCacheBuster(); }
  catch(e){ try { if(backup) fs.copyFileSync(path.join(auth.backupsDir(), backup), CONTENT_JSON); builder.build(); } catch(e2){} audit(username, "PUBLISH GAGAL (rollback " + backup + "): " + e.message); throw new Error("Publish gagal, dikembalikan ke versi sebelumnya: " + e.message); }
  audit(username, note + ", v" + version + " (backup " + backup + ")");
  return { version: version, backup: backup };
}
function handleSave(req, res, sess){
  readBody(req, res, CAP_CONTENT, function(raw){
    var parsed; try { parsed = JSON.parse(raw); } catch(e){ return json(res, 400, { error: "JSON tidak valid: " + e.message }); }
    var errs = validateContent(parsed); if(errs.length) return json(res, 400, { error: "Struktur konten tidak valid.", details: errs });
    var base = req.headers["x-base-version"];
    if(base != null && base !== "" && String(currentVersion()) !== String(base)) return json(res, 409, { error: "Konten sudah diperbarui orang lain (kini versi " + currentVersion() + "). Muat ulang dulu.", currentVersion: currentVersion() });
    var r; try { r = publishContent(parsed, sess.username, "publish content"); } catch(e){ return json(res, 500, { error: e.message }); }
    json(res, 200, { ok: true, version: r.version, backup: r.backup });
  });
}
var BACKUP_RE = /^content-[0-9A-Za-z\-]+\.json$/;
function backupList(){ var dir = auth.backupsDir(), amap = {}; try { fs.readFileSync(auth.auditFile(), "utf8").trim().split("\n").forEach(function(ln){ var p = ln.split("\t"), m = p[2] && p[2].match(/backup (content-[^)\s]+\.json)/); if(m) amap[m[1]] = { user: p[1], time: p[0] }; }); } catch(e){} var files = []; try { files = fs.readdirSync(dir).filter(function(f){ return BACKUP_RE.test(f); }); } catch(e){} return files.map(function(f){ var meta = amap[f] || {}, st = null; try { st = fs.statSync(path.join(dir, f)); } catch(e){} return { name: f, time: meta.time || (st ? st.mtime.toISOString() : ""), user: meta.user || "?" }; }).sort(function(a, b){ return a.name < b.name ? 1 : -1; }); }
function readBackup(name){ if(!BACKUP_RE.test(name)) return null; var fp = path.normalize(path.join(auth.backupsDir(), name)); if(fp.indexOf(auth.backupsDir()) !== 0) return null; try { return fs.readFileSync(fp, "utf8"); } catch(e){ return null; } }

var DENY_PREFIX = ["/data", "/backups", "/scratchpad", "/node_modules"];
var DENY_FILE = ["/server.js", "/cms-user.js", "/cms-auth.js", "/build-content.js", "/cms-init.js", "/cms-doctor.js", "/package.json", "/package-lock.json", "/readme.md", "/assets/content.seed.json"];
function isDenied(url){ var u = url.toLowerCase(); if(u.indexOf("..") >= 0) return true; if(/\/\.[^\/]/.test(u)) return true; for(var i = 0; i < DENY_PREFIX.length; i++) if(u === DENY_PREFIX[i] || u.indexOf(DENY_PREFIX[i] + "/") === 0) return true; if(DENY_FILE.indexOf(u) >= 0) return true; return false; }
function cacheHeaderFor(urlPath){ if(/^\/assets\//.test(urlPath)) return { "Cache-Control": "public, max-age=31536000, immutable" }; return { "Cache-Control": "no-cache" }; }
function serveStatic(res, filePath, urlPath){ fs.readFile(filePath, function(err, data){ if(err) return send(res, 404, "Not found"); var ext = path.extname(filePath).toLowerCase(); if(ext === ".html") data = Buffer.from(injectVersion(data.toString("utf8")), "utf8"); send(res, 200, data, MIME[ext] || "application/octet-stream", cacheHeaderFor(urlPath || "")); }); }
function detectImage(buf){ if(buf.length>=8 && buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47) return "png"; if(buf.length>=3 && buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return "jpg"; if(buf.length>=12 && buf.toString("ascii",0,4)==="RIFF" && buf.toString("ascii",8,12)==="WEBP") return "webp"; return null; }
// Media library: uploaded files first, then built-in image assets. Relative web paths for the picker.
function listImages(){
  var base = path.join(ROOT, "assets", "images"), out = [], IMG = /\.(png|jpe?g|webp)$/i;
  function walk(dir){
    var ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch(e){ return; }
    ents.forEach(function(en){
      var fp = path.join(dir, en.name);
      if(en.isDirectory()){ if(en.name !== "." && en.name !== "..") walk(fp); }
      else if(IMG.test(en.name)) out.push("assets/images/" + path.relative(base, fp).split(path.sep).join("/"));
    });
  }
  walk(base);
  // uploads first (most recently relevant), capped
  out.sort(function(a, b){ var au = a.indexOf("uploads/") >= 0, bu = b.indexOf("uploads/") >= 0; if(au !== bu) return au ? -1 : 1; return a < b ? -1 : 1; });
  return out.slice(0, 300);
}

var server = http.createServer(function(req, res){
  var url = req.url.split("?")[0];

  if(url === "/api/login" && req.method === "POST"){
    if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi (CMS_SESSION_SECRET kosong)." });
    var ip = clientIp(req); var ipWait = blockSecs(ipFails, ip);
    if(ipWait) return json(res, 429, { error: "Terlalu banyak percobaan. Coba lagi dalam " + ipWait + " detik.", retryAfter: ipWait });
    return readBody(req, res, CAP_LOGIN, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var username = String(b.username || ""); var wait = loginWait(ip, username);
      if(wait) return json(res, 429, { error: "Terlalu banyak percobaan. Coba lagi dalam " + wait + " detik.", retryAfter: wait });
      var user = auth.getUser(usersDb(), username);
      serialVerify(String(b.password || ""), user).then(function(ok){
        if(!ok){ recordFail(ip, username); return json(res, 401, { error: "Username atau password salah." }); }
        resetFails(ip, username); var token = newSession(username, user);
        json(res, 200, { ok: true, username: username, csrf: sessions[token].csrf }, { "Set-Cookie": cookieHeader(sign(token), SESSION_TTL/1000, isSecureReq(req)) });
      });
    });
  }
  if(url === "/api/logout" && req.method === "POST"){ var s0 = currentUser(req); if(s0) delete sessions[s0.token]; return json(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0, isSecureReq(req)) }); }
  if(url === "/api/session"){ var s1 = currentUser(req); if(!s1) return json(res, 401, { error: "Belum login." }); return json(res, 200, { username: s1.username, csrf: s1.csrf }); }
  if(url === "/api/status"){ var s3 = currentUser(req); if(!s3) return json(res, 401, { error: "Belum login." }); return json(res, 200, { username: s3.username, currentVersion: currentVersion(), lastPublish: lastPublish() }); }
  if(url === "/api/backups"){ var sb = currentUser(req); if(!sb) return json(res, 401, { error: "Belum login." }); return json(res, 200, { backups: backupList(), currentVersion: currentVersion() }); }
  if(url === "/api/backup"){ var sg = currentUser(req); if(!sg) return json(res, 401, { error: "Belum login." }); var qn = (req.url.split("?")[1] || "").match(/(?:^|&)name=([^&]+)/); var name = qn ? decodeURIComponent(qn[1]) : ""; var body = readBackup(name); if(body == null) return json(res, 404, { error: "Backup tidak ditemukan." }); return send(res, 200, body, "application/json; charset=utf-8"); }
  if(url === "/api/restore" && req.method === "POST"){
    var sr = currentUser(req); if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!sr) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, sr)) return json(res, 403, { error: "Token CSRF tidak valid." });
    return readBody(req, res, CAP_LOGIN, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var body = readBackup(String(b.name || "")); if(body == null) return json(res, 404, { error: "Backup tidak ditemukan." });
      var parsed; try { parsed = JSON.parse(body); } catch(e){ return json(res, 400, { error: "Backup rusak." }); }
      var errs = validateContent(parsed); if(errs.length) return json(res, 400, { error: "Backup tidak valid.", details: errs });
      var r; try { r = publishContent(parsed, sr.username, "RESTORE dari " + b.name); } catch(e){ return json(res, 500, { error: e.message }); }
      json(res, 200, { ok: true, version: r.version, backup: r.backup, restored: b.name });
    });
  }
  if(url === "/api/image" && req.method === "POST"){
    var su = currentUser(req); if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!su) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, su)) return json(res, 403, { error: "Token CSRF tidak valid." });
    return readBody(req, res, 3 * 1024 * 1024, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var data = String(b.dataBase64 || "").replace(/^data:[^,]*,/, "");
      var buf; try { buf = Buffer.from(data, "base64"); } catch(e){ return json(res, 400, { error: "Data gambar tidak valid." }); }
      if(!buf.length) return json(res, 400, { error: "File kosong." });
      if(buf.length > 2 * 1024 * 1024) return json(res, 400, { error: "Ukuran melebihi 2 MB." });
      var ext = detectImage(buf); if(!ext) return json(res, 400, { error: "Format tidak didukung. Hanya PNG, JPG, atau WEBP (SVG tidak diizinkan)." });
      try { if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch(e){ return json(res, 500, { error: "Gagal menyiapkan folder." }); }
      var name = "up-" + crypto.randomBytes(6).toString("hex") + "." + ext;
      try { fs.writeFileSync(path.join(UPLOAD_DIR, name), buf); } catch(e){ return json(res, 500, { error: "Gagal menyimpan file." }); }
      json(res, 200, { ok: true, path: "assets/images/uploads/" + name });
    });
  }
  if(url === "/api/images"){ var si = currentUser(req); if(!si) return json(res, 401, { error: "Belum login." }); return json(res, 200, { images: listImages() }); }
  if(url === "/api/image/delete" && req.method === "POST"){
    var sd = currentUser(req); if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!sd) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, sd)) return json(res, 403, { error: "Token CSRF tidak valid." });
    return readBody(req, res, CAP_LOGIN, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var rel = String(b.path || "").replace(/^\/+/, "");
      if(!/^assets\/images\/uploads\/up-[0-9a-f]+\.(png|jpe?g|webp)$/i.test(rel)) return json(res, 400, { error: "Hanya file unggahan yang bisa dihapus." });
      var fp = path.normalize(path.join(ROOT, rel)); if(fp.indexOf(UPLOAD_DIR) !== 0) return json(res, 400, { error: "Jalur tidak valid." });
      try { if(fs.existsSync(fp)) fs.unlinkSync(fp); } catch(e){ return json(res, 500, { error: "Gagal menghapus." }); }
      json(res, 200, { ok: true });
    });
  }
  if(url === "/api/password" && req.method === "POST"){
    var sp = currentUser(req); if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!sp) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, sp)) return json(res, 403, { error: "Token CSRF tidak valid." });
    return readBody(req, res, CAP_LOGIN, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var np = String(b.new || ""); if(np.length < 8) return json(res, 400, { error: "Kata sandi baru minimal 8 karakter." });
      var user = auth.getUser(usersDb(), sp.username);
      auth.verifyPasswordAsync(String(b.old || ""), user).then(function(ok){
        if(!ok) return json(res, 401, { error: "Kata sandi lama salah." });
        auth.setUser(sp.username, np);
        var fresh = auth.getUser(auth.loadUsers(), sp.username); // refresh cache + session cred stamp
        _usersCache = { mtime: -1, db: { users: {} } };
        if(sessions[sp.token]) sessions[sp.token].credStamp = fresh.updatedAt;
        json(res, 200, { ok: true });
      });
    });
  }
  if(url === "/api/users"){
    var suu = currentUser(req); if(!suu) return json(res, 401, { error: "Belum login." });
    if(req.method === "GET"){ var db = auth.loadUsers().users || {}; return json(res, 200, { users: Object.keys(db).map(function(u){ return { username: u, createdAt: db[u].createdAt || "" }; }), me: suu.username }); }
    if(req.method === "POST"){ if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!csrfOk(req, suu)) return json(res, 403, { error: "Token CSRF tidak valid." });
      return readBody(req, res, CAP_LOGIN, function(raw){
        var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
        var un = String(b.username || "").trim(), pw = String(b.password || "");
        if(!/^[A-Za-z0-9_.-]{3,32}$/.test(un)) return json(res, 400, { error: "Nama pengguna 3-32 karakter (huruf, angka, . _ -)." });
        if(pw.length < 8) return json(res, 400, { error: "Kata sandi minimal 8 karakter." });
        var db0 = auth.loadUsers().users || {};
        if(Object.prototype.hasOwnProperty.call(db0, un)) return json(res, 400, { error: "Nama pengguna sudah dipakai." });
        // re-auth: the acting admin must confirm their own password before creating an account
        auth.verifyPasswordAsync(String(b.adminPassword || ""), auth.getUser(usersDb(), suu.username)).then(function(ok){
          if(!ok) return json(res, 401, { error: "Kata sandi Anda salah." });
          auth.setUser(un, pw); _usersCache = { mtime: -1, db: { users: {} } };
          json(res, 200, { ok: true });
        });
      });
    }
    return send(res, 405, "Method not allowed");
  }
  if(url === "/api/users/delete" && req.method === "POST"){
    var sdu = currentUser(req); if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!sdu) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, sdu)) return json(res, 403, { error: "Token CSRF tidak valid." });
    return readBody(req, res, CAP_LOGIN, function(raw){
      var b = {}; try { b = JSON.parse(raw || "{}"); } catch(e){}
      var un = String(b.username || "");
      var db = auth.loadUsers().users || {};
      if(!Object.prototype.hasOwnProperty.call(db, un)) return json(res, 404, { error: "Pengguna tidak ada." });
      if(Object.keys(db).length <= 1) return json(res, 400, { error: "Tidak bisa menghapus pengguna terakhir." });
      if(un === sdu.username) return json(res, 400, { error: "Tidak bisa menghapus akun sendiri." });
      auth.verifyPasswordAsync(String(b.adminPassword || ""), auth.getUser(usersDb(), sdu.username)).then(function(ok){
        if(!ok) return json(res, 401, { error: "Kata sandi Anda salah." });
        auth.removeUser(un); _usersCache = { mtime: -1, db: { users: {} } };
        json(res, 200, { ok: true });
      });
    });
  }
  if(url === "/api/content"){
    var s2 = currentUser(req);
    if(req.method === "GET"){ if(!s2) return json(res, 401, { error: "Belum login." }); return fs.readFile(CONTENT_JSON, "utf8", function(err, data){ if(err) return json(res, 500, { error: "Gagal membaca content.json." }); send(res, 200, data, "application/json; charset=utf-8", { "X-Content-Version": String(currentVersion()) }); }); }
    if(req.method === "PUT" || req.method === "POST"){ if(!SECRET) return json(res, 503, { error: "CMS belum dikonfigurasi." }); if(!s2) return json(res, 401, { error: "Belum login." }); if(!csrfOk(req, s2)) return json(res, 403, { error: "Token CSRF tidak valid." }); return handleSave(req, res, s2); }
    return send(res, 405, "Method not allowed");
  }

  if(url === "/admin" || url === "/admin/") return serveStatic(res, ADMIN_HTML, "/admin");
  if((url === "/" || url === "/index.html") && (req.method === "GET" || req.method === "HEAD")) return serveStatic(res, INDEX_HTML, "/index.html");
  if(req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  var rawPath = url === "/" ? "/index.html" : url;
  var decoded; try { decoded = decodeURIComponent(rawPath); } catch(e){ return send(res, 404, "Not found"); }
  if(isDenied(decoded)) return send(res, 404, "Not found");
  var filePath = path.normalize(path.join(ROOT, decoded));
  if(filePath.indexOf(ROOT) !== 0) return send(res, 404, "Not found");
  serveStatic(res, filePath, decoded);
});

server.listen(PORT, function(){
  console.log("Envio CMS berjalan di http://localhost:" + PORT);
  if(!SECRET) console.warn("[PERINGATAN] CMS_SESSION_SECRET belum di-set — login & simpan DINONAKTIFKAN.");
  else if(!Object.keys(auth.loadUsers().users || {}).length) console.log("[INFO] Belum ada user. Buat: node cms-user.js add <username>");
});
