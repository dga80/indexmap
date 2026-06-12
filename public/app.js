// Application State
let allItems = [];
let filteredItems = [];
let scanStatus = {
  isScanning: false,
  lastScanTime: null,
  itemCount: 0,
  errors: []
};

// Search and Filter State
let searchQuery = '';
let filterOrigin = 'all';
let filterType = 'all';
let pollingInterval = null;

// DOM Elements
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const originFilterGroup = document.getElementById('origin-filter');
const typeFilterGroup = document.getElementById('type-filter');
const resultsContainer = document.getElementById('results-container');
const resultsCount = document.getElementById('results-count');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const itemCountText = document.getElementById('item-count');
const lastScanText = document.getElementById('last-scan');
const btnReindex = document.getElementById('btn-reindex');
const toastContainer = document.getElementById('toast-container');
const errorPanel = document.getElementById('error-panel');
const errorList = document.getElementById('error-list');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
  }

  initEventListeners();
  fetchStatus().then(() => {
    fetchItems();
  });
});

// Event Listeners Setup
function initEventListeners() {
  // Theme Toggle Button
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light-theme');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      showToast(isLight ? 'Modo claro activado' : 'Modo oscuro activado', 'info');
    });
  }

  // Search Input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    applyFiltersAndRender();
  });

  // Clear Search Button
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    applyFiltersAndRender();
  });

  // Origin Filters
  originFilterGroup.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    originFilterGroup.querySelectorAll('.pill').forEach(btn => btn.classList.remove('active'));
    pill.classList.add('active');
    filterOrigin = pill.dataset.value;
    applyFiltersAndRender();
  });

  // Type Filters
  typeFilterGroup.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    
    typeFilterGroup.querySelectorAll('.pill').forEach(btn => btn.classList.remove('active'));
    pill.classList.add('active');
    filterType = pill.dataset.value;
    applyFiltersAndRender();
  });

  // Reindex Button
  btnReindex.addEventListener('click', triggerReindexing);
}

// Fetch Server Status
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Error de red al consultar el estado.');
    
    scanStatus = await res.json();
    updateStatusUI();
    
    // Manage polling if scanning is active
    if (scanStatus.isScanning) {
      startStatusPolling();
    } else {
      stopStatusPolling();
    }
  } catch (err) {
    console.error('Error fetching status:', err);
    showToast(err.message || 'No se pudo conectar con el servidor local.', 'error');
  }
}

// Fetch All Indexed Items
async function fetchItems() {
  try {
    const res = await fetch('/api/items');
    if (!res.ok) throw new Error('Error al cargar la lista de proyectos.');
    
    allItems = await res.json();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Error fetching items:', err);
    showToast('Error al descargar el índice del servidor.', 'error');
  }
}

// Trigger Reindex on Server
async function triggerReindexing() {
  if (scanStatus.isScanning) return;
  
  btnReindex.disabled = true;
  showToast('Iniciando indexación de rutas de red...', 'info');
  
  try {
    const res = await fetch('/api/index', { method: 'POST' });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la indexación.');
    
    showToast('Indexación en curso en segundo plano.', 'success');
    fetchStatus(); // Immediately update UI to scanning state
  } catch (err) {
    btnReindex.disabled = false;
    showToast(err.message, 'error');
  }
}

// Poll status when scanning
function startStatusPolling() {
  if (pollingInterval) return;
  
  console.log('[Polling] Starting status polling...');
  pollingInterval = setInterval(async () => {
    await fetchStatus();
    if (!scanStatus.isScanning) {
      stopStatusPolling();
      // Reload items when indexing completes
      showToast('¡Indexación finalizada con éxito!', 'success');
      await fetchItems();
    }
  }, 2000);
}

function stopStatusPolling() {
  if (pollingInterval) {
    console.log('[Polling] Stopping status polling...');
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Update Status Panel UI
function updateStatusUI() {
  // Dot styling
  statusDot.className = 'indicator-dot';
  if (scanStatus.isScanning) {
    statusDot.classList.add('scanning');
    statusText.textContent = 'Indexando rutas...';
    btnReindex.disabled = true;
    btnReindex.innerHTML = `
      <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
      Indexando...
    `;
  } else {
    statusDot.classList.add('online');
    statusText.textContent = 'En línea';
    btnReindex.disabled = false;
    btnReindex.innerHTML = `
      <svg class="icon btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
      Indexar Rutas
    `;
  }

  // Count and Last Scan
  itemCountText.textContent = scanStatus.itemCount.toLocaleString();
  if (scanStatus.lastScanTime) {
    const date = new Date(scanStatus.lastScanTime);
    lastScanText.textContent = date.toLocaleTimeString() + ' - ' + date.toLocaleDateString();
  } else {
    lastScanText.textContent = 'Nunca';
  }

  // Display errors if any
  if (scanStatus.errors && scanStatus.errors.length > 0) {
    errorList.innerHTML = '';
    scanStatus.errors.forEach(err => {
      const li = document.createElement('li');
      li.textContent = err;
      errorList.appendChild(li);
    });
    errorPanel.style.display = 'block';
  } else {
    errorPanel.style.display = 'none';
  }
}

// Apply Filters & Search query, then render
function applyFiltersAndRender() {
  let temp = allItems;

  // 1. Origin Filter
  if (filterOrigin !== 'all') {
    temp = temp.filter(item => item.source === filterOrigin);
  }

  // 2. Type Filter
  if (filterType !== 'all') {
    temp = temp.filter(item => item.type === filterType);
  }

  // 3. Search Query (Multi-term matching)
  if (searchQuery.trim()) {
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(t => t);
    temp = temp.filter(item => {
      const itemName = item.name.toLowerCase();
      // Must contain ALL terms (AND condition)
      return terms.every(term => itemName.includes(term));
    });
  }

  filteredItems = temp;
  renderResults();
}

// Render filteredItems to DOM
function renderResults() {
  resultsContainer.innerHTML = '';
  
  const isSearching = searchQuery.trim().length > 0 || filterOrigin !== 'all' || filterType !== 'all';

  if (!isSearching) {
    resultsCount.style.display = 'none';
    renderWelcomeState();
    return;
  }

  resultsCount.style.display = 'block';
  const total = filteredItems.length;
  
  // If no items match the active search
  if (total === 0) {
    resultsCount.textContent = `Mostrando 0 resultados`;
    renderEmptyState(true);
    return;
  }

  // Render up to 500 items to avoid DOM lag, which is extremely plenty for a filtered list
  const itemsToRender = filteredItems.slice(0, 500);
  
  if (filteredItems.length > 500) {
    resultsCount.textContent = `Mostrando primeros 500 resultados de ${total} en total (por favor escribe para filtrar más)`;
  } else {
    resultsCount.textContent = `Mostrando ${total} resultado${total === 1 ? '' : 's'}`;
  }

  const fragment = document.createDocumentFragment();

  itemsToRender.forEach(item => {
    const card = document.createElement('div');
    card.className = `result-card source-${item.source}`;
    
    // Type icon path SVG
    const iconSvg = item.type === 'folder' 
      ? `<svg class="type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
      : `<svg class="type-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

    // Match Highlight Logic
    let nameHtml = escapeHTML(item.name);
    if (searchQuery.trim()) {
      const terms = searchQuery.split(/\s+/).filter(t => t);
      nameHtml = highlightText(item.name, terms);
    }

    card.innerHTML = `
      <div class="result-left">
        <div class="type-icon-wrapper" title="${item.type === 'folder' ? 'Carpeta' : 'Archivo'}">
          ${iconSvg}
        </div>
        <div class="result-info">
          <div class="result-title-row">
            <span class="result-name">${nameHtml}</span>
            <span class="source-tag tag-${item.source}">${item.source}</span>
          </div>
          <div class="result-path-container" title="Haz clic para copiar la ruta">
            <span class="result-path">${escapeHTML(item.path)}</span>
            <button class="copy-mini-btn" aria-label="Copiar ruta">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="result-right">
        <button class="action-btn btn-open">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          Abrir
        </button>
      </div>
    `;

    // Hook up Events within the card
    // Copy path when clicking path container
    const pathContainer = card.querySelector('.result-path-container');
    pathContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.path);
    });

    // Open in explorer when clicking open button
    const openBtn = card.querySelector('.btn-open');
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPath(item.path);
    });

    // Also clicking the card body will open the path in explorer
    card.addEventListener('click', () => {
      openPath(item.path);
    });

    fragment.appendChild(card);
  });

  resultsContainer.appendChild(fragment);
}

// Render Welcome State (Google search style)
function renderWelcomeState() {
  const formattedCount = allItems.length.toLocaleString();
  resultsContainer.innerHTML = `
    <div class="welcome-state">
      <div class="welcome-icon-wrapper">
        <svg class="welcome-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <path d="M11 8a3 3 0 0 0-3 3"></path>
        </svg>
      </div>
      <h2>IndexMap</h2>
      <p class="welcome-lead">Busca de forma instantánea entre <strong>${formattedCount}</strong> proyectos, pedidos y carpetas en red.</p>
      <p class="welcome-hint">Comienza a escribir en la barra de búsqueda o selecciona un origen/tipo para filtrar y encontrar carpetas de inmediato.</p>
    </div>
  `;
}

// Render Empty/No Results state
function renderEmptyState(isSearching) {
  if (isSearching) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
        <h3>No se encontraron coincidencias</h3>
        <p>Prueba con otros términos de búsqueda o revisa que los filtros seleccionados sean correctos.</p>
      </div>
    `;
  } else {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
        <h3>El índice está vacío</h3>
        <p>Haz clic en el botón <strong>"Indexar Rutas"</strong> en la parte superior derecha para escanear las rutas de red configuradas y cargar los proyectos.</p>
      </div>
    `;
  }
}

// Highlight matching words helper
function highlightText(text, terms) {
  if (!terms || terms.length === 0) return escapeHTML(text);

  // Escaping terms for regex
  const escapedTerms = terms.map(term => term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  
  // Sort terms by length in descending order to avoid highlighting subsets of terms first
  escapedTerms.sort((a, b) => b.length - a.length);

  // Build a regex that matches any of the terms
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  
  return escapeHTML(text).replace(regex, '<span class="match-highlight">$1</span>');
}

// Copy String to Clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Ruta copiada al portapapeles', 'success');
  }).catch(err => {
    console.error('Error copying text:', err);
    // Fallback if clipboard API is blocked
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; // Avoid scrolling to bottom
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Ruta copiada al portapapeles (método alternativo)', 'success');
    } catch (e) {
      showToast('No se pudo copiar la ruta automáticamente.', 'error');
    }
    document.body.removeChild(textarea);
  });
}

// Send POST to open path in Windows Explorer
async function openPath(filePath) {
  showToast(`Abriendo en Explorador de Windows...`, 'info');
  try {
    const res = await fetch('/api/open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filePath })
    });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Error al abrir la carpeta.');
    }
  } catch (err) {
    console.error('Error opening folder:', err);
    showToast(err.message, 'error');
  }
}

// Helper to escape HTML tags to avoid XSS
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications System
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' 
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="color:var(--success)"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : type === 'error'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="color:var(--danger)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon" style="color:var(--primary)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `
    ${icon}
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto remove after 3.5 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3500);
}
