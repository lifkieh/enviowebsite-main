(function(){
"use strict";
/* Envio CMS model — window.CMSModel. Pure data helpers (getPath/setPath/validate/diffContent) plus the
 * declarative section config that drives the generic editor in admin.js. No DOM here.
 * Field types: text | textarea | number | bool | image | select(+options). A "list" is a repeatable
 * array; add `sub` for one nested array (used by nav dropdown children). `strings:true` = array of plain
 * strings. `reorder:true` shows up/down. Path segments split on "."; a numeric segment indexes an array. */

function getPath(obj, path){ var p = String(path).split("."), o = obj; for(var i = 0; i < p.length; i++){ if(o == null) return undefined; o = o[p[i]]; } return o; }
function setPath(obj, path, val){ var p = String(path).split("."), o = obj; for(var i = 0; i < p.length - 1; i++){ var k = p[i]; if(o[k] == null) o[k] = /^\d+$/.test(p[i+1]) ? [] : {}; o = o[k]; } o[p[p.length - 1]] = val; }

/* ---- validation (mirrors server.js validateContent, plus a few editor-friendly checks) ---- */
function validate(c){
  var e = [];
  if(!c || typeof c !== "object") return ["Konten kosong."];
  ["settings","collections","pages"].forEach(function(k){ if(!c[k] || typeof c[k] !== "object") e.push("Bagian '" + k + "' hilang."); });
  if(c.settings){ ["identity","contact","nav","footer"].forEach(function(k){ if(!c.settings[k]) e.push("settings." + k + " hilang."); }); }
  if(c.pages){ ["home","about","products","contact"].forEach(function(k){ if(!c.pages[k]) e.push("pages." + k + " hilang."); }); }
  var nav = c.settings && c.settings.nav && c.settings.nav.items;
  if(Array.isArray(nav)) nav.forEach(function(it, i){ if(!it.label) e.push("Menu navigasi #" + (i+1) + " tidak punya label."); if(it.type === "dropdown" && (!it.children || !it.children.length)) e.push("Menu dropdown '" + (it.label||("#"+(i+1))) + "' tidak punya submenu."); });
  return e;
}

/* ---- human-readable diff between two content trees (for the publish review modal) ---- */
function diffContent(a, b){
  var out = [];
  walk(a, b, "", out);
  return out.slice(0, 200);
}
function isObj(v){ return v && typeof v === "object"; }
function walk(a, b, path, out){
  if(Array.isArray(a) || Array.isArray(b)){
    var la = Array.isArray(a) ? a.length : 0, lb = Array.isArray(b) ? b.length : 0;
    if(la !== lb) out.push(label(path) + ": " + la + " → " + lb + " item");
    var n = Math.max(la, lb);
    for(var i = 0; i < n; i++) walk(a ? a[i] : undefined, b ? b[i] : undefined, path + "." + i, out);
    return;
  }
  if(isObj(a) || isObj(b)){
    var keys = {}; if(isObj(a)) Object.keys(a).forEach(function(k){ keys[k] = 1; }); if(isObj(b)) Object.keys(b).forEach(function(k){ keys[k] = 1; });
    Object.keys(keys).forEach(function(k){ walk(isObj(a) ? a[k] : undefined, isObj(b) ? b[k] : undefined, path ? path + "." + k : k, out); });
    return;
  }
  if(String(a == null ? "" : a) !== String(b == null ? "" : b)) out.push(label(path) + ": “" + short(a) + "” → “" + short(b) + "”");
}
function short(v){ v = String(v == null ? "" : v); return v.length > 60 ? v.slice(0, 57) + "…" : v; }
function label(path){ return String(path).replace(/\.(\d+)/g, "[$1]"); }

/* ===================== SETTINGS ===================== */
var ICON_OPTS = ["food","printing","electronics","beauty","agriculture","medical","construction"];
var SETTINGS_SECTIONS = [
  { title: "Identitas & Logo", fields: [
    { path: "settings.identity.brand_name", label: "Nama brand", type: "text" },
    { path: "settings.identity.brand_sub", label: "Sub-brand (di sebelah logo)", type: "text" },
    { path: "settings.identity.company_full", label: "Nama perusahaan lengkap", type: "text" },
    { path: "settings.identity.logo_color", label: "Logo berwarna (header)", type: "image" },
    { path: "settings.identity.logo_color_alt", label: "Teks alt logo berwarna", type: "text" },
    { path: "settings.identity.logo_white", label: "Logo putih (footer)", type: "image" },
    { path: "settings.identity.logo_white_alt", label: "Teks alt logo putih", type: "text" },
    { path: "settings.identity.favicon", label: "Favicon", type: "image" },
    { path: "settings.identity.footer_tagline", label: "Tagline footer", type: "textarea" },
    { path: "settings.identity.website_display", label: "Website (tampil)", type: "text" },
    { path: "settings.identity.website_url", label: "Website (URL lengkap)", type: "text" }
  ]},
  { title: "Kontak", fields: [
    { path: "settings.contact.hq_address", label: "Alamat kantor pusat", type: "textarea" },
    { path: "settings.contact.phone_office", label: "Telepon kantor", type: "text" },
    { path: "settings.contact.wa_sales", label: "WhatsApp sales (tampil)", type: "text" },
    { path: "settings.contact.email", label: "Email", type: "text" },
    { path: "settings.contact.maps_embed", label: "URL Google Maps embed", type: "text", hint: "Harus diawali https://maps.google.com/… atau https://www.google.com/maps… agar tampil." }
  ]},
  { title: "Navigasi (menu header)", lists: [
    { path: "settings.nav.items", title: "Item menu", reorder: true, item: [
      { key: "label", label: "Label", type: "text" },
      { key: "type", label: "Tipe", type: "select", options: ["link","dropdown","cta"] },
      { key: "href", label: "Tautan (untuk link/cta)", type: "text" },
      { key: "page", label: "Kode halaman (home/about/…)", type: "text" }
    ], sub: { key: "children", title: "Submenu (dropdown)", addLabel: "+ Tambah submenu", item: [
      { key: "label", label: "Label", type: "text" },
      { key: "href", label: "Tautan", type: "text" }
    ]}}
  ]},
  { title: "Footer", fields: [
    { path: "settings.footer.company_heading", label: "Judul kolom Perusahaan", type: "text" },
    { path: "settings.footer.products_heading", label: "Judul kolom Produk", type: "text" },
    { path: "settings.footer.hq_heading", label: "Judul kolom Kantor Pusat", type: "text" },
    { path: "settings.footer.copyright_text", label: "Teks hak cipta", type: "text" }
  ], lists: [
    { path: "settings.footer.company_links", title: "Tautan kolom Perusahaan", reorder: true, item: [
      { key: "label", label: "Label", type: "text" }, { key: "href", label: "Tautan", type: "text" } ]},
    { path: "settings.footer.products_links", title: "Tautan kolom Produk", reorder: true, item: [
      { key: "label", label: "Label", type: "text" }, { key: "href", label: "Tautan", type: "text" } ]}
  ]},
  { title: "Tombol WhatsApp Mengambang", fields: [
    { path: "settings.wa_float.enabled", label: "Tampilkan tombol", type: "bool" },
    { path: "settings.wa_float.number", label: "Nomor WhatsApp (kosong = pakai WA sales)", type: "text" },
    { path: "settings.wa_float.message", label: "Pesan awal", type: "text" }
  ]},
  { title: "Formulir kontak (default)", fields: [
    { path: "settings.form.email_to", label: "Kirim email ke (kosong = pakai Email kontak)", type: "text" },
    { path: "settings.form.wa_to", label: "Kirim WA ke (kosong = pakai WA float/sales)", type: "text" },
    { path: "settings.form.product_placeholder", label: "Placeholder dropdown produk", type: "text" },
    { path: "settings.form.other_option_value", label: "Nilai opsi 'Lainnya'", type: "text" },
    { path: "settings.form.other_option_label", label: "Label opsi 'Lainnya'", type: "text" }
  ]}
];

/* ===================== COLLECTIONS ===================== */
var VIS = { key: "is_visible", label: "Tampilkan", type: "bool" };
var DROPDOWN_FIELDS = [
  { key: "in_dropdown", label: "Muncul di dropdown formulir", type: "bool" },
  { key: "form_value", label: "Nilai form", type: "text" },
  { key: "form_label", label: "Label form", type: "text" }
];
var COLLECTION_SECTIONS = [
  { title: "Layanan / Service", lists: [{ path: "collections.service", title: "Service", reorder: true, item: [
    { key: "title", label: "Judul", type: "text" }, { key: "summary", label: "Ringkasan", type: "textarea" },
    { key: "description", label: "Deskripsi", type: "textarea" } ].concat(DROPDOWN_FIELDS, [VIS]) }]},
  { title: "Industri", lists: [{ path: "collections.industry", title: "Industry", reorder: true, item: [
    { key: "name", label: "Nama", type: "text" },
    { key: "icon", label: "Ikon", type: "select", options: ICON_OPTS } ].concat([VIS]) }]},
  { title: "Pilar / Pillar", lists: [{ path: "collections.pillar", title: "Pillar", reorder: true, item: [
    { key: "title", label: "Judul", type: "text" }, { key: "summary", label: "Ringkasan", type: "textarea" },
    { key: "description", label: "Deskripsi", type: "textarea" } ].concat([VIS]) }]},
  { title: "Keluarga Compound", lists: [{ path: "collections.compound_family", title: "Compound family", reorder: true, item: [
    { key: "title", label: "Judul", type: "text" }, { key: "card_summary", label: "Ringkasan kartu", type: "textarea" },
    { key: "image", label: "Gambar kartu", type: "image" }, { key: "card_alt", label: "Alt gambar kartu", type: "text" },
    { key: "link", label: "Tautan kartu", type: "text" }, { key: "eyebrow", label: "Eyebrow detail", type: "text" },
    { key: "detail_image", label: "Gambar detail", type: "image" }, { key: "detail_alt", label: "Alt gambar detail", type: "text" },
    { key: "description", label: "Deskripsi detail", type: "textarea" }, { key: "applications_title", label: "Judul aplikasi", type: "text" }
  ].concat(DROPDOWN_FIELDS, [VIS]), sub: { key: "applications", title: "Aplikasi", strings: true, addLabel: "+ Tambah aplikasi" } }]},
  { title: "Natural Resource Compounds", lists: [{ path: "collections.nrc", title: "NRC", reorder: true, item: [
    { key: "name", label: "Nama", type: "text" }, { key: "card_desc", label: "Deskripsi kartu", type: "textarea" },
    { key: "image", label: "Gambar", type: "image" }, { key: "image_alt", label: "Alt gambar", type: "text" },
    { key: "list_name", label: "Nama di daftar chip", type: "text" } ].concat(DROPDOWN_FIELDS, [VIS]) }]},
  { title: "Alasan Memilih (Why Choose Us)", lists: [{ path: "collections.why_choose", title: "Why choose", reorder: true, item: [
    { key: "title", label: "Judul", type: "text" }, { key: "description", label: "Deskripsi", type: "textarea" } ].concat([VIS]) }]},
  { title: "Item Lingkungan (Environmental)", lists: [{ path: "collections.env_item", title: "Env item", reorder: true, item: [
    { key: "title", label: "Judul", type: "text" }, { key: "description", label: "Deskripsi", type: "textarea" } ].concat([VIS]) }]}
];

/* ===================== PAGES ===================== */
function seoCard(pg){ return { title: "SEO & Meta", fields: [
  { path: "pages." + pg + ".title", label: "Judul tab (title)", type: "text" },
  { path: "pages." + pg + ".seo_title", label: "SEO title", type: "text" },
  { path: "pages." + pg + ".seo_desc", label: "Meta description", type: "textarea", hint: "Idealnya < 500 karakter." },
  { path: "pages." + pg + ".og_image", label: "Gambar Open Graph", type: "image" }
]}; }
function sec(pg, key){ return "pages." + pg + ".sections." + key; }
function btnList(base){ return { path: base + ".buttons", title: "Tombol", reorder: true, item: [
  { key: "label", label: "Label", type: "text" }, { key: "href", label: "Tautan", type: "text" }, { key: "style", label: "Gaya (class)", type: "text" } ]}; }
function buttonFields(base){ return [ { path: base + ".button.label", label: "Label tombol", type: "text" }, { path: base + ".button.href", label: "Tautan tombol", type: "text" } ]; }

var PAGES = {
  home: [ seoCard("home"),
    { title: "Hero", fields: [
      { path: sec("home","hero") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("home","hero") + ".heading", label: "Judul", type: "textarea" },
      { path: sec("home","hero") + ".lead", label: "Lead", type: "textarea" },
      { path: sec("home","hero") + ".video", label: "Video (path .mp4)", type: "text", hint: "Slot video hanya menerima .mp4." },
      { path: sec("home","hero") + ".poster", label: "Poster video", type: "image" },
      { path: sec("home","hero") + ".panel_title", label: "Judul panel", type: "text" }
    ], lists: [ btnList(sec("home","hero")),
      { path: sec("home","hero") + ".stats", title: "Statistik", reorder: true, item: [ { key: "number", label: "Angka", type: "text" }, { key: "label", label: "Label", type: "text" } ]},
      { path: sec("home","hero") + ".panel_points", title: "Poin panel", strings: true }
    ]},
    { title: "Who We Are", fields: [
      { path: sec("home","who-we-are") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("home","who-we-are") + ".heading", label: "Judul", type: "text" },
      { path: sec("home","who-we-are") + ".panel_title", label: "Judul panel", type: "text" }
    ].concat(buttonFields(sec("home","who-we-are"))), lists: [
      { path: sec("home","who-we-are") + ".paragraphs", title: "Paragraf", strings: true } ]},
    { title: "What We Offer", fields: [
      { path: sec("home","what-we-offer") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("home","what-we-offer") + ".heading", label: "Judul", type: "text" },
      { path: sec("home","what-we-offer") + ".intro", label: "Intro", type: "textarea" }
    ].concat(buttonFields(sec("home","what-we-offer"))) },
    { title: "Our Materials", fields: [
      { path: sec("home","our-materials") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("home","our-materials") + ".heading", label: "Judul", type: "text" } ]},
    { title: "Industries", fields: [
      { path: sec("home","industries") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("home","industries") + ".heading", label: "Judul", type: "text" } ]},
    { title: "CTA", fields: [
      { path: sec("home","cta") + ".heading", label: "Judul", type: "text" },
      { path: sec("home","cta") + ".text", label: "Teks", type: "textarea" } ].concat(buttonFields(sec("home","cta"))) }
  ],
  about: [ seoCard("about"),
    { title: "Hero (banner)", fields: [
      { path: sec("about","hero") + ".breadcrumb", label: "Breadcrumb", type: "text" },
      { path: sec("about","hero") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","hero") + ".subtitle", label: "Subjudul", type: "textarea" } ]},
    { title: "About Us", fields: [
      { path: sec("about","about-us") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("about","about-us") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("about","about-us") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","about-us") + ".panel_title", label: "Judul panel", type: "text" } ], lists: [
      { path: sec("about","about-us") + ".paragraphs", title: "Paragraf", strings: true },
      { path: sec("about","about-us") + ".panel_points", title: "Poin panel", strings: true } ]},
    { title: "Vision & Mission", fields: [
      { path: sec("about","vision-mission") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("about","vision-mission") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("about","vision-mission") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","vision-mission") + ".vision_title", label: "Judul Visi", type: "text" },
      { path: sec("about","vision-mission") + ".vision_text", label: "Teks Visi", type: "textarea" },
      { path: sec("about","vision-mission") + ".mission_title", label: "Judul Misi", type: "text" },
      { path: sec("about","vision-mission") + ".mission_text", label: "Teks Misi", type: "textarea" } ]},
    { title: "Why Choose Us", fields: [
      { path: sec("about","why-choose-us") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("about","why-choose-us") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("about","why-choose-us") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","why-choose-us") + ".intro", label: "Intro", type: "textarea" } ]},
    { title: "Industries Served", fields: [
      { path: sec("about","industries-served") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("about","industries-served") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("about","industries-served") + ".heading", label: "Judul", type: "text" } ]},
    { title: "Environmental & Quality", fields: [
      { path: sec("about","environmental-quality") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("about","environmental-quality") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("about","environmental-quality") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","environmental-quality") + ".text", label: "Teks", type: "textarea" } ].concat(buttonFields(sec("about","environmental-quality"))) },
    { title: "CTA", fields: [
      { path: sec("about","cta") + ".heading", label: "Judul", type: "text" },
      { path: sec("about","cta") + ".text", label: "Teks", type: "textarea" } ].concat(buttonFields(sec("about","cta"))) }
  ],
  products: [ seoCard("products"),
    { title: "Hero (banner)", fields: [
      { path: sec("products","hero") + ".breadcrumb", label: "Breadcrumb", type: "text" },
      { path: sec("products","hero") + ".heading", label: "Judul", type: "text" },
      { path: sec("products","hero") + ".subtitle", label: "Subjudul", type: "textarea" } ]},
    { title: "Core Products", fields: [
      { path: sec("products","core-products") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("products","core-products") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("products","core-products") + ".heading", label: "Judul", type: "text" } ]},
    { title: "PLA Compounds", fields: [
      { path: sec("products","pla-compounds") + ".nav_label", label: "Label subnav", type: "text" } ],
      note: "Isi utama bagian ini diambil dari koleksi Compound Family (ckey cf-pla). Edit di tab Koleksi." },
    { title: "Natural Resource Compounds", fields: [
      { path: sec("products","natural-resource-compounds") + ".nav_label", label: "Label subnav", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".heading", label: "Judul", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".intro", label: "Intro", type: "textarea" },
      { path: sec("products","natural-resource-compounds") + ".custom_title", label: "Judul kartu custom", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".custom_text", label: "Teks kartu custom", type: "textarea" },
      { path: sec("products","natural-resource-compounds") + ".custom_button.label", label: "Label tombol custom", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".custom_button.href", label: "Tautan tombol custom", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".compounds_list_title", label: "Judul daftar compound", type: "text" },
      { path: sec("products","natural-resource-compounds") + ".applications_title", label: "Judul daftar aplikasi", type: "text" } ], lists: [
      { path: sec("products","natural-resource-compounds") + ".applications", title: "Aplikasi", strings: true } ]},
    { title: "CTA", fields: [
      { path: sec("products","cta") + ".heading", label: "Judul", type: "text" },
      { path: sec("products","cta") + ".text", label: "Teks", type: "textarea" } ].concat(buttonFields(sec("products","cta"))) }
  ],
  contact: [ seoCard("contact"),
    { title: "Hero (banner)", fields: [
      { path: sec("contact","hero") + ".breadcrumb", label: "Breadcrumb", type: "text" },
      { path: sec("contact","hero") + ".heading", label: "Judul", type: "text" },
      { path: sec("contact","hero") + ".subtitle", label: "Subjudul", type: "textarea" } ]},
    { title: "Info Kontak", fields: [
      { path: sec("contact","contact-info") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("contact","contact-info") + ".heading", label: "Judul", type: "text" },
      { path: sec("contact","contact-info") + ".row_hq_label", label: "Label baris Kantor Pusat", type: "text" },
      { path: sec("contact","contact-info") + ".row_sales_label", label: "Label baris Sales", type: "text" },
      { path: sec("contact","contact-info") + ".row_sales_suffix", label: "Suffix baris Sales", type: "text" },
      { path: sec("contact","contact-info") + ".row_office_label", label: "Label baris Kantor", type: "text" },
      { path: sec("contact","contact-info") + ".row_email_label", label: "Label baris Email", type: "text" },
      { path: sec("contact","contact-info") + ".row_website_label", label: "Label baris Website", type: "text" },
      { path: sec("contact","contact-info") + ".map_title", label: "Judul iframe peta", type: "text" } ]},
    { title: "Formulir", fields: [
      { path: sec("contact","inquiry-form") + ".eyebrow", label: "Eyebrow", type: "text" },
      { path: sec("contact","inquiry-form") + ".heading", label: "Judul", type: "text" },
      { path: sec("contact","inquiry-form") + ".intro", label: "Intro", type: "textarea" },
      { path: sec("contact","inquiry-form") + ".btn_whatsapp", label: "Teks tombol WhatsApp", type: "text" },
      { path: sec("contact","inquiry-form") + ".btn_email", label: "Teks tombol Email", type: "text" },
      { path: sec("contact","inquiry-form") + ".disclaimer", label: "Disclaimer", type: "textarea" } ]},
    { title: "Label field formulir", fields: ["name","company","email","phone","location","quantity","product","message"].reduce(function(acc, f){
        var b = sec("contact","inquiry-form") + ".fields." + f;
        acc.push({ path: b + ".label", label: f + " — label", type: "text" });
        acc.push({ path: b + ".placeholder", label: f + " — placeholder", type: "text" });
        return acc;
      }, []) }
  ]
};

/* Inject a per-section visibility toggle into every page-section card (parity with the PHP per-section
 * "Tampilkan section ini" flag). render.js hides a section when is_visible === false; undefined = visible.
 * The SEO card (paths without ".sections.") is skipped; sections shared by two cards get one toggle. */
Object.keys(PAGES).forEach(function(pg){
  var seen = {};
  PAGES[pg].forEach(function(card){
    var probe = (card.fields && card.fields[0] && card.fields[0].path) || (card.lists && card.lists[0] && card.lists[0].path) || "";
    var m = probe.match(/^(pages\.[^.]+\.sections\.[^.]+)/);
    if(!m || seen[m[1]]) return;
    seen[m[1]] = 1;
    card.fields = [{ path: m[1] + ".is_visible", label: "Tampilkan bagian ini di situs", type: "bool", def: true }].concat(card.fields || []);
  });
});

window.CMSModel = {
  getPath: getPath, setPath: setPath, validate: validate, diffContent: diffContent,
  SETTINGS_SECTIONS: SETTINGS_SECTIONS, COLLECTION_SECTIONS: COLLECTION_SECTIONS, PAGES: PAGES
};
})();
