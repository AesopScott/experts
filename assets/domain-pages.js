(function () {
  const domains = {
    "ai-automation": {
      title: "AI & Automation",
      color: "#145f47",
      summary: "Practical AI workflows, prompt systems, agent patterns, tool audits, and automation judgment for working professionals.",
      represents: "This domain represents the day-to-day work of making AI useful: mapping workflows, choosing tools, designing agents, automating safely, and helping teams turn experiments into reliable practice.",
      expertCriteria: "The experts here are selected for practical implementation judgment: they can teach non-technical professionals, explain tradeoffs clearly, and show repeatable AI workflows that hold up outside a demo.",
      url: "domain-ai-automation.html",
      founders: ["Dr. Maya Chen", "Owen Patel", "Lena Brooks", "Theo Ramirez", "Priya Shah"],
      specialists: ["Rina Park", "Gabe Ellis"],
      contributors: ["Malik Stone", "June Alvarez", "Tessa Ng"]
    },
    "finance-investing": {
      title: "AI in Finance & Investing",
      color: "#b87a22",
      summary: "AI-assisted financial review, portfolio literacy, cash flow, risk, FP&A, and dashboards people can trust.",
      represents: "This domain represents AI applied to financial decisions: research, reporting, forecasting, portfolio review, budgeting, business finance, risk awareness, and clearer financial communication.",
      expertCriteria: "The experts here are considered credible because they connect financial literacy with AI-assisted analysis without treating AI output as investment advice or a replacement for judgment.",
      url: "domain-finance-investing.html",
      founders: ["Marcus Bell", "Anika Rao", "Jonah Price", "Elena Foster", "Samir Haddad"],
      specialists: ["Keira Walsh", "Noah Grant"],
      contributors: ["Amina Cole", "Peter Lin", "Ruth Adler"]
    },
    "marketing-growth": {
      title: "AI in Marketing, Sales & Growth",
      color: "#245a7d",
      summary: "AI content systems, sales research, customer interviews, webinar reuse, brand voice, and growth operations.",
      represents: "This domain represents AI applied to finding, understanding, reaching, and retaining customers through better research, sharper messaging, sales enablement, and growth systems.",
      expertCriteria: "The experts here are selected for their ability to turn AI into measurable market work: better campaigns, better conversations, stronger customer insight, and repeatable revenue workflows.",
      url: "domain-marketing-growth.html",
      founders: ["Nora Kim", "Caleb Stone", "Mei Tan", "Victor Hale", "Isabel Cruz"],
      specialists: ["Tara Singh", "Leo Mercer"],
      contributors: ["Hannah Price", "Omar Vale", "Cleo Hart"]
    },
    "leadership-management": {
      title: "AI in Leadership & Management",
      color: "#bf563f",
      summary: "AI adoption, governance, team anxiety, decision briefs, operating rhythm, culture, and delegation maps.",
      represents: "This domain represents AI as a leadership and operating problem: how managers set direction, govern adoption, redesign work, communicate change, and help teams use AI responsibly.",
      expertCriteria: "The experts here are considered credible because they understand people, operations, risk, and decision-making, not just tools. They can help leaders adopt AI without losing trust.",
      url: "domain-leadership-management.html",
      founders: ["Dana Wright", "Hugo Bennett", "Farah Nasser", "Miles Ortega", "Rachel Moore"],
      specialists: ["Monica Reyes", "Ben Archer"],
      contributors: ["Ivy Chen", "Grant Silva", "Mara Holt"]
    },
    "design-creative-gaming": {
      title: "AI in Design, Creative & Gaming",
      color: "#67508f",
      summary: "Generative design, creative direction, rapid prototypes, game concepts, brand systems, and visual workflows.",
      represents: "This domain represents AI in creative production: design, storytelling, media, prototyping, visual systems, gaming concepts, and the new collaboration between human taste and generative tools.",
      expertCriteria: "The experts here are selected for creative judgment, portfolio credibility, and the ability to teach AI workflows without flattening originality, craft, or audience experience.",
      url: "domain-design-creative-gaming.html",
      founders: ["Ari Fox", "Jules Rivera", "Mina Park", "Elliot Gray", "Sofia Lane"],
      specialists: ["Nico Ward", "Selene Cho"],
      contributors: ["Ezra Lake", "Pia Moreno", "Kade Wynn"]
    }
  };

  const roles = [
    "Applied AI Strategy",
    "Workflow Systems",
    "Practical AI Education",
    "Live Workshop Lead",
    "AI Community Practice"
  ];

  const topicBank = {
    videos: ["First workflow map", "AI quality checks", "Prompt system audit"],
    blogs: ["Weekly AI practice", "What to automate first", "How to evaluate output"],
    workshops: ["Live workflow lab", "Expert workshop", "Member Q&A"]
  };

  function initials(name) {
    return name.split(" ").filter(Boolean).map((part) => part[0]).join("").replace("D", "").slice(0, 2).toUpperCase();
  }

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function portraitPath(name) {
    return `assets/portraits/${slug(name.replace(/^Dr\.\s*/, ""))}.jpg`;
  }

  function seedFor(domainIndex, index) {
    return domainIndex * 9 + index + 1;
  }

  function founderCards(domain, domainIndex) {
    return domain.founders.map((name, index) => {
      const seed = seedFor(domainIndex, index);
      const followers = index === 0 ? 52143 : 9800 + seed * 1187;
      const patrons = index === 0 ? 456 : 72 + seed * 19;
      const expertsPatrons = index === 0 ? 65 : 12 + seed * 4;
      const videos = 17 + (seed % 7);
      const blogs = 9 + (seed % 6);
      const workshops = 3 + (seed % 4);
      return `
        <article class="expert-card">
          <div class="portrait"><img src="${portraitPath(name)}" alt="Professional headshot of ${name}"></div>
          <div class="expert-body">
            <span class="role">Founding Expert</span>
            <h3>${name}</h3>
            <p>${roles[index]} for ${domain.title.replace("AI in ", "").replace("AI & ", "")}. Helps patrons turn AI ideas into repeatable practice.</p>
            <div class="content-mini">
              <a href="#">Last video: ${topicBank.videos[index % topicBank.videos.length]}</a>
              <a href="#">Last blog: ${topicBank.blogs[index % topicBank.blogs.length]}</a>
              <a href="#">Last workshop: ${topicBank.workshops[index % topicBank.workshops.length]}</a>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><strong>${followers.toLocaleString()}</strong><span>followers</span></div>
            <div class="stat"><strong>${patrons.toLocaleString()} / ${expertsPatrons}</strong><span>Patreon / 25experts subscribers</span></div>
            <div class="stat"><strong>${videos}</strong><span>videos</span></div>
            <div class="stat"><strong>${blogs} / ${workshops}</strong><span>blogs / workshops</span></div>
          </div>
          <div class="expert-actions">
            <a href="expertprofiles.html#${slug(name)}">View profile</a>
            <a class="secondary" href="forums.html">Forum</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function peopleList(names, badge, domain) {
    return names.map((name, index) => `
      <div class="person">
        <img class="avatar" src="${portraitPath(name)}" alt="Professional headshot of ${name}">
        <span><strong>${name}</strong><span>${badge === "Specialist" ? "Verified creator with elevated access and recognition." : "Emerging creator participating inside domain forums."}</span></span>
        <span class="badge">${badge}</span>
      </div>
    `).join("");
  }

  function tabs(currentKey) {
    return Object.entries(domains).map(([key, domain]) => `
      <a class="${key === currentKey ? "active" : ""}" href="${domain.url}">${domain.title}</a>
    `).join("");
  }

  function render() {
    const key = document.body.dataset.domain;
    const entries = Object.entries(domains);
    const domainIndex = entries.findIndex(([entryKey]) => entryKey === key);
    const domain = domains[key] || domains["ai-automation"];
    document.documentElement.style.setProperty("--domain-color", domain.color);
    document.title = `${domain.title} | 25experts`;
    document.getElementById("domain-tabs").innerHTML = tabs(key);
    document.getElementById("domain-title").textContent = domain.title;
    document.getElementById("domain-summary").textContent = domain.summary;
    document.getElementById("domain-represents").textContent = domain.represents;
    document.getElementById("domain-expert-criteria").textContent = domain.expertCriteria;
    document.getElementById("founding-grid").innerHTML = founderCards(domain, Math.max(domainIndex, 0));
    document.getElementById("specialists-list").innerHTML = peopleList(domain.specialists, "Specialist", domain);
    document.getElementById("contributors-list").innerHTML = peopleList(domain.contributors, "Contributor", domain);
    document.getElementById("domain-footer-name").textContent = domain.title;
  }

  document.addEventListener("DOMContentLoaded", render);
})();
