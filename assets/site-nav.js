(function () {
  const navItems = [
    {
      label: "Content",
      className: "site-nav-content",
      links: [
        ["Trends", "trends.html"],
        ["Videos", "videos.html"],
        ["Blogs", "blogs.html"],
        ["Workshops", "workshopcalendar.html"],
        ["Forums", "forums.html"]
      ]
    },
    {
      label: "Growth",
      className: "site-nav-growth",
      links: [
        ["Patron Recognition", "patronrecognition.html"],
        ["Expert Recognition", "expertsrecognition.html"],
        ["Expert Profiles", "expertprofiles.html"],
        ["My Profile", "profile.html"]
      ]
    },
    {
      label: "Non-Profit Values",
      className: "site-nav-values",
      links: [
        ["Support", "support.html"],
        ["Scholarships", "join.html"],
        ["Mission", "index.html"],
        ["Leader Boards", "leaderboards.html"]
      ]
    },
    {
      label: "Actions",
      className: "site-nav-actions",
      links: [
        ["Join Free", "join.html"],
        ["Expert Program", "experts.html"],
        ["Post a Job", "jobs.html"],
        ["Calendar", "workshopcalendar.html"]
      ]
    }
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
  `;

  function renderSiteNav() {
    const mount = document.getElementById("site-nav");
    if (mount) {
      mount.outerHTML = navMarkup;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderSiteNav);
  } else {
    renderSiteNav();
  }
})();
