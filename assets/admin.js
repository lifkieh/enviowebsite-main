(function(){
"use strict";
/* Envio CMS admin — vanilla JS, no build. Login → edit content tree via the declarative config in
 * cms-model.js → review diff → Publikasikan (PUT /api/content). Riwayat = backups + restore.
 * Field editing is fully generic (getPath/setPath by data-path); image/bool/select handled inline. */
var M = window.CMSModel;
var $ = function(id){ return document.getElementById(id); };
var state = { csrf: null, username: null, section: "settings", content: null, original: null, baseVersion: null, dirty: false };
var WARN_AFTER = 7 * 60 * 60 * 1000 + 50 * 60 * 1000;
var warnTimer = null;

/* ================= api ================= */
function api(method, path, body, extra){
  var opts = { method: method, credentials: "same-origin", headers: {} };
  if(body != null){ opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  if((method === "PUT" || method === "POST") && state.csrf) opts.headers["X-CSRF-Token"] = state.csrf;
  if(extra) for(var k in extra) opts.headers[k] = extra[k];
  return fetch(path, opts).then(function(r){
    resetActivity();
    var ver = (r.headers && r.headers.get) ? r.headers.get("X-Content-Version") : null;
    return r.text().then(function(t){
      var data = {}; try { data = t ? JSON.parse(t) : {}; } catch(e){}
      if(r.status === 401 && state.username && path.indexOf("/api/login") < 0) showRelogin();
      return { status: r.status, data: data, version: ver };
    });
  });
}

/* ================= boot / views ================= */
function showLogin(){ $("appView").hidden = true; $("loginView").hidden = false; $("loginUser").focus(); }
function showApp(){ $("loginView").hidden = true; $("appView").hidden = false; }
function boot(){ api("GET", "/api/session").then(function(r){ if(r.status === 200){ state.username = r.data.username; state.csrf = r.data.csrf; enterApp(); } else showLogin(); }); }
function enterApp(){ showApp(); $("whoami").innerHTML = "Masuk sebagai <b>" + esc(state.username) + "</b>"; resetActivity(); loadStatus(); loadContent(); }
function loadContent(){
  api("GET", "/api/content").then(function(r){
    if(r.status !== 200) return;
    state.content = r.data; state.original = JSON.parse(JSON.stringify(r.data)); state.baseVersion = r.version;
    state.dirty = false; updatePublishBtn(); selectSection(state.section);
  });
}

/* ================= login ================= */
function doLogin(userEl, passEl, errEl, btnEl, onDone){
  var u = userEl.value.trim(), p = passEl.value; errEl.hidden = true; btnEl.disabled = true;
  api("POST", "/api/login", { username: u, password: p }).then(function(r){
    btnEl.disabled = false;
    if(r.status === 200){ state.username = r.data.username; state.csrf = r.data.csrf; passEl.value = ""; onDone(); return; }
    if(r.status === 429){ countdown(errEl, btnEl, r.data.retryAfter || 30); return; }
    errEl.textContent = (r.data && r.data.error) || "Gagal masuk."; errEl.hidden = false;
  });
}
function countdown(errEl, btnEl, secs){
  btnEl.disabled = true; errEl.hidden = false;
  (function tick(){ if(secs <= 0){ errEl.textContent = "Silakan coba lagi."; btnEl.disabled = false; return; }
    errEl.textContent = "Terlalu banyak percobaan. Coba lagi dalam " + secs + " detik."; secs--; setTimeout(tick, 1000); })();
}

/* ================= status + publish ================= */
function loadStatus(){
  api("GET", "/api/status").then(function(r){
    if(r.status !== 200) return; var d = r.data, sb = $("statusbar");
    if(d.lastPublish) sb.innerHTML = "Terakhir dipublikasikan: <b>" + esc(fmtTime(d.lastPublish.time)) + "</b> oleh <b>" + esc(d.lastPublish.user) + "</b> &middot; versi <b>v" + esc(String(d.currentVersion)) + "</b>";
    else sb.innerHTML = "Belum ada publikasi &middot; versi <b>v" + esc(String(d.currentVersion)) + "</b>";
  });
}
function markDirty(){ state.dirty = true; updatePublishBtn(); }
function updatePublishBtn(){ var b = $("publishBtn"); b.textContent = state.dirty ? "Simpan & Terbitkan •" : "Simpan & Terbitkan"; b.className = "a-btn sm " + (state.dirty ? "a-btn-solid pulse" : "a-btn-ghost"); }
function doPublish(){
  var errs = M.validate(state.content);
  if(errs.length){ openValidationModal(errs); return; }
  var diff = M.diffContent(state.original, state.content);
  if(!diff.length){ toast("Tidak ada perubahan untuk dipublikasikan."); return; }
  var body = '<p>Perubahan yang akan tayang di situs:</p><ul class="vlist">' + diff.map(function(d){ return '<li>' + esc(d) + '</li>'; }).join("") + '</ul>';
  openModal("Tinjau " + diff.length + " perubahan sebelum publikasi", body, [
    { label: "Batal", cls: "a-btn-ghost", act: closeModal },
    { label: "Publikasikan sekarang", cls: "a-btn-solid", act: function(){ closeModal(); reallyPublish(); } }
  ]);
}
function reallyPublish(){
  var b = $("publishBtn"); b.disabled = true;
  api("POST", "/api/content", state.content, state.baseVersion != null ? { "X-Base-Version": String(state.baseVersion) } : null).then(function(r){
    b.disabled = false;
    if(r.status === 200){ state.dirty = false; state.original = JSON.parse(JSON.stringify(state.content)); state.baseVersion = r.data.version; updatePublishBtn(); loadStatus(); toast("Berhasil dipublikasikan (v" + r.data.version + ")."); }
    else if(r.status === 409) openConflict(r.data);
    else if(r.status === 400 && r.data.details) openValidationModal(r.data.details);
    else toast("Gagal: " + ((r.data && r.data.error) || r.status));
  });
}
function openConflict(data){
  openModal("Konten sudah diubah orang lain", '<p>' + esc(data.error || "Ada yang menyimpan lebih dulu.") + '</p><p class="muted small">Muat ulang mengambil versi terbaru; perubahanmu yang belum tersimpan akan hilang — catat dulu bila perlu.</p>', [
    { label: "Biarkan dulu", cls: "a-btn-ghost", act: closeModal },
    { label: "Muat ulang versi terbaru", cls: "a-btn-solid", act: function(){ closeModal(); loadContent(); toast("Dimuat ulang ke versi terbaru."); } }
  ]);
}

/* ================= sections ================= */
var TITLES = { settings: "Pengaturan Situs", collections: "Koleksi Konten", home: "Halaman Beranda", about: "Halaman About", products: "Halaman Products", contact: "Halaman Contact", riwayat: "Cadangan & Riwayat", pengguna: "Pengguna", akun: "Akun Saya", bantuan: "Bantuan" };
function selectSection(key){
  state.section = key;
  var items = document.querySelectorAll("#sidebarNav .nav-item");
  for(var i = 0; i < items.length; i++) items[i].className = "nav-item" + (items[i].getAttribute("data-section") === key ? " active" : "");
  $("sectionTitle").textContent = TITLES[key] || "";
  if(key === "riwayat"){ renderRiwayat(); return; }
  if(key === "pengguna"){ renderPengguna(); return; }
  if(key === "akun"){ renderAkun(); return; }
  if(key === "bantuan"){ renderBantuan(); return; }
  if(!state.content){ $("content").innerHTML = '<div class="card"><p>Memuat…</p></div>'; return; }
  if(key === "settings") renderSectionsEditor(M.SETTINGS_SECTIONS);
  else if(key === "collections") renderSectionsEditor(M.COLLECTION_SECTIONS);
  else if(M.PAGES[key]) renderSectionsEditor(M.PAGES[key]);
}
function reRender(){ selectSection(state.section); }

/* ================= generic field renderer ================= */
function inp(path, val, type, opts){
  var v = val == null ? "" : val;
  if(type === "textarea") return '<textarea class="ipt" data-path="' + esc(path) + '" data-type="text" rows="2">' + esc(v) + '</textarea>';
  if(type === "number") return '<input class="ipt" data-path="' + esc(path) + '" data-type="number" value="' + esc(v) + '">';
  if(type === "bool"){ var on = (val === undefined) ? (opts && opts.def !== false) : !!(val === true || val === 1 || val === "1" || val === "true"); return '<label class="switch"><input type="checkbox" class="bool-in" data-path="' + esc(path) + '"' + (on ? " checked" : "") + '><span class="slider"></span><span class="switch-txt">' + esc((opts && opts.boolText) || "Aktif") + '</span></label>'; }
  if(type === "select"){ var o = (opts && opts.options) || []; return '<select class="ipt sel-in" data-path="' + esc(path) + '">' + o.map(function(x){ return '<option value="' + esc(x) + '"' + (String(v) === String(x) ? " selected" : "") + '>' + esc(x) + '</option>'; }).join("") + '</select>'; }
  if(type === "image") return '<div class="img-up"><span class="img-prev">' + (v ? '<img src="' + esc(v) + '" alt="">' : '<span class="muted">—</span>') + '</span>' +
    '<div class="img-actions"><label class="btn-file">Pilih file<input type="file" class="img-file" data-target="' + esc(path) + '" accept="image/png,image/jpeg,image/webp" hidden></label>' +
    '<button type="button" class="lnk chip-btn gallery-btn" data-target="' + esc(path) + '">Galeri</button>' +
    (v ? '<button type="button" class="lnk chip-btn danger img-del" data-target="' + esc(path) + '">Hapus</button>' : '') +
    '<input class="ipt img-path" data-path="' + esc(path) + '" data-type="text" value="' + esc(v) + '" placeholder="assets/images/…"></div></div>';
  return '<input class="ipt" data-path="' + esc(path) + '" data-type="text" value="' + esc(v) + '">';
}
function fieldRow(f){
  var v = M.getPath(state.content, f.path);
  var hint = f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : "";
  var input = f.readonly ? '<input class="ipt" value="' + esc(v == null ? "" : v) + '" disabled>' : inp(f.path, v, f.type, { options: f.options, def: f.def, boolText: f.boolText || f.label });
  return '<div class="frm-f' + (f.type === "bool" ? " chkrow" : "") + '"><label>' + esc(f.label) + hint + '</label>' + input + '</div>';
}
function renderList(l){
  var arr = M.getPath(state.content, l.path) || [];
  var h = '<div class="klist"><div class="klist-h">' + esc(l.title) + '</div>';
  arr.forEach(function(it, i){
    h += '<div class="klist-item">';
    if(l.strings) h += inp(l.path + "." + i, it, "text");
    else l.item.forEach(function(f){ h += '<div class="frm-f sm' + (f.type === "bool" ? " chkrow" : "") + '"><label>' + esc(f.label) + '</label>' + inp(l.path + "." + i + "." + f.key, it[f.key], f.type, { options: f.options, def: f.def, boolText: f.label }) + '</div>'; });
    if(l.sub){
      var sarr = it[l.sub.key] || [], subStr = !!l.sub.strings;
      h += '<div class="ksub"><div class="klist-h sm">' + esc(l.sub.title || "Item") + '</div>';
      sarr.forEach(function(si, k){
        h += '<div class="klist-item sub">';
        if(subStr) h += '<div class="frm-f sm">' + inp(l.path + "." + i + "." + l.sub.key + "." + k, si, "text") + '</div>';
        else l.sub.item.forEach(function(f){ h += '<div class="frm-f sm"><label>' + esc(f.label) + '</label>' + inp(l.path + "." + i + "." + l.sub.key + "." + k + "." + f.key, si[f.key], f.type, { options: f.options }) + '</div>'; });
        h += '<button class="lnk chip-btn danger" data-act="sub-del" data-path="' + esc(l.path) + '" data-i="' + i + '" data-k="' + k + '" data-sub="' + esc(l.sub.key) + '">hapus</button></div>';
      });
      h += '<button class="lnk chip-btn" data-act="sub-add" data-path="' + esc(l.path) + '" data-i="' + i + '" data-sub="' + esc(l.sub.key) + '"' + (subStr ? ' data-substrings="1"' : '') + '>' + esc(l.sub.addLabel || "+ Tambah") + '</button></div>';
    }
    h += '<div class="klist-acts">';
    if(l.reorder) h += '<button class="lnk chip-btn iconbtn" data-act="up" data-path="' + esc(l.path) + '" data-i="' + i + '">↑</button><button class="lnk chip-btn iconbtn" data-act="down" data-path="' + esc(l.path) + '" data-i="' + i + '">↓</button>';
    h += '<button class="lnk chip-btn danger" data-act="del" data-path="' + esc(l.path) + '" data-i="' + i + '">hapus item</button></div></div>';
  });
  h += '<button class="lnk chip-btn" data-act="add" data-path="' + esc(l.path) + '"' + (l.strings ? ' data-strings="1"' : '') + '>+ Tambah</button></div>';
  return h;
}
function renderSectionsEditor(sections){
  var html = '<p class="editor-hint">Ubah isi, lalu klik <b>Simpan &amp; Terbitkan</b> di kanan atas. Klik judul untuk buka/tutup bagian.</p>';
  sections.forEach(function(sec, idx){
    var fields = sec.fields || [], visField = null;
    if(fields[0] && /\.is_visible$/.test(fields[0].path || "")){ visField = fields[0]; fields = fields.slice(1); }
    html += '<div class="card ksec" data-card="' + idx + '">';
    html += '<div class="ksec-head"><button type="button" class="ksec-toggle" data-collapse="' + idx + '"><span class="chev"></span>' + esc(sec.title) + '</button>';
    if(visField){ var vv = M.getPath(state.content, visField.path); html += '<span class="ksec-vis" title="Tampilkan bagian ini di situs">' + inp(visField.path, vv, "bool", { def: visField.def, boolText: "Tampil" }) + '</span>'; }
    html += '</div><div class="ksec-body">';
    if(sec.note) html += '<div class="note">' + esc(sec.note) + '</div>';
    fields.forEach(function(f){ html += fieldRow(f); });
    (sec.lists || []).forEach(function(l){ html += renderList(l); });
    html += '</div></div>';
  });
  $("content").innerHTML = html;
  wireEditor();
}

/* find a list config across every section group (for blank-item creation) */
function allConfigs(){ var out = [].concat(M.SETTINGS_SECTIONS, M.COLLECTION_SECTIONS); for(var k in M.PAGES) out = out.concat(M.PAGES[k]); return out; }
function findListCfg(path){ var res = null; allConfigs().forEach(function(sec){ (sec.lists || []).forEach(function(l){ if(l.path === path) res = l; }); }); return res; }
function blankItem(path){ var l = findListCfg(path), o = {}; if(l && l.item) l.item.forEach(function(f){ o[f.key] = (f.type === "bool") ? (f.def !== false) : ""; }); if(l && l.sub) o[l.sub.key] = []; return o; }
function swap(a, i, j){ var t = a[i]; a[i] = a[j]; a[j] = t; }

var editorWired = false;
function wireEditor(){
  if(editorWired) return; // delegated listeners live on the persistent #content node — attach ONCE
  editorWired = true;
  var c = $("content");
  function onEdit(e){
    var t = e.target; if(!t.getAttribute) return;
    var path = t.getAttribute("data-path"); if(!path) return;
    if(t.classList.contains("bool-in")){ M.setPath(state.content, path, t.checked); markDirty(); return; }
    if(t.classList.contains("sel-in")){ M.setPath(state.content, path, t.value); markDirty(); return; }
    var val = t.value;
    if(t.getAttribute("data-type") === "number"){ var n = parseInt(val, 10); if(isNaN(n)) return; val = n; }
    M.setPath(state.content, path, val);
    if(t.classList.contains("img-path")){ var prev = t.parentNode.querySelector(".img-prev"); if(prev) prev.innerHTML = val ? '<img src="' + esc(val) + '" alt="">' : '<span class="muted">belum ada</span>'; }
    markDirty();
  }
  c.addEventListener("input", onEdit);
  c.addEventListener("change", function(e){ if(e.target.classList && e.target.classList.contains("img-file")) return uploadImage(e.target); onEdit(e); });
  c.addEventListener("click", function(e){
    var x = e.target; if(x.getAttribute && x.classList){
      if(x.classList.contains("gallery-btn")){ openGallery(x.getAttribute("data-target")); return; }
      if(x.classList.contains("img-del")){ removeImage(x.getAttribute("data-target")); return; }
      var col = x.closest && x.closest(".ksec-toggle"); if(col){ var card = col.closest(".card.ksec"); if(card) card.classList.toggle("collapsed"); return; }
    }
    var t = e.target; if(!t.getAttribute) return; var act = t.getAttribute("data-act"); if(!act) return;
    var path = t.getAttribute("data-path"), i = t.getAttribute("data-i"), k = t.getAttribute("data-k"), sub = t.getAttribute("data-sub");
    var arr = M.getPath(state.content, path);
    if(act === "add") arr.push(t.getAttribute("data-strings") ? "" : blankItem(path));
    else if(act === "del") arr.splice(+i, 1);
    else if(act === "up" && +i > 0) swap(arr, +i, +i - 1);
    else if(act === "down" && +i < arr.length - 1) swap(arr, +i, +i + 1);
    else if(act === "sub-add"){ var it = arr[+i]; it[sub] = it[sub] || []; it[sub].push(t.getAttribute("data-substrings") ? "" : { label: "", href: "" }); }
    else if(act === "sub-del") arr[+i][sub].splice(+k, 1);
    else return;
    markDirty(); reRender();
  });
}
function uploadImage(fileInput){
  var file = fileInput.files && fileInput.files[0]; if(!file) return;
  var targetPath = fileInput.getAttribute("data-target");
  if(file.size > 2 * 1024 * 1024){ toast("Ukuran melebihi 2 MB."); fileInput.value = ""; return; }
  var reader = new FileReader();
  reader.onload = function(){
    api("POST", "/api/image", { dataBase64: reader.result }).then(function(r){
      if(r.status === 200){ M.setPath(state.content, targetPath, r.data.path); markDirty(); toast("Gambar diunggah."); reRender(); }
      else toast((r.data && r.data.error) || "Gagal unggah gambar.");
    });
  };
  reader.readAsDataURL(file);
}

/* ================= media library picker ================= */
function openGallery(targetPath){
  api("GET", "/api/images").then(function(r){
    if(r.status !== 200){ toast("Gagal memuat galeri."); return; }
    var imgs = r.data.images || [];
    var grid = imgs.length ? '<div class="gallery-grid-pick">' + imgs.map(function(src){
        var up = /\/uploads\//.test(src);
        return '<div class="gallery-cell"><button type="button" class="gallery-pick" data-src="' + esc(src) + '" title="' + esc(src) + '"><img src="' + esc(src) + '" alt=""></button>' + (up ? '<button type="button" class="gallery-del" data-src="' + esc(src) + '" title="Hapus dari server">×</button>' : '') + '</div>';
      }).join("") + '</div>' : '<p class="muted">Belum ada gambar. Unggah lewat tombol “Pilih file”.</p>';
    openModal("Pilih gambar", grid, [{ label: "Tutup", cls: "a-btn-ghost", act: closeModal }]);
    $("modalRoot").querySelectorAll(".gallery-pick").forEach(function(btn){
      btn.addEventListener("click", function(){ M.setPath(state.content, targetPath, btn.getAttribute("data-src")); markDirty(); closeModal(); reRender(); toast("Gambar dipilih."); });
    });
    $("modalRoot").querySelectorAll(".gallery-del").forEach(function(btn){
      btn.addEventListener("click", function(){ var src = btn.getAttribute("data-src");
        openConfirm("Hapus gambar ini dari server?", "File dihapus permanen. Slot yang memakainya jadi kosong bila belum diganti.", function(){
          api("POST", "/api/image/delete", { path: src }).then(function(rr){ if(rr.status === 200){ toast("Gambar dihapus."); openGallery(targetPath); } else toast((rr.data && rr.data.error) || "Gagal hapus."); });
        }); });
    });
  });
}
function removeImage(targetPath){ M.setPath(state.content, targetPath, ""); markDirty(); reRender(); toast("Gambar dikosongkan dari slot ini."); }

/* ================= akun / pengguna / bantuan ================= */
function renderAkun(){
  $("content").innerHTML = '<div class="card"><h2>Ganti Kata Sandi</h2>' +
    '<div class="frm-f"><label>Kata sandi lama</label><input type="password" class="ipt" id="pwOld" autocomplete="current-password"></div>' +
    '<div class="frm-f"><label>Kata sandi baru</label><input type="password" class="ipt" id="pwNew" autocomplete="new-password"></div>' +
    '<div class="frm-f"><label>Ulangi kata sandi baru</label><input type="password" class="ipt" id="pwNew2" autocomplete="new-password"></div>' +
    '<div class="frm-err" id="pwErr" hidden></div><button class="a-btn a-btn-solid" id="pwSave" type="button">Simpan</button></div>';
  $("pwSave").addEventListener("click", function(){
    var o = $("pwOld").value, n = $("pwNew").value, n2 = $("pwNew2").value, err = $("pwErr");
    if(n.length < 8){ err.textContent = "Kata sandi baru minimal 8 karakter."; err.hidden = false; return; }
    if(n !== n2){ err.textContent = "Ulangan kata sandi tidak sama."; err.hidden = false; return; }
    err.hidden = true; $("pwSave").disabled = true;
    api("POST", "/api/password", { old: o, new: n }).then(function(r){ $("pwSave").disabled = false;
      if(r.status === 200){ toast("Kata sandi diganti."); $("pwOld").value = $("pwNew").value = $("pwNew2").value = ""; }
      else { err.textContent = (r.data && r.data.error) || "Gagal."; err.hidden = false; }
    });
  });
}
function renderPengguna(){
  $("content").innerHTML = '<div class="card"><p>Memuat…</p></div>';
  api("GET", "/api/users").then(function(r){
    if(r.status !== 200){ $("content").innerHTML = '<div class="card"><p>Gagal memuat.</p></div>'; return; }
    var list = r.data.users || [], me = r.data.me;
    var html = '<div class="card"><h2>Tambah Pengguna</h2>' +
      '<div class="form-row"><div class="frm-f"><label>Nama pengguna</label><input class="ipt" id="nuUser" autocomplete="off"></div>' +
      '<div class="frm-f"><label>Kata sandi pengguna baru (min 8)</label><input type="password" class="ipt" id="nuPass" autocomplete="new-password"></div></div>' +
      '<div class="frm-f"><label>Kata sandi Anda (konfirmasi)</label><input type="password" class="ipt" id="nuAdminPw" autocomplete="current-password" placeholder="Verifikasi identitas Anda"></div>' +
      '<div class="frm-err" id="nuErr" hidden></div><button class="a-btn a-btn-solid" id="nuAdd" type="button">Tambah</button></div>';
    html += '<div class="card"><h2>Daftar Pengguna</h2><div class="tablewrap"><table class="dtable"><thead><tr><th>Nama</th><th>Dibuat</th><th></th></tr></thead><tbody>';
    list.forEach(function(u){ html += '<tr><td>' + esc(u.username) + (u.username === me ? ' <span class="tag">Anda</span>' : '') + '</td><td class="muted small">' + esc(fmtTime(u.createdAt)) + '</td><td class="acts2">' + (u.username === me || list.length <= 1 ? '<span class="muted small">—</span>' : '<button class="lnk danger" data-deluser="' + esc(u.username) + '">Hapus</button>') + '</td></tr>'; });
    html += '</tbody></table></div></div>';
    $("content").innerHTML = html;
    $("nuAdd").addEventListener("click", function(){
      var un = $("nuUser").value.trim(), pw = $("nuPass").value, ap = $("nuAdminPw").value, err = $("nuErr");
      if(!ap){ err.textContent = "Isi kata sandi Anda untuk konfirmasi."; err.hidden = false; return; }
      $("nuAdd").disabled = true;
      api("POST", "/api/users", { username: un, password: pw, adminPassword: ap }).then(function(rr){
        $("nuAdd").disabled = false;
        if(rr.status === 200){ toast("Pengguna ditambahkan."); renderPengguna(); }
        else { err.textContent = (rr.data && rr.data.error) || "Gagal."; err.hidden = false; }
      });
    });
    document.querySelectorAll("[data-deluser]").forEach(function(b){ b.addEventListener("click", function(){
      var un = b.getAttribute("data-deluser");
      openPasswordConfirm("Hapus pengguna “" + un + "”?", "Akun ini tidak bisa login lagi. Masukkan kata sandi Anda untuk konfirmasi.", function(pw){
        api("POST", "/api/users/delete", { username: un, adminPassword: pw }).then(function(rr){ if(rr.status === 200){ toast("Pengguna dihapus."); renderPengguna(); } else toast((rr.data && rr.data.error) || "Gagal."); });
      }); }); });
  });
}
function renderBantuan(){
  $("content").innerHTML = '<div class="card guide"><h2>Panduan Singkat</h2>' +
    '<div class="guide-step"><b>1. Ubah teks &amp; gambar</b><p>Buka menu <b>Pengaturan</b>, <b>Koleksi</b>, atau salah satu <b>Halaman</b>. Klik judul bagian untuk buka/tutup. Ketik langsung di kolom.</p></div>' +
    '<div class="guide-step"><b>2. Ganti gambar</b><p>Klik <b>Pilih file</b> untuk unggah, atau <b>Galeri</b> untuk memilih gambar yang sudah ada. <b>Hapus</b> mengosongkan slot.</p></div>' +
    '<div class="guide-step"><b>3. Sembunyikan bagian</b><p>Matikan sakelar <b>Tampil</b> di kanan judul bagian untuk menyembunyikannya dari situs.</p></div>' +
    '<div class="guide-step"><b>4. Terbitkan</b><p>Perubahan belum tayang sampai kamu klik <b>Simpan &amp; Terbitkan</b> di kanan atas dan menyetujui ringkasannya.</p></div>' +
    '<div class="guide-step"><b>5. Salah? Pulihkan</b><p>Buka <b>Cadangan &amp; Riwayat</b> → pilih versi sebelumnya → <b>Pulihkan</b>. Isi sekarang otomatis dicadangkan dulu.</p></div>' +
    '<div class="guide-step"><b>6. Akun</b><p><b>Akun Saya</b> untuk ganti kata sandi. <b>Pengguna</b> untuk menambah/menghapus admin lain.</p></div>' +
    '</div>';
}

/* ================= export / import content ================= */
function exportContent(){
  var blob = new Blob([JSON.stringify(state.content, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "envio-content-v" + (state.baseVersion || "x") + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast("Cadangan JSON diunduh.");
}
function importContent(file){
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    var parsed; try { parsed = JSON.parse(reader.result); } catch(e){ toast("File bukan JSON valid."); return; }
    var errs = M.validate(parsed); if(errs.length){ openValidationModal(errs); return; }
    openConfirm("Impor & publikasikan file ini?", "Isi situs akan diganti dengan file yang diunggah (isi sekarang otomatis dicadangkan dulu).", function(){
      state.content = parsed;
      api("POST", "/api/content", state.content, state.baseVersion != null ? { "X-Base-Version": String(state.baseVersion) } : null).then(function(r){
        if(r.status === 200){ state.original = JSON.parse(JSON.stringify(state.content)); state.baseVersion = r.data.version; state.dirty = false; updatePublishBtn(); loadStatus(); toast("Diimpor & dipublikasikan (v" + r.data.version + ")."); selectSection(state.section); }
        else if(r.status === 409) openConflict(r.data);
        else toast("Gagal impor: " + ((r.data && r.data.error) || r.status));
      });
    });
  };
  reader.readAsText(file);
}

/* ================= riwayat + restore ================= */
function renderRiwayat(){
  $("content").innerHTML = '<div class="card"><p>Memuat riwayat…</p></div>';
  api("GET", "/api/backups").then(function(r){
    if(r.status !== 200){ $("content").innerHTML = '<div class="card"><p>Gagal memuat riwayat.</p></div>'; return; }
    var list = r.data.backups || [];
    var html = '<div class="card"><h2>Cadangan & Impor</h2><p class="muted small">Unduh seluruh konten sebagai file JSON untuk arsip/pindah server, atau impor file JSON untuk menggantikan isi situs (dengan pencadangan otomatis).</p>' +
      '<div class="toolbar2"><button class="a-btn a-btn-ghost sm" id="btnExport" type="button">Unduh cadangan (JSON)</button>' +
      '<label class="a-btn a-btn-ghost sm" style="cursor:pointer">Impor dari file…<input type="file" id="btnImport" accept="application/json,.json" hidden></label></div></div>';
    html += '<div class="card"><h2>Riwayat versi</h2><p class="muted small">' + list.length + ' versi tersimpan (yang lama otomatis dihapus). Memulihkan menyimpan isi SEKARANG sebagai backup baru dulu, jadi tak ada yang hilang.</p>' +
      '<div class="tablewrap"><table class="dtable"><thead><tr><th>Waktu</th><th>Oleh</th><th>Aksi</th></tr></thead><tbody>';
    list.forEach(function(bk){ html += '<tr><td>' + esc(fmtTime(bk.time)) + '</td><td>' + esc(bk.user) + '</td><td class="acts2"><button class="lnk" data-restore="' + esc(bk.name) + '">Pulihkan versi ini</button></td></tr>'; });
    html += '</tbody></table></div></div>';
    $("content").innerHTML = html;
    $("btnExport").addEventListener("click", exportContent);
    $("btnImport").addEventListener("change", function(e){ importContent(e.target.files && e.target.files[0]); e.target.value = ""; });
    document.querySelectorAll("[data-restore]").forEach(function(b){ b.addEventListener("click", function(){ confirmRestore(b.getAttribute("data-restore")); }); });
  });
}
function confirmRestore(name){
  openConfirm("Pulihkan versi ini?", "Situs akan kembali ke isi versi " + name + ". Isi SEKARANG disimpan dulu sebagai backup baru.", function(){
    api("POST", "/api/restore", { name: name }).then(function(r){ if(r.status === 200){ toast("Dipulihkan (v" + r.data.version + ")."); loadContent(); selectSection("settings"); } else toast("Gagal: " + ((r.data && r.data.error) || r.status)); });
  });
}

/* ================= modal / toast ================= */
function openModal(title, bodyHtml, buttons){
  var btns = buttons.map(function(b, i){ return '<button class="a-btn ' + b.cls + '" data-b="' + i + '">' + esc(b.label) + '</button>'; }).join("");
  $("modalRoot").innerHTML = '<div class="overlay"><div class="modal"><div class="modal-h">' + esc(title) + '</div><div class="modal-b">' + bodyHtml + '</div><div class="modal-f">' + btns + '</div></div></div>';
  var els = $("modalRoot").querySelectorAll("[data-b]");
  buttons.forEach(function(b, i){ els[i].addEventListener("click", b.act); });
}
function closeModal(){ $("modalRoot").innerHTML = ""; }
function openConfirm(title, text, onYes){ openModal(title, '<p>' + esc(text) + '</p>', [{ label: "Batal", cls: "a-btn-ghost", act: closeModal }, { label: "Ya, lanjut", cls: "a-btn-solid", act: function(){ closeModal(); onYes(); } }]); }
function openPasswordConfirm(title, text, onYes){
  openModal(title, '<p>' + esc(text) + '</p><div class="frm-f"><label>Kata sandi Anda</label><input type="password" class="ipt" id="pcPw" autocomplete="current-password"></div>', [
    { label: "Batal", cls: "a-btn-ghost", act: closeModal },
    { label: "Konfirmasi", cls: "a-btn-solid", act: function(){ var pw = ($("pcPw") || {}).value || ""; if(!pw) return; closeModal(); onYes(pw); } }
  ]);
  setTimeout(function(){ var el = $("pcPw"); if(el) el.focus(); }, 30);
}
function openValidationModal(errs){ openModal("Ada " + errs.length + " hal yang perlu diperbaiki", '<p>Perbaiki dulu sebelum publikasi:</p><ul class="vlist">' + errs.map(function(e){ return '<li>' + esc(e) + '</li>'; }).join("") + '</ul>', [{ label: "Tutup", cls: "a-btn-solid", act: closeModal }]); }
function toast(msg){ var t = document.createElement("div"); t.className = "cms-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 3200); }

/* ================= session ================= */
function resetActivity(){ if(warnTimer) clearTimeout(warnTimer); $("sessionWarn").hidden = true; warnTimer = setTimeout(function(){ $("sessionWarn").hidden = false; }, WARN_AFTER); }
function showRelogin(){ $("reUser").value = state.username || ""; $("reError").hidden = true; $("reloginOverlay").hidden = false; $("rePass").focus(); }

/* ================= wiring ================= */
$("loginForm").addEventListener("submit", function(e){ e.preventDefault(); doLogin($("loginUser"), $("loginPass"), $("loginError"), $("loginBtn"), enterApp); });
$("reloginForm").addEventListener("submit", function(e){ e.preventDefault(); doLogin($("reUser"), $("rePass"), $("reError"), $("reBtn"), function(){ $("reloginOverlay").hidden = true; loadStatus(); }); });
$("logoutBtn").addEventListener("click", function(){ if(state.dirty && !confirm("Ada perubahan belum dipublikasikan. Tetap keluar?")) return; api("POST", "/api/logout").then(function(){ state.username = null; state.csrf = null; if(warnTimer) clearTimeout(warnTimer); showLogin(); }); });
$("extendBtn").addEventListener("click", function(){ loadStatus(); });
$("publishBtn").addEventListener("click", doPublish);
$("sidebarNav").addEventListener("click", function(e){ var btn = e.target.closest ? e.target.closest(".nav-item") : null; if(btn) selectSection(btn.getAttribute("data-section")); });
window.addEventListener("beforeunload", function(e){ if(state.dirty){ e.preventDefault(); e.returnValue = ""; return ""; } });

/* utils */
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function fmtTime(iso){ try { return new Date(iso).toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); } catch(e){ return iso; } }

boot();
})();
