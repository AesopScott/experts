(function () {
  const navItems = [
    {
      label: "Content",
      className: "site-nav-content",
      links: [
        ["Videos", "videos.html"],
        ["Blogs", "blogs.html"],
        ["Workshop Calendar", "workshopcalendar.html"],
        ["Forums", "forums.html"]
      ]
    },
    {
      label: "Growth",
      className: "site-nav-growth",
      links: [
        ["Community Recognition", "communityrecognition.html"],
        ["Expert Recognition", "expertsrecognition.html"],
        ["Expert Profiles", "expertprofiles.html"],
        ["My Profile", "profile.html"]
      ]
    },
    {
      label: "Give",
      className: "site-nav-values",
      links: [
        ["Donate or Sponsor", "support.html"],
        ["Scholarships", "join.html"],
        ["Trends", "trends.html"],
        ["Leader Boards", "leaderboards.html"]
      ]
    },
    {
      label: "Actions",
      className: "site-nav-actions",
      links: [
        ["Join Now", "join.html"],
        ["Expert Program", "experts.html"],
        ["Post a Job", "postajob.html"],
        ["Search", "search.html"]
      ]
    }
  ];

  const domainItems = [
    ["AI & Automation", "domain-ai-automation.html"],
    ["AI in Finance & Investing", "domain-finance-investing.html"],
    ["AI in Marketing, Sales & Growth", "domain-marketing-growth.html"],
    ["AI in Leadership & Management", "domain-leadership-management.html"],
    ["AI in Design, Creative & Gaming", "domain-design-creative-gaming.html"]
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

  function trailMarkup(position) {
    return `
      <svg class="site-nav-trail site-nav-trail-${position}" viewBox="0 0 240 18" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="trail-glow" d="M6 9 H234"></path>
        <path class="trail-thread" d="M6 9 H234"></path>
        <path class="trail-core" d="M6 9 H234"></path>
        <circle class="trail-spark" cx="120" cy="9" r="2.3"></circle>
      </svg>
    `;
  }

  const navMarkup = `
    <div class="site-nav-shell">
    <header class="nav">
      <a class="brand" href="index.html">
        <span class="brand-mark">25</span>
        <span class="brand-text">25experts<span>by Aesop Academy</span></span>
      </a>
      <nav class="nav-links site-nav" aria-label="Site navigation">
        ${navItems.map((group) => `
          <div class="site-nav-group ${group.className}">
            <div class="site-nav-label">${group.label}</div>
            <div class="site-nav-items">
              ${trailMarkup("top")}
              ${group.links.map(linkMarkup).join("")}
              ${trailMarkup("bottom")}
            </div>
          </div>
        `).join("")}
      </nav>
    </header>
    <nav class="site-domain-bar" aria-label="AI domains">
      <span class="site-domain-label">Domains</span>
      <div class="site-domain-links">
        ${domainItems.map(linkMarkup).join("")}
      </div>
    </nav>
    </div>
    <a class="site-jobs-ribbon" href="jobs.html" aria-label="Open the AI jobs board">
      <span class="site-jobs-tail site-jobs-tail-left" aria-hidden="true"></span>
      <span class="site-jobs-tail site-jobs-tail-right" aria-hidden="true"></span>
      <span class="site-jobs-seal" aria-hidden="true">
        <span>Jobs</span>
      </span>
    </a>
  `;

  function renderSiteNav() {
    const mount = document.getElementById("site-nav");
    if (mount) {
      mount.outerHTML = navMarkup;
    }
  }

  function positionJobsRibbon() {
    const shell = document.querySelector(".site-nav-shell");
    const ribbon = document.querySelector(".site-jobs-ribbon");
    if (!shell || !ribbon) return;
    const bottom = shell.getBoundingClientRect().bottom;
    const offset = window.innerWidth <= 760 ? 10 : 18;
    ribbon.style.setProperty("--jobs-ribbon-top", `${Math.max(72, bottom + offset)}px`);
  }

  function watchJobsRibbon() {
    positionJobsRibbon();
    requestAnimationFrame(positionJobsRibbon);
    window.setTimeout(positionJobsRibbon, 150);
    window.addEventListener("load", positionJobsRibbon, { once: true });
    window.addEventListener("resize", positionJobsRibbon, { passive: true });
    if ("ResizeObserver" in window) {
      const shell = document.querySelector(".site-nav-shell");
      if (shell) new ResizeObserver(positionJobsRibbon).observe(shell);
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
    document.addEventListener("DOMContentLoaded", () => { renderSiteNav(); watchJobsRibbon(); renderVersionBadge(); });
  } else {
    renderSiteNav();
    watchJobsRibbon();
    renderVersionBadge();
  }
})();
