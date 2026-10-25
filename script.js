pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

const GITHUB_USERNAME = "neew1152";

let currentTab = "repos";

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
      renderContent();
    });
  });
}

async function loadData() {
  const grid = document.getElementById("grid-container");
  grid.innerHTML = `<div class="loading-state">Loading portal data...</div>`;

  try {
    const [reposResponse, certsResponse, gistsResponse] = await Promise.allSettled([
      fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`),
      fetch("data.json"),
      fetch(`https://api.github.com/users/${GITHUB_USERNAME}/gists?per_page=100`),
    ]);

    if (reposResponse.status === "fulfilled" && reposResponse.value.ok) {
      const rawRepos = await reposResponse.value.json();
      reposData = rawRepos.filter((repo) => !repo.fork);
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
        };
      });
    }

    renderContent();

    loadRepoReadmeImagesInBackground();
    loadCertPreviewsInBackground();

  } catch (err) {
    console.error("Error loading portal data:", err);
    grid.innerHTML = `<div class="loading-state" style="color:red;">Error loading portal data. Make sure you are using a web server.</div>`;
  }
}

function loadRepoReadmeImagesInBackground() {
  reposData.forEach(async (repo) => {
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
          updateCardPreviewDOM(`repo-${repo.id}`, imageUrl, repo.name);
        }
      }
    } catch (e) {
    }
  });
}

function loadCertPreviewsInBackground() {
  certsData.forEach(async (item) => {
    const filePath = `assets/certs/${item.filename}`;
    const extension = item.filename.split(".").pop().toLowerCase();
    const safeId = `cert-${sanitizeId(item.filename)}`;

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
      item.preview_image = filePath;
      updateCardPreviewDOM(safeId, filePath, item.filename);
    } else if (extension === "pdf" && !item.preview_image) {
      try {
        const pdfDataUrl = await renderPdfToDataUrl(filePath);
        item.preview_image = pdfDataUrl;
        updateCardPreviewDOM(safeId, pdfDataUrl, item.filename);
      } catch (e) {
        console.error(`Error rendering background PDF preview for ${item.filename}:`, e);
      }
    }
  });
}

function sanitizeId(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function updateCardPreviewDOM(cardDataId, src, altText) {
  const card = document.querySelector(`[data-card-id="${cardDataId}"]`);
  if (!card) return;

  const previewContainer = card.querySelector(".card-preview");
  if (previewContainer) {
    previewContainer.innerHTML = `<img src="${src}" alt="${altText}" loading="lazy">`;
  }
}

function renderPdfToDataUrl(url) {
  return pdfjsLib
    .getDocument(url)
    .promise.then((pdf) => pdf.getPage(1))
    .then((page) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
        return canvas.toDataURL("image/png");
      });
    });
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
    recommendedRepos.some(
      (name) => name.trim().toLowerCase() === r.name.trim().toLowerCase()
    );

  filtered.sort((a, b) => (isRepoRecommended(b) ? 1 : 0) - (isRepoRecommended(a) ? 1 : 0));

  filtered.forEach((repo) => {
    const card = document.createElement("a");
    card.href = repo.html_url;
    card.target = "_blank";
    card.className = "card";
    card.setAttribute("data-card-id", `repo-${repo.id}`);

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

  filtered.forEach((item) => {
    const filePath = `assets/certs/${item.filename}`;
    const rawTitle =
      item.filename.substring(0, item.filename.lastIndexOf(".")) ||
      item.filename;
    const title = rawTitle.replace(/[-_]/g, " ");
    const extension = item.filename.split(".").pop().toLowerCase();
    const safeId = `cert-${sanitizeId(item.filename)}`;

    const card = document.createElement("a");
    card.href = filePath;
    card.target = "_blank";
    card.className = "card";
    card.setAttribute("data-card-id", safeId);

    let previewMedia = "";

    if (item.preview_image) {
      previewMedia = `<img src="${item.preview_image}" alt="${title}" loading="lazy">`;
    } else {
      previewMedia = `<div class="card-preview-fallback">📄 <span>${extension.toUpperCase()}</span></div>`;
    }

    const isRecommended = isCertRecommended(item);
    const badgeHtml = isRecommended ? `<span class="badge badge-recommend">⭐ Recommended</span>` : "";

    card.innerHTML = `
      <div class="card-preview">${previewMedia}</div>
      <div class="card-body">
        <div class="card-header-row">
          <h3 class="card-title">${title}</h3>
          ${badgeHtml}
        </div>
        <p class="card-desc">${item.description || ""}</p>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderGists(grid) {
  if (gistsData.length === 0) {
    grid.innerHTML = `<div class="loading-state">No Gists found.</div>`;
    return;
  }

  gistsData.forEach((gist) => {
    const card = document.createElement("a");
    card.href = gist.html_url;
    card.target = "_blank";
    card.className = "card";
    card.setAttribute("data-card-id", `gist-${gist.id}`);

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
        <h3 class="card-title">${cleanTitle}</h3>
        ${descHtml}
      </div>
    `;

    grid.appendChild(card);
  });
}