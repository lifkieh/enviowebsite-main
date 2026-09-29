/* PT Envio Kompound Indonesia — Inquiry form
   Sends the form as a formatted message via WhatsApp (wa.me) or Email (mailto),
   since this is a static site with no backend / server-side mailer. */
(function () {
  "use strict";

  var form = document.getElementById("inquiry-form");
  if (!form) return;

  /* WA number + email are injected server-side via data-* (from Global Settings),
     with the original values as fallback so the form still works if the attrs are absent. */
  var WHATSAPP_NUMBER = form.getAttribute("data-wa-number") || "628561151431"; /* Sales — intl format, no +/spaces */
  var CONTACT_EMAIL = form.getAttribute("data-email") || "marketing@enviocompound.com";

  var statusBox = document.getElementById("form-status");
  var waBtn = document.getElementById("send-whatsapp");
  var emailBtn = document.getElementById("send-email");

  var requiredFields = form.querySelectorAll("[required]");

  function fieldWrap(el) {
    return el.closest(".field");
  }

  function validate() {
    var valid = true;
    requiredFields.forEach(function (el) {
      var wrap = fieldWrap(el);
      var ok = el.type === "checkbox" ? el.checked : el.value.trim() !== "";
      if (el.type === "email" && ok) {
        ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      }
      if (wrap) wrap.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    });
    return valid;
  }

  requiredFields.forEach(function (el) {
    el.addEventListener("input", function () {
      var wrap = fieldWrap(el);
      if (wrap) wrap.classList.remove("invalid");
    });
  });

  function getValue(name) {
    var el = form.elements[name];
    return el ? el.value.trim() : "";
  }

  function buildMessage() {
    var lines = [
      "New B2B Inquiry — PT Envio Kompound Indonesia website",
      "",
      "Name: " + getValue("name"),
      "Company: " + getValue("company"),
      "Email: " + getValue("email"),
      "Phone / WhatsApp: " + getValue("phone"),
      "Country / City: " + (getValue("location") || "-"),
      "Product Interest: " + (getValue("product") || "-"),
      "Estimated Quantity: " + (getValue("quantity") || "-"),
      "",
      "Message:",
      getValue("message")
    ];
    return lines.join("\n");
  }

  function showStatus(type, text) {
    if (!statusBox) return;
    statusBox.textContent = text;
    statusBox.className = "form-status show " + type;
  }

  function focusFirstInvalid() {
    var firstInvalid = form.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea");
    if (firstInvalid) firstInvalid.focus();
  }

  waBtn.addEventListener("click", function () {
    if (!validate()) {
      showStatus("error", "Please complete the required fields marked in red before sending.");
      focusFirstInvalid();
      return;
    }
    var message = encodeURIComponent(buildMessage());
    var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + message;
    showStatus("success", "Opening WhatsApp with your inquiry pre-filled — just hit send there.");
    window.open(url, "_blank", "noopener");
  });

  emailBtn.addEventListener("click", function () {
    if (!validate()) {
      showStatus("error", "Please complete the required fields marked in red before sending.");
      focusFirstInvalid();
      return;
    }
    var subject = encodeURIComponent("B2B Inquiry — " + (getValue("company") || getValue("name")));
    var body = encodeURIComponent(buildMessage());
    var url = "mailto:" + CONTACT_EMAIL + "?subject=" + subject + "&body=" + body;
    showStatus("success", "Opening your email client with your inquiry pre-filled — just hit send.");
    window.location.href = url;
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
  });
})();
