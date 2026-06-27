const tabs = [
  {
    id: 1,
    title: "Context map interaction notes",
    url: "docs.google.com/document/d/context-map-notes",
    domain: "docs.google.com",
    topic: "Context Map",
    openedAt: "09:05",
    status: "active",
    group: "Product thinking",
    parentId: null,
    isLlm: false,
    pinned: true,
  },
  {
    id: 2,
    title: "OpenAI ChatGPT - tab clustering ideas",
    url: "chatgpt.com/c/82a-tab-clustering",
    domain: "chatgpt.com",
    topic: "Context Map",
    openedAt: "09:12",
    status: "responded",
    group: "LLM conversations",
    parentId: 1,
    isLlm: true,
    provider: "ChatGPT",
  },
  {
    id: 3,
    title: "MDN tabs API",
    url: "developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs",
    domain: "developer.mozilla.org",
    topic: "Browser APIs",
    openedAt: "09:18",
    status: "active",
    group: "API research",
    parentId: 1,
    isLlm: false,
  },
  {
    id: 4,
    title: "Chrome Extensions: chrome.tabs",
    url: "developer.chrome.com/docs/extensions/reference/api/tabs",
    domain: "developer.chrome.com",
    topic: "Browser APIs",
    openedAt: "09:20",
    status: "active",
    group: "API research",
    parentId: 3,
    isLlm: false,
  },
  {
    id: 5,
    title: "Safari Web Extensions limitations",
    url: "developer.apple.com/documentation/safariservices/safari_web_extensions",
    domain: "developer.apple.com",
    topic: "Browser APIs",
    openedAt: "09:25",
    status: "review",
    group: "API research",
    parentId: 3,
    isLlm: false,
  },
  {
    id: 6,
    title: "GitHub issue - Side panel dynamic ranking",
    url: "github.com/minext/tab-workspace-manager/issues/18",
    domain: "github.com",
    topic: "Context Map",
    openedAt: "09:32",
    status: "active",
    group: "Product thinking",
    parentId: 1,
    isLlm: false,
  },
  {
    id: 7,
    title: "Perplexity - openerTabId reliability",
    url: "perplexity.ai/search/openerTabId-webextensions",
    domain: "perplexity.ai",
    topic: "Browser APIs",
    openedAt: "09:36",
    status: "waiting",
    group: "LLM conversations",
    parentId: 4,
    isLlm: true,
    provider: "Perplexity",
  },
  {
    id: 8,
    title: "Linear - prototype milestone",
    url: "linear.app/minext/issue/TWM-22/context-map-prototype",
    domain: "linear.app",
    topic: "Context Map",
    openedAt: "09:42",
    status: "active",
    group: "Product thinking",
    parentId: 6,
    isLlm: false,
  },
  {
    id: 9,
    title: "Claude - relationship scoring formula",
    url: "claude.ai/chat/scoring-model",
    domain: "claude.ai",
    topic: "Context Map",
    openedAt: "09:47",
    status: "waiting",
    group: "LLM conversations",
    parentId: 6,
    isLlm: true,
    provider: "Claude",
  },
  {
    id: 10,
    title: "Figma - side panel layout sketch",
    url: "figma.com/file/context-map-side-panel",
    domain: "figma.com",
    topic: "Context Map",
    openedAt: "10:03",
    status: "active",
    group: "Design",
    parentId: 8,
    isLlm: false,
  },
  {
    id: 11,
    title: "React FLIP list animation examples",
    url: "codesandbox.io/s/flip-list-animation",
    domain: "codesandbox.io",
    topic: "Animation",
    openedAt: "10:08",
    status: "stale",
    group: "Implementation",
    parentId: 10,
    isLlm: false,
  },
  {
    id: 12,
    title: "Gmail - design sync agenda",
    url: "mail.google.com/mail/u/0/#inbox/FMfcgzQ",
    domain: "mail.google.com",
    topic: "Planning",
    openedAt: "10:13",
    status: "review",
    group: "Planning",
    parentId: null,
    isLlm: false,
  },
  {
    id: 13,
    title: "Google Calendar - UX review block",
    url: "calendar.google.com/calendar/u/0/r/eventedit",
    domain: "calendar.google.com",
    topic: "Planning",
    openedAt: "10:15",
    status: "active",
    group: "Planning",
    parentId: 12,
    isLlm: false,
  },
  {
    id: 14,
    title: "ChatGPT - draft product spec",
    url: "chatgpt.com/c/spec-context-map",
    domain: "chatgpt.com",
    topic: "Product Spec",
    openedAt: "10:19",
    status: "responded",
    group: "LLM conversations",
    parentId: 8,
    isLlm: true,
    provider: "ChatGPT",
  },
];

const manualLinks = new Set(["1:2", "1:6", "6:8", "8:10"]);
const activationPairs = new Map([
  ["1:2", 8],
  ["1:3", 5],
  ["3:4", 7],
  ["3:5", 3],
  ["4:7", 4],
  ["6:8", 6],
  ["6:9", 5],
  ["8:10", 7],
  ["8:14", 5],
  ["12:13", 4],
]);

let activeId = 1;
let selectedId = 2;
let lens = "focus";
let frozenOrder = null;
let focusPath = [1, 2, 6, 8, 1];

const activeSummary = document.querySelector("#active-summary");
const rankedList = document.querySelector("#ranked-list");
const mapLayer = document.querySelector("#map-layer");
const edgeLayer = document.querySelector("#edge-layer");
const metricGrid = document.querySelector("#metric-grid");
const reasonPanel = document.querySelector("#reason-panel");
const focusPathEl = document.querySelector("#focus-path");
const pathCount = document.querySelector("#path-count");
const searchInput = document.querySelector("#search-input");
const weakLinksToggle = document.querySelector("#weak-links-toggle");
const freezeToggle = document.querySelector("#freeze-toggle");
const themeToggle = document.querySelector("#theme-toggle");
let hasRendered = false;

function pairKey(a, b) {
  return [a, b].sort((x, y) => x - y).join(":");
}

function minutes(time) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function currentTab() {
  return tabs.find((tab) => tab.id === activeId);
}

function selectedTab() {
  return tabs.find((tab) => tab.id === selectedId) ?? currentTab();
}

function relationScore(source, target) {
  if (source.id === target.id) {
    return {
      score: 1,
      group: "Current Tab",
      reasons: [{ label: "currently focused", value: 100, weight: 1 }],
    };
  }

  const reasons = [];
  let score = 0;
  const key = pairKey(source.id, target.id);

  if (target.parentId === source.id || source.parentId === target.id) {
    score += 1;
    reasons.push({ label: "opened from current tab", value: 100, weight: 1 });
  }

  if (source.parentId && source.parentId === target.parentId) {
    score += 0.85;
    reasons.push({ label: "same opener parent", value: 85, weight: 0.85 });
  }

  if (source.group === target.group) {
    score += 0.75;
    reasons.push({ label: "same workspace group", value: 75, weight: 0.75 });
  }

  if (source.domain === target.domain) {
    score += 0.62;
    reasons.push({ label: "same domain", value: 62, weight: 0.62 });
  }

  if (source.topic === target.topic) {
    score += 0.58;
    reasons.push({ label: "same topic", value: 58, weight: 0.58 });
  }

  const openGap = Math.abs(minutes(source.openedAt) - minutes(target.openedAt));
  if (openGap <= 18) {
    const value = Math.round(48 - openGap * 1.8);
    score += value / 100;
    reasons.push({ label: "opened nearby in time", value, weight: value / 100 });
  }

  const switches = activationPairs.get(key) ?? 0;
  if (switches > 0) {
    const value = Math.min(58, switches * 8);
    score += value / 100;
    reasons.push({ label: "often switched together", value, weight: value / 100 });
  }

  if (source.isLlm && target.isLlm) {
    score += 0.35;
    reasons.push({ label: "LLM conversation cluster", value: 35, weight: 0.35 });
  }

  if (manualLinks.has(key)) {
    score += 1;
    reasons.push({ label: "pinned relationship", value: 100, weight: 1 });
  }

  const normalized = Math.min(1, score / 2.9);
  return {
    score: normalized,
    group: groupForScore(normalized, reasons),
    reasons: reasons.sort((a, b) => b.value - a.value),
  };
}

function groupForScore(score, reasons) {
  if (score >= 0.7) return "Directly Related";
  if (score >= 0.45) return "Same Task Cluster";
  if (score >= 0.22) return "Nearby Context";
  if (reasons.some((reason) => reason.label.includes("domain"))) return "Same Domain";
  return "Other Open Tabs";
}

function lensScore(tab, active) {
  const relation = relationScore(active, tab);

  if (lens === "domain") {
    return {
      ...relation,
      score: tab.domain === active.domain ? 1 : relation.score * 0.62,
      group: tab.domain === active.domain ? "Same Domain" : relation.group,
    };
  }

  if (lens === "timeline") {
    const gap = Math.abs(minutes(tab.openedAt) - minutes(active.openedAt));
    return {
      ...relation,
      score: tab.id === active.id ? 1 : Math.max(0.08, 1 - gap / 90),
      group: gap <= 10 ? "Opened Together" : gap <= 35 ? "Same Session" : "Later Context",
    };
  }

  if (lens === "llm") {
    const llmBoost = tab.isLlm ? 0.5 : 0;
    return {
      ...relation,
      score: tab.id === active.id ? 1 : Math.min(1, relation.score + llmBoost),
      group: tab.isLlm ? "LLM Conversations" : relation.group,
    };
  }

  return relation;
}

function visibleRankedTabs() {
  const query = searchInput.value.trim().toLowerCase();
  const active = currentTab();
  let ranked = tabs
    .map((tab) => ({ tab, relation: lensScore(tab, active) }))
    .filter(({ tab }) => {
      if (!query) return true;
      return [tab.title, tab.url, tab.domain, tab.topic, tab.group].join(" ").toLowerCase().includes(query);
    })
    .filter(({ relation, tab }) => weakLinksToggle.checked || tab.id === activeId || relation.score >= 0.22);

  if (frozenOrder) {
    ranked = ranked.sort((a, b) => frozenOrder.indexOf(a.tab.id) - frozenOrder.indexOf(b.tab.id));
  } else if (lens === "timeline") {
    ranked = ranked.sort((a, b) => minutes(a.tab.openedAt) - minutes(b.tab.openedAt));
  } else {
    ranked = ranked.sort((a, b) => b.relation.score - a.relation.score || minutes(a.tab.openedAt) - minutes(b.tab.openedAt));
  }

  return ranked;
}

function statusClass(tab) {
  if (tab.isLlm) return tab.status === "waiting" ? "waiting" : "llm";
  if (tab.status === "review") return "review";
  return tab.status;
}

function renderActiveSummary() {
  const active = currentTab();
  activeSummary.innerHTML = `
    <div class="active-title">
      <span class="status-dot ${statusClass(active)}"></span>
      <span>${active.title}</span>
    </div>
    <div class="active-meta">
      <span class="badge strong">${active.domain}</span>
      <span class="badge">${active.topic}</span>
      <span class="badge">${active.openedAt}</span>
      ${active.isLlm ? `<span class="badge llm">${active.provider}</span>` : ""}
    </div>
  `;
}

function rowPositionMap() {
  return new Map(
    [...rankedList.querySelectorAll(".tab-row")].map((row) => {
      const rect = row.getBoundingClientRect();
      return [row.dataset.tabId, rect.top + rect.height / 2];
    }),
  );
}

function animateRankedRows(previousPositions) {
  const rows = [...rankedList.querySelectorAll(".tab-row")];
  const movingRows = [];

  for (const row of rows) {
    const previousTop = previousPositions.get(row.dataset.tabId);
    const rect = row.getBoundingClientRect();
    const currentTop = rect.top + rect.height / 2;

    if (previousTop === undefined) {
      row.classList.add("is-entering");
      movingRows.push(row);
      continue;
    }

    const deltaY = previousTop - currentTop;
    if (Math.abs(deltaY) < 1) continue;

    row.style.setProperty("--flip-y", `${deltaY}px`);
    row.classList.add("is-reranking");
    movingRows.push(row);
  }

  if (movingRows.length === 0) return;

  requestAnimationFrame(() => {
    for (const row of movingRows) {
      row.classList.remove("is-entering");
      row.style.setProperty("--flip-y", "0px");
    }
  });

  window.setTimeout(() => {
    for (const row of movingRows) {
      row.classList.remove("is-reranking");
      row.style.removeProperty("--flip-y");
    }
  }, 620);
}

function centeredRankSlots(ranked) {
  const activeItem = ranked.find(({ tab }) => tab.id === activeId);
  const related = ranked.filter(({ tab }) => tab.id !== activeId);
  const items = [];

  if (activeItem) {
    items.push({ ...activeItem, slot: 0, slotLabel: "now", opacity: 1, scale: 1 });
  }

  related.forEach((item, index) => {
    const distance = Math.floor(index / 2) + 1;
    const slot = index % 2 === 0 ? -distance : distance;
    const fade = Math.max(0.32, 1 - distance * 0.11);
    const scale = Math.max(0.92, 1 - distance * 0.015);

    items.push({
      ...item,
      slot,
      slotLabel: slot < 0 ? `-${distance}` : `+${distance}`,
      opacity: fade,
      scale,
    });
  });

  return items.sort((a, b) => a.slot - b.slot);
}

function renderRankedList(animate = true) {
  const previousPositions = animate ? rowPositionMap() : new Map();
  const ranked = centeredRankSlots(visibleRankedTabs());

  rankedList.innerHTML = ranked
    .map(({ tab, relation, slot, slotLabel, opacity, scale }) => {
      const reason = relation.reasons[0]?.label ?? "weak ambient context";
      return `
        <button
          class="tab-row ${tab.id === activeId ? "is-active" : ""}"
          type="button"
          data-tab-id="${tab.id}"
          style="--slot: ${slot}; --row-opacity: ${opacity}; --row-scale: ${scale};"
        >
          <span class="status-dot ${statusClass(tab)}"></span>
          <span class="row-main">
            <span class="row-title" title="${tab.title}">${tab.title}</span>
            <span class="row-url" title="${tab.url}">${relation.group} · ${reason} · ${tab.domain}</span>
          </span>
          <span class="slot-pill">${slotLabel}</span>
          <span class="score-pill">${Math.round(relation.score * 100)}</span>
        </button>
      `;
    })
    .join("");

  if (animate) {
    animateRankedRows(previousPositions);
  }
}

function distributeY(count, centerY, gap, minY, maxY) {
  if (count <= 1) return [Math.max(minY, Math.min(maxY, centerY))];
  const start = centerY - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => {
    return Math.max(minY, Math.min(maxY, start + index * gap));
  });
}

function computePositions(ranked, stageRect) {
  const centerX = stageRect.width / 2;
  const centerY = stageRect.height / 2;
  const positions = new Map();
  const activeItem = ranked.find((item) => item.tab.id === activeId);

  if (activeItem) {
    positions.set(activeId, {
      x: Math.max(18, Math.min(stageRect.width - 230, centerX - 104)),
      y: Math.max(22, Math.min(stageRect.height - 110, centerY - 43)),
    });
  }

  const related = ranked.filter((item) => item.tab.id !== activeId);

  if (lens === "domain") {
    const lanes = [...new Set(related.map((item) => item.tab.domain))].sort();
    related.forEach((item, index) => {
      const lane = lanes.indexOf(item.tab.domain);
      const laneWidth = Math.max(96, (stageRect.width - 60) / Math.max(1, Math.min(5, lanes.length)));
      positions.set(item.tab.id, {
        x: Math.max(18, Math.min(stageRect.width - 170, 28 + (lane % 5) * laneWidth)),
        y: 64 + Math.floor(index / 5) * 78,
      });
    });
    return positions;
  }

  if (lens === "timeline") {
    related.forEach((item, index) => {
      const columns = Math.max(3, Math.floor(stageRect.width / 166));
      const col = index % columns;
      const row = Math.floor(index / columns);
      positions.set(item.tab.id, {
        x: 24 + col * ((stageRect.width - 190) / Math.max(1, columns - 1)),
        y: 56 + row * 82,
      });
    });
    return positions;
  }

  const strong = related.filter((item) => item.relation.score >= 0.7);
  const cluster = related.filter((item) => item.relation.score < 0.7 && item.relation.score >= 0.45);
  const nearby = related.filter((item) => item.relation.score < 0.45 && item.relation.score >= 0.22);
  const other = related.filter((item) => item.relation.score < 0.22);

  const rightX = Math.max(18, Math.min(stageRect.width - 178, centerX + 132));
  const leftX = Math.max(18, Math.min(stageRect.width - 178, centerX - 300));
  const topY = 54;
  const bottomY = Math.max(260, stageRect.height - 180);

  distributeY(strong.length, centerY, 84, 44, stageRect.height - 90).forEach((y, index) => {
    positions.set(strong[index].tab.id, { x: rightX, y });
  });

  distributeY(cluster.length, centerY, 84, 44, stageRect.height - 90).forEach((y, index) => {
    positions.set(cluster[index].tab.id, { x: leftX, y });
  });

  nearby.forEach((item, index) => {
    const columns = Math.max(2, Math.floor(stageRect.width / 190));
    const col = index % columns;
    const row = Math.floor(index / columns);
    positions.set(item.tab.id, {
      x: 24 + col * ((stageRect.width - 190) / Math.max(1, columns - 1)),
      y: topY + row * 76,
    });
  });

  other.forEach((item, index) => {
    const columns = Math.max(3, Math.floor(stageRect.width / 152));
    const col = index % columns;
    const row = Math.floor(index / columns);
    positions.set(item.tab.id, {
      x: 22 + col * ((stageRect.width - 158) / Math.max(1, columns - 1)),
      y: bottomY + row * 60,
    });
  });

  if (lens === "llm") {
    const llmTabs = related.filter((item) => item.tab.isLlm);
    const llmY = distributeY(llmTabs.length, centerY, 78, 42, stageRect.height - 86);
    llmTabs.forEach((item, index) => {
      positions.set(item.tab.id, {
        x: Math.max(18, Math.min(stageRect.width - 178, centerX + 90)),
        y: llmY[index],
      });
    });
  }

  return positions;
}

function renderMap() {
  const stage = document.querySelector(".workspace");
  const rect = stage.getBoundingClientRect();
  const ranked = visibleRankedTabs();
  const positions = computePositions(ranked, rect);

  mapLayer.innerHTML = ranked
    .map(({ tab, relation }) => {
      const pos = positions.get(tab.id);
      const dimmed = relation.score < 0.2 && tab.id !== activeId ? "is-dimmed" : "";
      const compact = relation.score < 0.22 && tab.id !== activeId ? "is-compact" : "";
      return `
        <button
          class="map-node ${tab.id === activeId ? "is-active" : ""} ${dimmed} ${compact}"
          type="button"
          data-tab-id="${tab.id}"
          style="--x: ${pos.x}px; --y: ${pos.y}px;"
          aria-label="Focus ${tab.title}"
        >
          <span class="status-dot ${statusClass(tab)}"></span>
          <span>
            <span class="node-title" title="${tab.title}">${tab.title}</span>
            <span class="node-meta">
              <span class="badge">${tab.domain.replace("www.", "")}</span>
              <span class="badge">${tab.openedAt}</span>
              ${tab.isLlm ? `<span class="badge llm">${tab.provider}</span>` : ""}
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  const activePosition = positions.get(activeId);
  edgeLayer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  edgeLayer.innerHTML = ranked
    .filter(({ tab }) => tab.id !== activeId && positions.has(tab.id))
    .map(({ tab, relation }) => {
      const pos = positions.get(tab.id);
      const opacity = weakLinksToggle.checked ? Math.max(0.16, relation.score) : Math.max(0.18, relation.score);
      const width = 1 + relation.score * 5;
      return `
        <line
          x1="${activePosition.x + 115}"
          y1="${activePosition.y + 43}"
          x2="${pos.x + 95}"
          y2="${pos.y + 35}"
          stroke-width="${width.toFixed(2)}"
          opacity="${opacity.toFixed(2)}"
        ></line>
      `;
    })
    .join("");
}

function renderInspector() {
  const active = currentTab();
  const selected = selectedTab();
  const ranked = visibleRankedTabs();
  const direct = ranked.filter((item) => item.relation.score >= 0.7 && item.tab.id !== activeId).length;
  const llm = ranked.filter((item) => item.tab.isLlm).length;
  const waiting = ranked.filter((item) => item.tab.status === "waiting" || item.tab.status === "responded").length;

  metricGrid.innerHTML = `
    <div class="metric-card">
      <div class="metric-value">${direct}</div>
      <div class="metric-label">Strong links</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${ranked.length}</div>
      <div class="metric-label">Visible tabs</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${llm}</div>
      <div class="metric-label">LLM tabs</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${waiting}</div>
      <div class="metric-label">Needs follow-up</div>
    </div>
  `;

  const relation = relationScore(active, selected);
  reasonPanel.innerHTML = `
    <div class="section-heading">
      <h3>${selected.id === active.id ? "Current tab" : "Selected tab"}</h3>
      <span class="score-pill">${Math.round(relation.score * 100)}</span>
    </div>
    <p class="row-url">${selected.title}</p>
    <ul class="reason-list">
      ${
        relation.reasons.length
          ? relation.reasons
              .map(
                (reason) => `
                  <li class="reason-item">
                    <span>${reason.label}</span>
                    <span class="bar" aria-hidden="true"><span style="--value: ${reason.value}%"></span></span>
                  </li>
                `,
              )
              .join("")
          : `<li class="reason-item"><span>No strong relationship yet</span><span class="bar"><span style="--value: 8%"></span></span></li>`
      }
    </ul>
  `;

  pathCount.textContent = `${focusPath.length} stops`;
  focusPathEl.innerHTML = focusPath
    .slice(-6)
    .reverse()
    .map((id) => {
      const tab = tabs.find((item) => item.id === id);
      return `<li><strong>${tab.title}</strong><span>${tab.domain} · ${tab.openedAt}</span></li>`;
    })
    .join("");
}

function render() {
  renderActiveSummary();
  renderRankedList(hasRendered);
  renderMap();
  renderInspector();
  hasRendered = true;
}

function focusTab(tabId) {
  if (freezeToggle.checked && frozenOrder === null) {
    frozenOrder = visibleRankedTabs().map((item) => item.tab.id);
  }

  activeId = tabId;
  selectedId = tabId;
  focusPath.push(tabId);
  render();
}

function selectTab(tabId) {
  selectedId = tabId;
  focusTab(tabId);
}

document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-tab-id]");
  if (tabButton) {
    selectTab(Number(tabButton.dataset.tabId));
    return;
  }

  const segment = event.target.closest("[data-lens]");
  if (segment) {
    lens = segment.dataset.lens;
    document.querySelectorAll("[data-lens]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lens === lens);
    });
    frozenOrder = null;
    freezeToggle.checked = false;
    render();
  }
});

document.querySelector("#simulate-switch").addEventListener("click", () => {
  const ranked = visibleRankedTabs().filter((item) => item.tab.id !== activeId);
  const next = ranked[Math.floor(Math.random() * Math.min(6, ranked.length))];
  if (next) focusTab(next.tab.id);
});

document.querySelector("#link-current").addEventListener("click", () => {
  const ranked = visibleRankedTabs().filter((item) => item.tab.id !== activeId);
  const candidate = ranked[0]?.tab;
  if (!candidate) return;
  manualLinks.add(pairKey(activeId, candidate.id));
  selectedId = candidate.id;
  render();
});

searchInput.addEventListener("input", render);
weakLinksToggle.addEventListener("change", render);
freezeToggle.addEventListener("change", () => {
  frozenOrder = freezeToggle.checked ? visibleRankedTabs().map((item) => item.tab.id) : null;
  render();
});

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  themeToggle.textContent = next === "dark" ? "Light" : "Dark";
});

window.addEventListener("resize", render);

render();
