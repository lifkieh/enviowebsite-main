/* PT Envio Kompound Indonesia — shared site behaviour */
(function () {
  "use strict";

  /* ---------- Mobile nav ---------- */
  var burger = document.querySelector(".nav-burger");
  var navLinks = document.querySelector(".nav-links");

  if (burger && navLinks) {
    burger.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("open");
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.body.classList.toggle("no-scroll", isOpen);
    });
  }

  /* Dropdown toggle on click (mobile) + tap-outside close */
  document.querySelectorAll(".nav-item").forEach(function (item) {
    var toggle = item.querySelector(".nav-toggle-item");
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      var isOpen = item.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.querySelectorAll(".nav-item").forEach(function (other) {
        if (other !== item) other.classList.remove("open");
      });
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".nav-item")) {
      document.querySelectorAll(".nav-item.open").forEach(function (i) { i.classList.remove("open"); });
    }
  });

  /* Close mobile nav on link click */
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (navLinks && navLinks.classList.contains("open")) {
        navLinks.classList.remove("open");
        document.body.classList.remove("no-scroll");
        if (burger) burger.setAttribute("aria-expanded", "false");
      }
    });
  });

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Sub-nav active state on scroll (products/about pages) ---------- */
  var subnavLinks = document.querySelectorAll(".page-subnav a");
  if (subnavLinks.length) {
    var sections = Array.prototype.map.call(subnavLinks, function (a) {
      return document.querySelector(a.getAttribute("href"));
    }).filter(Boolean);

    var setActive = function () {
      var pos = window.scrollY + 160;
      var current = sections[0];
      sections.forEach(function (sec) {
        if (sec.offsetTop <= pos) current = sec;
      });
      subnavLinks.forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("href") === "#" + current.id);
      });
    };
    window.addEventListener("scroll", setActive, { passive: true });
    setActive();
  }
})();
