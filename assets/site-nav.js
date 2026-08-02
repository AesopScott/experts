(function () {
  const navItems = [
    ["Videos", "videos.html"],
    ["Support", "support.html"]
  ];

  const current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

  function isActive(href) {
    const target = href.split("#")[0].toLowerCase();
    return target && target === current;
  }

  function linkMarkup([text, href]) {
    const active = isActive(href) ? ' class="active"' : "";
    return `<a href="${href}"${active}>${text}</a>`;
  }

  const navMarkup = `
    <div class="site-nav-shell">
    <header class="nav nav-simple">
      <a class="brand brand-lockup" href="index.html">
        <span class="brand-title">25 experts</span>
        <span class="brand-subtitle">Your Personal AI Content Curator</span>
      </a>
      <nav class="nav-links site-nav site-nav-simple" aria-label="Site navigation">
        ${navItems.map(linkMarkup).join("")}
      </nav>
    </header>
    </div>
  `;

  function renderSiteNav() {
    const mount = document.getElementById("site-nav");
    if (mount) {
      mount.outerHTML = navMarkup;
    }
  }

  function renderVersionBadge() {
    const meta = document.querySelector('meta[name="page-version"]');
    if (!meta) return;
    const badge = document.createElement("div");
    badge.textContent = meta.getAttribute("content");
    badge.style.cssText = "position:fixed;bottom:8px;right:10px;font-size:10px;font-family:monospace;color:rgba(0,0,0,.18);z-index:9999;pointer-events:none;letter-spacing:.04em;user-select:none;";
    document.body.appendChild(badge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { renderSiteNav(); renderVersionBadge(); });
  } else {
    renderSiteNav();
    renderVersionBadge();
  }
})();
