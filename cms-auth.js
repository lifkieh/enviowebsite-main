"use strict";
/*
 * Shared CMS auth + path helpers. Used by both server.js and cms-user.js so the two never drift.
 * All sensitive state (user password hashes, backups, audit log) lives in a DATA DIR that is OUTSIDE
 * the web root — nothing here is ever served statically.
 *
 * Passwords: crypto.scrypt (memory-hard KDF) with a per-user random salt. Never plaintext, never MD5/SHA1.
 * Verification is constant-time (timingSafeEqual) and does the same work for unknown users (dummy hash)
 * so login timing can't reveal whether a username exists.
 */
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

/* Load a local .env (KEY=VALUE lines) if present, so a non-technical operator can configure without
 * touching systemd. The file sits in the repo dir but is blocked from the static handler (dotfile). */
(function loadEnv(){
  try {
    var envPath = path.join(__dirname, ".env");
    if(!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach(function(line){
      var m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if(m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    });
  } catch(e){ /* ignore */ }
})();

var SCRYPT_KEYLEN = 64;

function dataDir(){
  // Default: a sibling folder next to the site root, i.e. NOT under the web root.
  return process.env.CMS_DATA_DIR || path.join(__dirname, "..", "enviowebsite-cms-data");
}
function backupsDir(){ return path.join(dataDir(), "backups"); }
function usersFile(){ return path.join(dataDir(), "users.json"); }
function auditFile(){ return path.join(dataDir(), "audit.log"); }
// Authoritative content lives in the DATA DIR (outside the repo/web root) so `git pull` never clobbers
// the team's live edits. The repo only ships a seed (assets/content.seed.json) used to initialize it.
function contentFile(){ return process.env.CMS_CONTENT_FILE || path.join(dataDir(), "content.json"); }
function versionFile(){ return path.join(dataDir(), "version"); }        // cache-buster counter, outside repo
function seedFile(){ return path.join(__dirname, "assets", "content.seed.json"); }

function ensureDataDir(){
  var d = dataDir();
  if(!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  var b = backupsDir();
  if(!fs.existsSync(b)) fs.mkdirSync(b, { recursive: true, mode: 0o700 });
  return d;
}

function loadUsers(){
  try { return JSON.parse(fs.readFileSync(usersFile(), "utf8")); }
  catch(e){ return { users: {} }; }
}
function saveUsers(db){
  ensureDataDir();
  var tmp = usersFile() + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, usersFile());
}

function hashPassword(password){
  var salt = crypto.randomBytes(16);
  var hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

// Precomputed dummy so verifyPassword() burns the same time for unknown users.
var DUMMY = hashPassword(crypto.randomBytes(24).toString("hex"));

function verifyPassword(password, user){
  var known = !!(user && user.salt && user.hash);
  var rec = known ? user : DUMMY;
  try {
    var salt = Buffer.from(rec.salt, "hex");
    var expected = Buffer.from(rec.hash, "hex");
    var derived = crypto.scryptSync(String(password), salt, expected.length);
    var match = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    return known ? match : false; // unknown user: always false, but same work done
  } catch(e){ return false; }
}

// Async variant so the caller can SERIALIZE scrypt work (one at a time) instead of letting a flood of
// parallel logins saturate the libuv threadpool / CPU. Same constant-time + dummy-user behavior.
function verifyPasswordAsync(password, user){
  return new Promise(function(resolve){
    var known = !!(user && user.salt && user.hash);
    var rec = known ? user : DUMMY;
    var salt, expected;
    try { salt = Buffer.from(rec.salt, "hex"); expected = Buffer.from(rec.hash, "hex"); }
    catch(e){ return resolve(false); }
    crypto.scrypt(String(password), salt, expected.length, function(err, derived){
      if(err) return resolve(false);
      var match = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
      resolve(known ? match : false);
    });
  });
}

// Safe lookup that ignores prototype keys (__proto__, constructor, ...).
function getUser(db, username){
  if(!db || !db.users) return null;
  if(!Object.prototype.hasOwnProperty.call(db.users, username)) return null;
  return db.users[username];
}

function setUser(username, password){
  var db = loadUsers();
  db.users = db.users || {};
  var existed = Object.prototype.hasOwnProperty.call(db.users, username);
  var h = hashPassword(password);
  var now = new Date().toISOString();
  db.users[username] = {
    salt: h.salt, hash: h.hash,
    createdAt: existed ? db.users[username].createdAt : now,
    updatedAt: now
  };
  saveUsers(db);
  return existed;
}
function removeUser(username){
  var db = loadUsers();
  if(!getUser(db, username)) return false;
  delete db.users[username];
  saveUsers(db);
  return true;
}

module.exports = {
  dataDir: dataDir, backupsDir: backupsDir, usersFile: usersFile, auditFile: auditFile,
  contentFile: contentFile, versionFile: versionFile, seedFile: seedFile,
  ensureDataDir: ensureDataDir, loadUsers: loadUsers, saveUsers: saveUsers,
  hashPassword: hashPassword, verifyPassword: verifyPassword, verifyPasswordAsync: verifyPasswordAsync,
  getUser: getUser, setUser: setUser, removeUser: removeUser
};
