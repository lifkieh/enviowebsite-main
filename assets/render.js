/* Envio isomorphic renderer — pure string builders, NO DOM. Used by BOTH:
 *   - build-content.js (Node) to prerender full static HTML + SEO <head> at publish (crawlers get real markup)
 *   - app.js (browser) to hydrate window.SITE_CONTENT into the page
 * Exposes window.ENVIO_RENDER (browser) and module.exports (Node): { renderBody, pageHead, PAGE_FILES }.
 * Do not hand-edit rendered output — edit content via /admin. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ENVIO_RENDER = api;
})(this, function () {
"use strict";

var C, S, COLL, PAGES; // set per renderBody/pageHead call (single-threaded; safe)
function use(content){ C = content || {}; S = C.settings || {}; COLL = C.collections || {}; PAGES = C.pages || {}; }

function e(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function digits(s){ var d=String(s==null?"":s).replace(/\D+/g,""); if(d.indexOf("0")===0) d="62"+d.slice(1); return d; }
function telHref(s){ return "tel:+"+digits(s); }
function waNumber(){ var wf=S.wa_float||{}; if(wf.number) return digits(wf.number); return digits((S.contact||{}).wa_sales||""); }
function year(){ return new Date().getFullYear(); }
function vis(list){ return (list||[]).filter(function(i){ return i.is_visible===undefined || i.is_visible===1 || i.is_visible===true; }); }
function shown(d){ return !!d && d.is_visible!==false && d.is_visible!==0; } // page section gate (default visible)
function item(ct, ckey){ var a=COLL[ct]||[]; for(var i=0;i<a.length;i++) if(a[i].ckey===ckey) return a[i]; return null; }
function href(h){ return h; }

var ICONS = {
  food:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  printing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h12v4H6z"/><path d="M9 7v4M15 7v4"/><rect x="7" y="11" width="10" height="10" rx="1"/></svg>',
  electronics:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2"/></svg>',
  beauty:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 2h6v3H9z"/><path d="M8 5h8l1 15a2 2 0 01-2 2H9a2 2 0 01-2-2L8 5z"/><path d="M8.5 12h7"/></svg>',
  agriculture:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2c3 3 4 6 4 9a4 4 0 01-8 0c0-3 1-6 4-9z"/><path d="M12 21v-6"/></svg>',
  medical:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v18M3 12h18" stroke-linecap="round"/><rect x="4" y="4" width="16" height="16" rx="3"/></svg>',
  construction:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>'
};
function icon(k){ return ICONS[k]||""; }
var WA_SVG='<svg viewBox="0 0 32 32"><path d="M16 3C9 3 3 9 3 16c0 2.5.7 4.8 1.9 6.8L3 29l6.4-1.8c1.9 1 4.1 1.6 6.6 1.6 7 0 13-6 13-13S23 3 16 3zm0 23.6c-2.2 0-4.3-.6-6.1-1.7l-.4-.3-3.8 1 1-3.7-.3-.4C5.3 20 4.6 18 4.6 16c0-6.3 5.1-11.4 11.4-11.4S27.4 9.7 27.4 16 22.3 26.6 16 26.6zm6.3-8.5c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-2-1.8-2.3-.2-.3 0-.5.1-.6.1-.1.3-.4.5-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.8-1.9-1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 2-.8 2.2-1.6.3-.8.3-1.5.2-1.6-.1-.2-.3-.2-.6-.4z"/></svg>';

/* ---------- header / footer / wa-float ---------- */
function header(page){
  var id=S.identity||{}, nav=(S.nav||{}).items||[];
  var h='<header class="site-header"><div class="container nav">';
  h+='<a href="index.html" class="brand"><img src="'+e(id.logo_color)+'" alt="'+e(id.logo_color_alt)+'"><span class="brand-text"><strong>'+e(id.brand_name)+'</strong><span>'+e(id.brand_sub)+'</span></span></a>';
  h+='<ul class="nav-links" id="navLinks">';
  nav.forEach(function(it){
    var active=it.page&&it.page===page;
    if(it.type==="link"){ h+='<li'+(active?' class="active"':'')+'><a href="'+e(href(it.href))+'">'+e(it.label)+'</a></li>'; }
    else if(it.type==="dropdown"){ h+='<li class="nav-item'+(active?' active':'')+'"><button class="nav-toggle-item" aria-expanded="false">'+e(it.label)+' <span class="caret"></span></button><div class="dropdown">';
      (it.children||[]).forEach(function(ch){ h+='<a href="'+e(href(ch.href))+'">'+e(ch.label)+'</a>'; }); h+='</div></li>'; }
    else if(it.type==="cta"){ h+='<li class="nav-cta"><a href="'+e(href(it.href))+'" class="btn btn-primary">'+e(it.label)+'</a></li>'; }
  });
  h+='</ul><button class="nav-burger" aria-label="Toggle menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/></svg></button>';
  h+='</div></header>';
  return h;
}
function footer(){
  var id=S.identity||{}, ct=S.contact||{}, f=S.footer||{};
  var h='<footer class="site-footer"><div class="container"><div class="footer-grid">';
  h+='<div class="footer-brand"><img src="'+e(id.logo_white)+'" alt="'+e(id.logo_white_alt)+'"><p>'+e(id.footer_tagline)+'</p></div>';
  h+='<div class="footer-col"><h4>'+e(f.company_heading)+'</h4><ul>';
  (f.company_links||[]).forEach(function(l){ h+='<li><a href="'+e(href(l.href))+'">'+e(l.label)+'</a></li>'; });
  h+='</ul></div><div class="footer-col"><h4>'+e(f.products_heading)+'</h4><ul>';
  (f.products_links||[]).forEach(function(l){ h+='<li><a href="'+e(href(l.href))+'">'+e(l.label)+'</a></li>'; });
  h+='</ul></div><div class="footer-col"><h4>'+e(f.hq_heading)+'</h4><ul>';
  h+='<li>'+e(ct.hq_address)+'</li>';
  if(ct.wa_sales){ h+='<li>WhatsApp: '+e(ct.wa_sales)+'</li>'; } // teks saja, non-clickable
  h+='<li><a href="'+e(telHref(ct.phone_office))+'">'+e(ct.phone_office)+' (Office)</a></li><li><a href="mailto:'+e(ct.email)+'">'+e(ct.email)+'</a></li>';
  h+='</ul></div></div><div class="footer-bottom"><span>&copy; '+year()+' '+e(f.copyright_text)+'</span><span>'+e(id.website_display)+'</span></div></div></footer>';
  return h;
}
function waFloat(){
  var wf=S.wa_float||{}; if(!wf.enabled) return ""; // hide unless truthy (matches PHP)
  var num=waNumber(); var link="https://wa.me/"+num; if(wf.message) link+="?text="+encodeURIComponent(wf.message);
  return '<a class="wa-float" href="'+e(link)+'" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">'+WA_SVG+'</a>';
}

/* ---------- shared bits ---------- */
function cta(d,secClass){ var b=d.button||{}; return '<section class="'+secClass+'"><div class="container"><div class="cta-banner reveal"><div><h2>'+e(d.heading)+'</h2><p>'+e(d.text)+'</p></div><a href="'+e(href(b.href))+'" class="btn btn-gold">'+e(b.label)+'</a></div></div></section>'; }
function pageBanner(d){
  var homeLabel="Home"; ((S.nav||{}).items||[]).forEach(function(it){ if(it.page==="home") homeLabel=it.label||"Home"; });
  return '<section class="page-banner"><div class="container"><div class="breadcrumb"><a href="index.html">'+e(homeLabel)+'</a> / '+e(d.breadcrumb)+'</div><h1>'+e(d.heading)+'</h1><p>'+e(d.subtitle)+'</p></div></section>';
}
function subnav(sections){
  var h='<nav class="page-subnav"><div class="container"><ul>';
  Object.keys(sections).forEach(function(k){ var d=sections[k]; if(shown(d)&&d.nav_label) h+='<li><a href="#'+e(k)+'">'+e(d.nav_label)+'</a></li>'; });
  return h+'</ul></div></nav>';
}

/* ---------- HOME ---------- */
function home(P){
  var s=P.sections||{}, out="";
  var d=s.hero; if(shown(d)){
    out+='<section class="hero"><div class="hero-video-wrap" aria-hidden="true"><video class="hero-video" autoplay muted loop playsinline preload="auto" poster="'+e(d.poster)+'"><source src="'+e(d.video)+'" media="(min-width: 781px)" type="video/mp4"></video></div>';
    out+='<div class="container hero-grid"><div class="reveal in"><div class="hero-eyebrow">'+e(d.eyebrow)+'</div><h1>'+e(d.heading)+'</h1><p class="lead">'+e(d.lead)+'</p><div class="hero-actions">';
    (d.buttons||[]).forEach(function(b){ out+='<a href="'+e(href(b.href))+'" class="btn '+e(b.style)+'">'+e(b.label)+'</a>'; });
    out+='</div><div class="hero-stats">';
    (d.stats||[]).forEach(function(st){ out+='<div class="stat"><strong>'+e(st.number)+'</strong><span>'+e(st.label)+'</span></div>'; });
    out+='</div></div><div class="hero-panel reveal"><h3>'+e(d.panel_title)+'</h3><ul>';
    (d.panel_points||[]).forEach(function(p){ out+='<li><span class="dot"></span> '+e(p)+'</li>'; });
    out+='</ul></div></div></section>';
  }
  d=s["who-we-are"]; if(shown(d)){
    out+='<section class="section"><div class="container grid grid-2" style="align-items:center; gap:64px;"><div class="reveal"><div class="eyebrow">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2>';
    (d.paragraphs||[]).forEach(function(p){ out+='<p>'+e(p)+'</p>'; });
    out+='<a href="'+e(href((d.button||{}).href))+'" class="btn btn-outline-dark">'+e((d.button||{}).label)+'</a></div>';
    out+='<div class="reveal hero-panel" style="background:var(--cream-200); border-color:var(--line-200);"><h3 style="color:var(--forest-900);">'+e(d.panel_title)+'</h3><ul>';
    vis(COLL.pillar).forEach(function(p){ out+='<li style="color:var(--ink-700);"><span class="dot" style="background:var(--gold-500);"></span> <strong style="color:var(--forest-900);">'+e(p.title)+'</strong> — '+e(p.summary)+'</li>'; });
    out+='</ul></div></div></section>';
  }
  d=s["what-we-offer"]; if(shown(d)){
    out+='<section class="section section--alt"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2><p>'+e(d.intro)+'</p></div><div class="grid grid-3">';
    vis(COLL.service).forEach(function(sv,i){ out+='<div class="card reveal"><span class="num">'+("0"+(i+1)).slice(-2)+'</span><h3>'+e(sv.title)+'</h3><p>'+e(sv.summary)+'</p></div>'; });
    out+='</div><div style="text-align:center; margin-top:44px;"><a href="'+e(href((d.button||{}).href))+'" class="btn btn-outline-dark">'+e((d.button||{}).label)+'</a></div></div></section>';
  }
  d=s["our-materials"]; if(shown(d)){
    out+='<section class="section"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2></div><div class="grid grid-2">';
    vis(COLL.compound_family).forEach(function(fam){ out+='<a href="'+e(href(fam.link))+'" class="gallery-card reveal"><div class="media"><img src="'+e(fam.image)+'" alt="'+e(fam.card_alt)+'"></div><div class="caption"><h4>'+e(fam.title)+'</h4><p>'+e(fam.card_summary)+'</p></div></a>'; });
    out+='</div></div></section>';
  }
  d=s.industries; if(shown(d)){
    out+='<section class="section section--alt"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2></div><div class="industry-grid">';
    vis(COLL.industry).forEach(function(ind){ out+='<div class="industry-tile reveal"><div class="icon">'+icon(ind.icon)+'</div><span>'+e(ind.name)+'</span></div>'; });
    out+='</div></div></section>';
  }
  d=s.cta; if(shown(d)) out+=cta(d,"section");
  return out;
}

/* ---------- ABOUT ---------- */
function about(P){
  var s=P.sections||{}, out="";
  if(shown(s.hero)) out+=pageBanner(s.hero);
  out+=subnav(s);
  var d=s["about-us"]; if(shown(d)){
    out+='<section id="about-us" class="section"><div class="container grid grid-2" style="align-items:center; gap:64px;"><div class="reveal"><div class="eyebrow">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2>';
    (d.paragraphs||[]).forEach(function(p){ out+='<p>'+e(p)+'</p>'; });
    out+='</div><div class="reveal hero-panel" style="background:var(--forest-900);"><h3>'+e(d.panel_title)+'</h3><ul>';
    (d.panel_points||[]).forEach(function(p){ out+='<li><span class="dot"></span> '+e(p)+'</li>'; });
    out+='</ul></div></div></section>';
  }
  d=s["vision-mission"]; if(shown(d)){
    out+='<section id="vision-mission" class="section section--forest"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="color:var(--gold-300); justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2></div>';
    out+='<div class="grid grid-2" style="margin-bottom:48px; gap:32px;"><div class="reveal" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); border-radius:var(--radius-lg); padding:32px;"><h3 style="color:var(--gold-300);">'+e(d.vision_title)+'</h3><p style="color:rgba(250,248,244,0.85); margin:0;">'+e(d.vision_text)+'</p></div>';
    out+='<div class="reveal" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); border-radius:var(--radius-lg); padding:32px;"><h3 style="color:var(--gold-300);">'+e(d.mission_title)+'</h3><p style="color:rgba(250,248,244,0.85); margin:0;">'+e(d.mission_text)+'</p></div></div>';
    out+='<div class="grid grid-4">';
    vis(COLL.pillar).forEach(function(p){ out+='<div class="reveal" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); border-radius:var(--radius-md); padding:26px;"><h4 style="color:var(--white); font-size:1rem;">'+e(p.title)+'</h4><p style="color:rgba(250,248,244,0.75); font-size:0.9rem; margin:0;">'+e(p.description)+'</p></div>'; });
    out+='</div></div></section>';
  }
  d=s["why-choose-us"]; if(shown(d)){
    out+='<section id="why-choose-us" class="section"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2><p>'+e(d.intro)+'</p></div><div class="pillar-list">';
    vis(COLL.why_choose).forEach(function(w,i){ out+='<div class="pillar reveal"><span class="mark">'+("0"+(i+1)).slice(-2)+'</span><div><h4>'+e(w.title)+'</h4><p>'+e(w.description)+'</p></div></div>'; });
    out+='</div></div></section>';
  }
  d=s["industries-served"]; if(shown(d)){
    out+='<section id="industries-served" class="section section--alt"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2></div><div class="industry-grid">';
    vis(COLL.industry).forEach(function(ind){ out+='<div class="industry-tile reveal"><div class="icon">'+icon(ind.icon)+'</div><span>'+e(ind.name)+'</span></div>'; });
    out+='</div></div></section>';
  }
  d=s["environmental-quality"]; if(shown(d)){
    out+='<section id="environmental-quality" class="section"><div class="container grid grid-2" style="align-items:center; gap:64px;"><div class="reveal env-order-2"><div class="eyebrow">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2><p>'+e(d.text)+'</p><a href="'+e(href((d.button||{}).href))+'" class="btn btn-outline-dark">'+e((d.button||{}).label)+'</a></div><div class="reveal env-order-1"><div class="pillar-list">';
    vis(COLL.env_item).forEach(function(ev){ out+='<div class="pillar" style="grid-template-columns:1fr;"><div><h4>'+e(ev.title)+'</h4><p>'+e(ev.description)+'</p></div></div>'; });
    out+='</div></div></div></section>';
  }
  d=s.cta; if(shown(d)) out+=cta(d,"section section--tight");
  return out;
}

/* ---------- PRODUCTS ---------- */
function products(P){
  var s=P.sections||{}, out="";
  if(shown(s.hero)) out+=pageBanner(s.hero);
  out+=subnav(s);
  var d=s["core-products"]; if(shown(d)){
    out+='<section id="core-products" class="section"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2></div><div class="grid grid-3">';
    vis(COLL.service).forEach(function(sv,i){ out+='<div class="card reveal"><span class="num">'+("0"+(i+1)).slice(-2)+'</span><h3>'+e(sv.title)+'</h3><p>'+e(sv.description)+'</p></div>'; });
    out+='</div></div></section>';
  }
  d=s["pla-compounds"]; var pla=item("compound_family","cf-pla");
  if(shown(d) && pla){
    out+='<section id="pla-compounds" class="section section--alt"><div class="container"><div class="material-block"><div class="material-media reveal"><img src="'+e(pla.detail_image)+'" alt="'+e(pla.detail_alt)+'"></div><div class="reveal"><div class="eyebrow">'+e(pla.eyebrow)+'</div><h2>'+e(pla.title)+'</h2><p>'+e(pla.description)+'</p><div class="chip-list-title">'+e(pla.applications_title)+'</div><div class="chip-list">';
    (pla.applications||[]).forEach(function(a){ out+='<span class="chip">'+e(a)+'</span>'; });
    out+='</div></div></div></div></section>';
  }
  d=s["natural-resource-compounds"]; if(shown(d)){
    out+='<section id="natural-resource-compounds" class="section"><div class="container"><div class="section-head center reveal"><div class="eyebrow" style="justify-content:center;">'+e(d.eyebrow)+'</div><h2>'+e(d.heading)+'</h2><p>'+e(d.intro)+'</p></div><div class="gallery-grid">';
    vis(COLL.nrc).forEach(function(n){ out+='<div class="gallery-card reveal"><div class="media"><img src="'+e(n.image)+'" alt="'+e(n.image_alt)+'"></div><div class="caption"><h4>'+e(n.name)+'</h4><p>'+e(n.card_desc)+'</p></div></div>'; });
    var cb=d.custom_button||{};
    out+='<div class="gallery-card reveal" style="display:flex; align-items:center; justify-content:center; padding:24px; text-align:center;"><div><h4 style="margin-bottom:8px;">'+e(d.custom_title)+'</h4><p style="margin-bottom:16px; font-size:0.88rem;">'+e(d.custom_text)+'</p><a href="'+e(href(cb.href))+'" class="btn btn-primary" style="padding:10px 20px; font-size:0.85rem;">'+e(cb.label)+'</a></div></div>';
    out+='</div><div class="grid grid-2" style="margin-top:56px; gap:40px;"><div class="reveal"><div class="chip-list-title">'+e(d.compounds_list_title)+'</div><div class="chip-list">';
    vis(COLL.nrc).forEach(function(n){ out+='<span class="chip">'+e(n.list_name)+'</span>'; });
    out+='</div></div><div class="reveal"><div class="chip-list-title">'+e(d.applications_title)+'</div><div class="chip-list">';
    (d.applications||[]).forEach(function(a){ out+='<span class="chip">'+e(a)+'</span>'; });
    out+='</div></div></div></div></section>';
  }
  d=s.cta; if(shown(d)) out+=cta(d,"section section--tight section--alt");
  return out;
}

/* ---------- CONTACT ---------- */
function productOptions(){
  var opts=[]; ["service","compound_family","nrc"].forEach(function(ct){ vis(COLL[ct]).forEach(function(i){ if(i.in_dropdown && i.form_value) opts.push({value:i.form_value,label:i.form_label||i.form_value}); }); });
  var fo=S.form||{}; if(fo.other_option_value) opts.push({value:fo.other_option_value,label:fo.other_option_label||fo.other_option_value});
  return opts;
}
function contact(P){
  var s=P.sections||{}, id=S.identity||{}, ct=S.contact||{}, fo=S.form||{}, out="";
  if(shown(s.hero)) out+=pageBanner(s.hero);
  var info=s["contact-info"], frm=s["inquiry-form"];
  out+='<section class="section"><div class="container contact-grid">';
  if(shown(info)){
    out+='<div class="reveal"><div class="contact-info-card"><div class="eyebrow" style="color:var(--gold-300);">'+e(info.eyebrow)+'</div><h3>'+e(info.heading)+'</h3><hr class="divider">';
    out+='<div class="info-row"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></div><div><h4>'+e(info.row_hq_label)+'</h4><p>'+e(ct.hq_address)+'</p></div></div>';
    out+='<div class="info-row"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5c0 8.3 6.7 15 15 15l2-4-5-3-2 2c-2-1-4-3-5-5l2-2-3-5H4z"/></svg></div><div><h4>'+e(info.row_sales_label)+'</h4><a href="https://wa.me/'+e(waNumber())+'" target="_blank" rel="noopener">'+e(ct.wa_sales)+e(info.row_sales_suffix)+'</a></div></div>';
    out+='<div class="info-row"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5c0 8.3 6.7 15 15 15l2-4-5-3-2 2c-2-1-4-3-5-5l2-2-3-5H4z"/></svg></div><div><h4>'+e(info.row_office_label)+'</h4><a href="'+e(telHref(ct.phone_office))+'">'+e(ct.phone_office)+'</a></div></div>';
    out+='<div class="info-row"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div><div><h4>'+e(info.row_email_label)+'</h4><a href="mailto:'+e(ct.email)+'">'+e(ct.email)+'</a></div></div>';
    out+='<div class="info-row"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z"/></svg></div><div><h4>'+e(info.row_website_label)+'</h4><a href="'+e(id.website_url)+'" target="_blank" rel="noopener">'+e(id.website_display)+'</a></div></div>';
    out+='</div>';
    if(ct.maps_embed && /^https?:\/\/(www\.|maps\.)?google\.com\/maps/i.test(ct.maps_embed)) out+='<div class="map-embed"><iframe src="'+e(ct.maps_embed)+'" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="'+e(info.map_title)+'"></iframe></div>';
    out+='</div>';
  }
  if(shown(frm)){ var f=frm.fields||{};
    out+='<div class="reveal" id="inquiry-form-wrap"><div class="form-card"><div class="eyebrow">'+e(frm.eyebrow)+'</div><h2 style="margin-bottom:8px;">'+e(frm.heading)+'</h2><p style="margin-bottom:28px;">'+e(frm.intro)+'</p>';
    out+='<form id="inquiry-form" novalidate data-wa-number="'+e(waNumber())+'" data-email="'+e((fo.email_to)||ct.email)+'">';
    var field=function(k,type){ var fd=f[k]||{}; var req=fd.required?' <span class="required">*</span>':''; var h='<div class="field"><label for="'+k+'">'+e(fd.label)+req+'</label>';
      if(type==="textarea") h+='<textarea id="'+k+'" name="'+k+'"'+(fd.required?' required':'')+' placeholder="'+e(fd.placeholder)+'"></textarea>';
      else h+='<input type="'+type+'" id="'+k+'" name="'+k+'"'+(fd.required?' required':'')+' placeholder="'+e(fd.placeholder)+'">';
      if(fd.error) h+='<div class="error-text">'+e(fd.error)+'</div>'; return h+'</div>'; };
    out+='<div class="form-row">'+field("name","text")+field("company","text")+'</div>';
    out+='<div class="form-row">'+field("email","email")+field("phone","tel")+'</div>';
    out+='<div class="form-row">'+field("location","text")+field("quantity","text")+'</div>';
    var pf=f.product||{};
    out+='<div class="field"><label for="product">'+e(pf.label)+' <span class="required">*</span></label><select id="product" name="product" required><option value="">'+e(fo.product_placeholder)+'</option>';
    productOptions().forEach(function(o){ out+='<option value="'+e(o.value)+'">'+e(o.label)+'</option>'; });
    out+='</select>'+(pf.error?'<div class="error-text">'+e(pf.error)+'</div>':'')+'</div>';
    out+=field("message","textarea");
    out+='<div class="form-actions"><button type="button" id="send-whatsapp" class="btn btn-whatsapp"><svg width="18" height="18" viewBox="0 0 32 32" fill="currentColor"><path d="M16 3C9 3 3 9 3 16c0 2.5.7 4.8 1.9 6.8L3 29l6.4-1.8c1.9 1 4.1 1.6 6.6 1.6 7 0 13-6 13-13S23 3 16 3z"/></svg> '+e(frm.btn_whatsapp)+'</button><button type="button" id="send-email" class="btn btn-outline-dark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg> '+e(frm.btn_email)+'</button></div>';
    out+='<div id="form-status" class="form-status"></div><p class="form-note">'+e(frm.disclaimer)+'</p></form></div></div>';
  }
  out+='</div></section>';
  return out;
}

/* ---------- entry points ---------- */
var RENDER={home:home,about:about,products:products,contact:contact};
var PAGE_FILES={home:"index.html",about:"about.html",products:"products.html",contact:"contact.html"};

function renderBody(content, page){
  use(content); var P=PAGES[page]||{};
  return header(page)+(RENDER[page]?RENDER[page](P):"")+footer()+waFloat();
}
function pageHead(content, page){
  use(content); var P=PAGES[page]||{}, id=S.identity||{};
  var site=String(id.website_url||"").replace(/\/+$/,"");
  var canonical=site+"/"+(page==="home"?"":(PAGE_FILES[page]||(page+".html")));
  var ogTitle=P.seo_title||P.title||"";
  var desc=P.seo_desc||"";
  var ogImage=(P.og_image||"")!==""?P.og_image:(id.logo_color||"");
  var ogAbs=/^https?:\/\//i.test(ogImage)?ogImage:(site+"/"+String(ogImage).replace(/^\/+/,""));
  var logoAbs=site+"/"+String(id.logo_color||"").replace(/^\/+/,"");
  var org={ "@context":"https://schema.org","@type":"Organization","name":id.company_full||"","url":site,"logo":logoAbs,
    "contactPoint":{"@type":"ContactPoint","telephone":(S.contact||{}).phone_office||"","email":(S.contact||{}).email||"","contactType":"sales"},
    "address":{"@type":"PostalAddress","streetAddress":(S.contact||{}).hq_address||"","addressCountry":"ID"} };
  return { title:P.title||"", description:desc, canonical:canonical, ogTitle:ogTitle, ogImageAbs:ogAbs, company:id.company_full||"", jsonld:JSON.stringify(org), favicon:id.favicon||"assets/images/logo/favicon-256.png" };
}
function seoTags(content, page){
  var h=pageHead(content,page);
  return '<link rel="canonical" href="'+e(h.canonical)+'">\n'+
    '<meta property="og:type" content="website">\n'+
    '<meta property="og:site_name" content="'+e(h.company)+'">\n'+
    '<meta property="og:title" content="'+e(h.ogTitle)+'">\n'+
    '<meta property="og:description" content="'+e(h.description)+'">\n'+
    '<meta property="og:url" content="'+e(h.canonical)+'">\n'+
    '<meta property="og:image" content="'+e(h.ogImageAbs)+'">\n'+
    '<meta name="twitter:card" content="summary_large_image">\n'+
    '<meta name="twitter:title" content="'+e(h.ogTitle)+'">\n'+
    '<meta name="twitter:description" content="'+e(h.description)+'">\n'+
    '<meta name="twitter:image" content="'+e(h.ogImageAbs)+'">\n'+
    '<script type="application/ld+json">'+h.jsonld+'</script>';
}

return { renderBody: renderBody, pageHead: pageHead, seoTags: seoTags, PAGE_FILES: PAGE_FILES, esc: e };
});
