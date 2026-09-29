(function () {
"use strict";
/* Thin client: hydrate window.SITE_CONTENT into the page using the isomorphic renderer (render.js).
   The static HTML is already prerendered at publish time (SEO/crawlers); this keeps the DOM in sync
   with the live global and sets the document title. Edit content via /admin, not here. */
var R = window.ENVIO_RENDER;
function render(){
  var C = window.SITE_CONTENT;
  // Defensive: if the renderer or content failed to load (e.g. content.js 404 under a plain static
  // server), do NOT wipe the prerendered markup that already shipped in the HTML — leave it intact.
  if(!R || !C || !C.pages) return;
  var page = document.body.getAttribute("data-page") || "home";
  if(!C.pages[page]) return; // unknown page → keep prerendered body
  var mount = document.getElementById("site") || document.body;
  var html = R.renderBody(C, page);
  if(html && html.length) mount.innerHTML = html; // never replace with empty
  try { var h = R.pageHead(C, page); if(h && h.title) document.title = h.title; } catch(e){}
}
/* Render SYNCHRONOUSLY, right here. This script sits after #site and before main.js, so the DOM node
 * exists and — critically — the hydrated nodes are in place BEFORE main.js attaches its scroll-reveal
 * IntersectionObserver. Deferring to DOMContentLoaded would let main.js observe the prerendered nodes,
 * then this replace would orphan them and every `.reveal` section would stay invisible. */
render();
})();
