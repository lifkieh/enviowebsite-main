"use strict";
/*
 * Publish-time build. Zero dependencies (Node built-ins only). Two outputs from the live content.json:
 *   1) assets/content.js  — window.SITE_CONTENT global the browser loads (client hydration).
 *   2) index/about/products/contact.html — FULLY PRERENDERED static pages: real body markup + complete
 *      SEO <head> (title, meta description, canonical, Open Graph, Twitter, JSON-LD Organization) baked in,
 *      so crawlers/link-preview bots get the full page without running JS. app.js re-hydrates in browsers.
 *
 * SOURCE OF TRUTH (live) is auth.contentFile() = <CMS_DATA_DIR>/content.json, OUTSIDE the repo, written by
 * the CMS. assets/content.seed.json initializes it on a fresh deploy. Do NOT hand-edit the generated files.
 * The CMS calls build() on every successful save; run by hand with: node build-content.js
 */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var auth = require("./cms-auth");
var R = require("./assets/render.js");

var ROOT = __dirname;
var OUT = path.join(ROOT, "assets", "content.js");

var HEADER =
  "/*\n" +
  " * AUTO-GENERATED — JANGAN EDIT LANGSUNG.\n" +
  " * Sumber kebenaran: <CMS_DATA_DIR>/content.json. Ubah lewat CMS (/admin), atau jalankan: node build-content.js\n" +
  " * app.js + render.js hanya merender objek ini.\n" +
  " */\n";

var FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

function esc(s){ return R.esc(s); }
function writeAtomic(file, data){ var tmp = file + "." + crypto.randomBytes(4).toString("hex") + ".tmp"; fs.writeFileSync(tmp, data, "utf8"); fs.renameSync(tmp, file); }

function renderPageHtml(content, page){
  var head = R.pageHead(content, page);
  var body = R.renderBody(content, page);
  var extra = (page === "contact") ? '\n<script src="assets/contact-form.js?v=1"></script>' : "";
  return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n" +
    "<meta charset=\"UTF-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
    "<title>" + esc(head.title) + "</title>\n" +
    "<meta name=\"description\" content=\"" + esc(head.description) + "\">\n" +
    "<link rel=\"icon\" type=\"image/png\" href=\"" + esc(head.favicon) + "\">\n" +
    FONTS + "\n" +
    R.seoTags(content, page) + "\n" +
    "<link rel=\"stylesheet\" href=\"assets/style.css?v=1\">\n" +
    "</head>\n<body data-page=\"" + esc(page) + "\">\n" +
    "<div id=\"site\">" + body + "</div>\n" +
    "<script src=\"assets/content.js?v=1\"></script>\n" +
    "<script src=\"assets/render.js?v=1\"></script>\n" +
    "<script src=\"assets/app.js?v=1\"></script>\n" +
    "<script src=\"assets/main.js?v=1\"></script>" + extra + "\n" +
    "</body>\n</html>\n";
}

function build(){
  var SRC = auth.contentFile();
  var data = JSON.parse(fs.readFileSync(SRC, "utf8")); // throws on invalid JSON — caller handles
  // 1) content.js global
  writeAtomic(OUT, HEADER + "window.SITE_CONTENT = " + JSON.stringify(data, null, 2) + ";\n");
  // 2) prerendered static pages
  var files = R.PAGE_FILES; // { home:"index.html", about:"about.html", ... }
  Object.keys(files).forEach(function(page){ writeAtomic(path.join(ROOT, files[page]), renderPageHtml(data, page)); });
  return OUT;
}

if(require.main === module){
  console.log("built " + build() + " + prerendered pages from " + auth.contentFile());
}

module.exports = { build: build };
