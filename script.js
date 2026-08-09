// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('preview-grid');

  fetch('data.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load JSON');
      return response.json();
    })
    .then(data => {
      grid.innerHTML = ''; 

      data.forEach((item, index) => {
        const filePath = `assets/certs/${item.filename}`;
        const title = item.filename.substring(0, item.filename.lastIndexOf('.')) || item.filename;
        const extension = item.filename.split('.').pop().toLowerCase();

        const card = document.createElement('a');
        card.href = filePath;
        card.target = '_blank';
        card.className = 'card';

        let previewMedia = '';
        const canvasId = `pdf-canvas-${index}`;
        
        if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
          previewMedia = `<img src="${filePath}" alt="${title}">`;
        } else if (extension === 'pdf') {
          // Render PDF onto Canvas (No dark browser margins!)
          previewMedia = `<canvas id="${canvasId}" class="pdf-canvas"></canvas>`;
        } else {
          previewMedia = `<div class="file-icon">📁 ${extension.toUpperCase()}</div>`;
        }

        card.innerHTML = `
          <div class="card-preview">
            ${previewMedia}
          </div>
          <div class="card-body">
            <h3 class="card-title">${title}</h3>
            <p class="card-desc">${item.description}</p>
          </div>
        `;

        grid.appendChild(card);

        // Render PDF page 1 to Canvas
        if (extension === 'pdf') {
          renderPdfToCanvas(filePath, canvasId);
        }
      });
    })
    .catch(error => {
      console.error('Error:', error);
      grid.innerHTML = `<p style="color:red;">Unable to load data. Make sure you are using Live Server.</p>`;
    });
});

// Converts PDF Page 1 to an Image Canvas
function renderPdfToCanvas(url, canvasId) {
  pdfjsLib.getDocument(url).promise.then(pdf => {
    pdf.getPage(1).then(page => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      
      // High-resolution scale for sharp image quality
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      page.render({
        canvasContext: ctx,
        viewport: viewport
      });
    });
  }).catch(err => console.error('PDF preview error:', err));
}