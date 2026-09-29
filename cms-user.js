"use strict";
/*
 * CMS user CLI — create / change password / list / remove. Passwords are prompted (hidden in a TTY,
 * or read from stdin when piped) and stored ONLY as scrypt hashes in the data dir, never in the repo.
 *
 * Usage:
 *   node cms-user.js add <username>       create user or change its password
 *   node cms-user.js list                 list usernames
 *   node cms-user.js remove <username>    delete a user
 */
var auth = require("./cms-auth");

function hiddenPromptTTY(question){
  return new Promise(function(resolve){
    process.stdout.write(question);
    var stdin = process.stdin;
    var chars = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    function onData(ch){
      var code = ch.charCodeAt(0);
      if(ch === "\r" || ch === "\n" || code === 4){          // Enter / EOT
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData);
        process.stdout.write("\n"); resolve(chars);
      } else if(code === 3){                                 // Ctrl-C
        process.stdout.write("\n"); process.exit(1);
      } else if(code === 127 || code === 8){                 // Backspace
        chars = chars.slice(0, -1);
      } else {
        chars += ch;
      }
    }
    stdin.on("data", onData);
  });
}

function readStdinLines(){
  return new Promise(function(resolve){
    var d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function(c){ d += c; });
    process.stdin.on("end", function(){ resolve(d.split(/\r?\n/)); });
    process.stdin.resume();
  });
}

function getPasswordPair(){
  if(process.stdin.isTTY){
    return hiddenPromptTTY("Password baru: ").then(function(p1){
      return hiddenPromptTTY("Ulangi password: ").then(function(p2){ return [p1, p2]; });
    });
  }
  // piped / non-interactive: first line = password, second line (if any) = confirmation
  return readStdinLines().then(function(lines){
    return [lines[0] || "", lines[1] != null ? lines[1] : (lines[0] || "")];
  });
}

var cmd = process.argv[2];
var username = process.argv[3];

if(cmd === "list"){
  var db = auth.loadUsers();
  var names = Object.keys(db.users || {});
  console.log(names.length ? names.join("\n") : "(belum ada user)");
  process.exit(0);
} else if(cmd === "remove" && username){
  var ok = auth.removeUser(username);
  console.log(ok ? "User '" + username + "' dihapus." : "User '" + username + "' tidak ditemukan.");
  process.exit(ok ? 0 : 1);
} else if(cmd === "add" && username){
  getPasswordPair().then(function(pair){
    var pw = pair[0], pw2 = pair[1];
    if(pw.length < 8){ console.error("Gagal: password minimal 8 karakter."); process.exit(1); }
    if(pw !== pw2){ console.error("Gagal: password tidak cocok."); process.exit(1); }
    var existed = auth.setUser(username, pw);
    console.log((existed ? "Password diperbarui" : "User dibuat") + " untuk '" + username + "'.");
    console.log("Disimpan (hash saja) di: " + auth.usersFile());
    process.exit(0);
  });
} else {
  console.log("Penggunaan:\n  node cms-user.js add <username>\n  node cms-user.js list\n  node cms-user.js remove <username>");
  process.exit(1);
}
