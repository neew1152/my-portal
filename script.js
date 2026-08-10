pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

const GITHUB_USERNAME = "neew1152";

let currentTab = "repos";
let currentFilter = "all";

let reposData = [];
let certsData = [];
let gistsData = [];
let recommendedRepos = [];

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadData();
});

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === currentTab) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }

    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      currentFilter = "all";
      renderFilterBar();
      renderContent();
    });
  });
}

async function loadData() {
  const grid = document.getElementById("grid-container");
  grid.innerHTML = `<div class="loading-state">Loading portal dynamic data...</div>`;

  try {
    const [reposResponse, certsResponse, gistsResponse] =
      await Promise.allSettled([
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`
        ),
        fetch("data.json"),
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/gists?per_page=100`
        ),
      ]);

    if (reposResponse.status === "fulfilled" && reposResponse.value.ok) {
      const rawRepos = await reposResponse.value.json();
      reposData = rawRepos.filter((repo) => !repo.fork);
      fetchRepoReadmeImages();
    }

    if (certsResponse.status === "fulfilled" && certsResponse.value.ok) {
      const json = await certsResponse.value.json();
      if (Array.isArray(json)) {
        certsData = json;
      } else {
        certsData = json.certs || [];
        recommendedRepos = json.recommended_repos || [];
      }
    }

    if (gistsResponse.status === "fulfilled" && gistsResponse.value.ok) {
      const rawGists = await gistsResponse.value.json();
      gistsData = rawGists.map((gist) => {
        const firstFile = Object.keys(gist.files)[0] || "Gist";
        return {
          id: gist.id,
          filename: firstFile,
          description: gist.description || "",
          html_url: gist.html_url,
          categories: categorizeGist(firstFile, gist.description),
        };
      });
    }

    renderFilterBar();
    renderContent();
  } catch (err) {
    console.error("Error loading portal data:", err);
    grid.innerHTML = `<div class="loading-state" style="color:red;">Error loading data. Make sure you are using a web server.</div>`;
  }
}

async function fetchRepoReadmeImages() {
  for (const repo of reposData) {
    try {
      const readmeRes = await fetch(
        `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/README.md`
      );
      if (readmeRes.ok) {
        const markdown = await readmeRes.text();
        const imageUrl = extractFirstImageUrl(
          markdown,
          repo.full_name,
          repo.default_branch
        );
        if (imageUrl) {
          repo.preview_image = imageUrl;
          if (currentTab === "repos") renderContent();
        }
      }
    } catch (e) {
    }
  }
}

function extractFirstImageUrl(markdown, repoFullName, defaultBranch) {
  if (!markdown) return null;
  const mdMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
  const htmlMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);

  let url = mdMatch
    ? mdMatch[1].trim()
    : htmlMatch
      ? htmlMatch[1].trim()
      : null;
  if (!url) return null;

  url = url.split(" ")[0].replace(/^<|>$/g, "");

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const cleanPath = url.replace(/^\.\//, "").replace(/^\//, "");
  return `https://raw.githubusercontent.com/${repoFullName}/${defaultBranch}/${cleanPath}`;
}

function categorizeGist(filename, description = "") {
  const fn = filename.toLowerCase();
  const desc = (description || "").toLowerCase();
  const text = `${fn} ${desc}`;
  const categories = [];

  if (text.includes("android") || text.includes("custom-android")) {
    categories.push("Android");
  }

  if (
    text.includes("analysis") ||
    text.includes("incident") ||
    text.includes("security") ||
    text.includes("censorship") ||
    text.includes("vulnerability") ||
    text.includes("exploit")
  ) {
    categories.push("Security");
  }

  if (
    fn.endsWith(".py") ||
    fn.endsWith(".sh") ||
    text.includes("tools") ||
    text.includes("tool") ||
    text.includes("script")
  ) {
    categories.push("Tools");
  }

  if (
    text.includes("guide") ||
    text.includes("tutorial") ||
    text.includes("notes") ||
    text.includes("cheatsheet") ||
    text.includes("custom-android")
  ) {
    categories.push("Guides");
  }

  if (categories.length === 0) {
    categories.push("Guides");
  }

  return categories;
}

function renderFilterBar() {
  const filterBar = document.getElementById("filter-bar");
  let filters = [];

  if (currentTab === "gists") {
    filters = [
      { id: "Android", label: "📱 Android" },
      { id: "Security", label: "🛡️ Security" },
      { id: "Guides", label: "📖 Guides" },
      { id: "Tools", label: "🛠️ Tools" },
    ];
  }

  if (filters.length === 0) {
    filterBar.style.display = "none";
    filterBar.innerHTML = "";
    return;
  }

  filterBar.style.display = "flex";
  filterBar.innerHTML = filters
    .map(
      (f) => `
    <button class="pill-btn ${currentFilter === f.id ? "active" : ""}" onclick="setFilter('${f.id}')">
      ${f.label}
    </button>
  `
    )
    .join("");
}

function setFilter(filterId) {
  currentFilter = currentFilter === filterId ? "all" : filterId;
  renderFilterBar();
  renderContent();
}

function renderContent() {
  const grid = document.getElementById("grid-container");
  grid.innerHTML = "";

  if (currentTab === "repos") {
    renderRepos(grid);
  } else if (currentTab === "certs") {
    renderCertificates(grid);
  } else if (currentTab === "gists") {
    renderGists(grid);
  }
}

function renderRepos(grid) {
  let filtered = [...reposData];
  const isRepoRecommended = (r) =>
    recommendedRepos.includes(r.name) ||
    r.stargazers_count > 0 ||
    r.topics?.includes("recommended") ||
    r.description?.toLowerCase().includes("recommend");

  filtered.sort((a, b) => (isRepoRecommended(b) ? 1 : 0) - (isRepoRecommended(a) ? 1 : 0));

  filtered.forEach((repo) => {
    const card = document.createElement("a");
    card.href = repo.html_url;
    card.target = "_blank";
    card.className = "card";

    const cleanTitle = repo.name.replace(/[-_]/g, " ");

    const previewMedia = repo.preview_image
      ? `<img src="${repo.preview_image}" alt="${cleanTitle}" loading="lazy">`
      : `<div class="card-preview-fallback git-fallback">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"></line>
        <circle cx="18" cy="6" r="3"></circle>
        <circle cx="6" cy="18" r="3"></circle>
        <path d="M18 9a9 9 0 0 1-9 9"></path>
      </svg>
      <span>Repository</span>
    </div>`;

    const isRecommended = isRepoRecommended(repo);
    const badgeHtml = isRecommended ? `<span class="badge badge-recommend">⭐ Recommended</span>` : "";

    card.innerHTML = `
      <div class="card-preview">${previewMedia}</div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title">${cleanTitle}</h3>
          ${badgeHtml}
        </div>
        <p class="card-desc">${repo.description || "No description provided."}</p>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderCertificates(grid) {
  let filtered = [...certsData];
  const isCertRecommended = (c) => c.recommended || c.isRecommended;

  filtered.sort((a, b) => (isCertRecommended(b) ? 1 : 0) - (isCertRecommended(a) ? 1 : 0));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="loading-state">No certificates found.</div>`;
    return;
  }

  filtered.forEach((item, index) => {
    const filePath = `assets/certs/${item.filename}`;
    const rawTitle =
      item.filename.substring(0, item.filename.lastIndexOf(".")) ||
      item.filename;
    const title = rawTitle.replace(/[-_]/g, " ");
    const extension = item.filename.split(".").pop().toLowerCase();

    const card = document.createElement("a");
    card.href = filePath;
    card.target = "_blank";
    card.className = "card";

    const canvasId = `pdf-canvas-${index}`;
    let previewMedia = "";

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
      previewMedia = `<img src="${filePath}" alt="${title}">`;
    } else if (extension === "pdf") {
      previewMedia = `<canvas id="${canvasId}"></canvas>`;
    } else {
      previewMedia = `<div class="card-preview-fallback">📄 <span>${extension.toUpperCase()}</span></div>`;
    }

    const isRecommended = isCertRecommended(item);
    const badgeHtml = isRecommended ? `<span class="badge badge-recommend">⭐ Recommended</span>` : "";

    card.innerHTML = `
      <div class="card-preview">${previewMedia}</div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title" style="text-transform: capitalize;">${title}</h3>
          ${badgeHtml}
        </div>
        <p class="card-desc">${item.description || ""}</p>
      </div>
    `;

    grid.appendChild(card);

    if (extension === "pdf") {
      renderPdfToCanvas(filePath, canvasId);
    }
  });
}

function renderPdfToCanvas(url, canvasId) {
  pdfjsLib
    .getDocument(url)
    .promise.then((pdf) => {
      pdf.getPage(1).then((page) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport: viewport });
      });
    })
    .catch((err) => console.error("PDF preview error:", err));
}

function renderGists(grid) {
  let filtered = gistsData;

  if (currentFilter !== "all") {
    filtered = gistsData.filter((g) => g.categories.includes(currentFilter));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="loading-state">No Gists found for this category.</div>`;
    return;
  }

  filtered.forEach((gist) => {
    const card = document.createElement("a");
    card.href = gist.html_url;
    card.target = "_blank";
    card.className = "card";

    const badgesHtml = gist.categories
      .map((cat) => {
        const categoryClass = `badge-${cat.toLowerCase()}`;
        return `<span class="badge ${categoryClass}">${cat}</span>`;
      })
      .join("");

    const titleWithoutExt =
      gist.filename.lastIndexOf(".") !== -1
        ? gist.filename.substring(0, gist.filename.lastIndexOf("."))
        : gist.filename;
    const cleanTitle = titleWithoutExt.replace(/[-_]/g, " ");

    const rawDesc = (gist.description || "").trim();
    const isFilenameDesc =
      !rawDesc ||
      rawDesc.toLowerCase() === gist.filename.toLowerCase() ||
      rawDesc.toLowerCase() === titleWithoutExt.toLowerCase();

    const descHtml = isFilenameDesc
      ? ""
      : `<p class="card-desc">${rawDesc}</p>`;

    card.innerHTML = `
      <div class="card-body">
        <div class="card-header-row">
          <div class="card-badges">${badgesHtml}</div>
        </div>
        <h3 class="card-title" style="margin-top:8px;">${cleanTitle}</h3>
        ${descHtml}
      </div>
    `;

    grid.appendChild(card);
  });
}