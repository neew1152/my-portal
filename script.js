// Configure PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

const GITHUB_USERNAME = "neew1152";

// State Management - Set "recommended" as the default active filter
let currentTab = "repos";
let currentFilter = "recommended";

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
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      // Default to "recommended" for Repos/Certs and "all" for Gists
      currentFilter = currentTab === "gists" ? "all" : "recommended";
      renderFilterBar();
      renderContent();
    });
  });
}

// Fetch all data sources concurrently
async function loadData() {
  const grid = document.getElementById("grid-container");
  grid.innerHTML = `<div class="loading-state">Loading portal dynamic data...</div>`;

  try {
    const [reposResponse, certsResponse, gistsResponse] =
      await Promise.allSettled([
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`,
        ),
        fetch("data.json"),
        fetch(
          `https://api.github.com/users/${GITHUB_USERNAME}/gists?per_page=100`,
        ),
      ]);

    if (reposResponse.status === "fulfilled" && reposResponse.value.ok) {
      const rawRepos = await reposResponse.value.json();
      reposData = rawRepos.filter((repo) => !repo.fork);
      // Fetch README image previews for repos asynchronously
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
          category: categorizeGist(firstFile, gist.description),
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

// Extract first image from README.md for each repo
async function fetchRepoReadmeImages() {
  for (const repo of reposData) {
    try {
      const readmeRes = await fetch(
        `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/README.md`,
      );
      if (readmeRes.ok) {
        const markdown = await readmeRes.text();
        const imageUrl = extractFirstImageUrl(
          markdown,
          repo.full_name,
          repo.default_branch,
        );
        if (imageUrl) {
          repo.preview_image = imageUrl;
          // Re-render if currently viewing repos
          if (currentTab === "repos") renderContent();
        }
      }
    } catch (e) {
      // Ignore README fetch errors gracefully
    }
  }
}

// Regex image parser for Markdown
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

// Categorize Gists into Android, Security, Tools, Guides
function categorizeGist(filename, description = "") {
  const fn = filename.toLowerCase();
  const desc = (description || "").toLowerCase();
  const text = `${fn} ${desc}`;

  // 1. Android Category
  if (fn.startsWith("custom-android") || text.includes("android")) {
    return "Android";
  }

  // 2. Security Category
  if (
    fn.startsWith("analysis") ||
    fn.startsWith("incident") ||
    text.includes("security") ||
    text.includes("censorship")
  ) {
    return "Security";
  }

  // 3. Tools Category
  if (
    fn.endsWith(".py") ||
    fn.endsWith(".sh") ||
    fn.includes("tools") ||
    text.includes("tool")
  ) {
    return "Tools";
  }

  // 4. Default / Guides Category
  return "Guides";
}

// Render dynamic sub-filter buttons with "Recommended" listed first
function renderFilterBar() {
  const filterBar = document.getElementById("filter-bar");
  let filters = [];

  if (currentTab === "repos" || currentTab === "certs") {
    filters = [
      { id: "recommended", label: "⭐ Recommended" },
      { id: "all", label: "📁 All" },
    ];
  } else if (currentTab === "gists") {
    filters = [
      { id: "all", label: "📁 All" },
      { id: "Android", label: "📱 Android" },
      { id: "Security", label: "🛡️ Security" },
      { id: "Guides", label: "📖 Guides" },
      { id: "Tools", label: "🛠️ Tools" },
    ];
  }

  filterBar.innerHTML = filters
    .map(
      (f) => `
    <button class="pill-btn ${currentFilter === f.id ? "active" : ""}" onclick="setFilter('${f.id}')">
      ${f.label}
    </button>
  `,
    )
    .join("");
}

function setFilter(filterId) {
  currentFilter = filterId;
  renderFilterBar();
  renderContent();
}

// Main Render Dispatcher
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

// 1. Render Repositories (Recommended first)
function renderRepos(grid) {
  let filtered = [...reposData];
  const isRepoRecommended = (r) =>
    recommendedRepos.includes(r.name) ||
    r.stargazers_count > 0 ||
    r.topics?.includes("recommended") ||
    r.description?.toLowerCase().includes("recommend");

  if (currentFilter === "recommended") {
    filtered = filtered.filter(isRepoRecommended);
    if (filtered.length === 0) filtered = reposData.slice(0, 6); // Fallback top repos
  } else {
    // Sort recommended items to the top when viewing "All"
    filtered.sort((a, b) => (isRepoRecommended(b) ? 1 : 0) - (isRepoRecommended(a) ? 1 : 0));
  }

  filtered.forEach((repo) => {
    const card = document.createElement("a");
    card.href = repo.html_url;
    card.target = "_blank";
    card.className = "card";

    const previewMedia = repo.preview_image
      ? `<img src="${repo.preview_image}" alt="${repo.name}" loading="lazy">`
      : `<div class="card-preview-fallback">💻 <span>${repo.language || "Code"}</span></div>`;

    const isRecommended = isRepoRecommended(repo);
    const badgeHtml = isRecommended ? `<span class="badge badge-recommend">⭐ Recommended</span>` : "";

    card.innerHTML = `
      <div class="card-preview">${previewMedia}</div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title">${repo.name}</h3>
          ${badgeHtml}
        </div>
        <p class="card-desc">${repo.description || "No description provided."}</p>
        <div class="card-footer">
          <span>${repo.language ? "⚡ " + repo.language : "🔗 GitHub"}</span>
          <span>Updated ${new Date(repo.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// 2. Render Certificates (Recommended first)
function renderCertificates(grid) {
  let filtered = [...certsData];
  const isCertRecommended = (c) => c.recommended || c.isRecommended;

  if (currentFilter === "recommended") {
    filtered = filtered.filter(isCertRecommended);
    if (filtered.length === 0) filtered = certsData;
  } else {
    // Sort recommended certificates to the top when viewing "All"
    filtered.sort((a, b) => (isCertRecommended(b) ? 1 : 0) - (isCertRecommended(a) ? 1 : 0));
  }

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

// Render PDF Page 1 onto Canvas
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

// 3. Render GitHub Gists
function renderGists(grid) {
  let filtered = gistsData;
  if (currentFilter !== "all") {
    filtered = gistsData.filter((g) => g.category === currentFilter);
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

    const categoryClass = `badge-${gist.category.toLowerCase()}`;

    // Remove file extension (.md, .py, etc.) and replace '-' or '_' with spaces
    const titleWithoutExt =
      gist.filename.lastIndexOf(".") !== -1
        ? gist.filename.substring(0, gist.filename.lastIndexOf("."))
        : gist.filename;
    const cleanTitle = titleWithoutExt.replace(/[-_]/g, " ");

    // Only render description if it exists and isn't just the filename
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
          <span class="badge ${categoryClass}">${gist.category}</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Gist</span>
        </div>
        <h3 class="card-title" style="margin-top:8px;">${cleanTitle}</h3>
        ${descHtml}
      </div>
    `;

    grid.appendChild(card);
  });
}