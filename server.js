const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Paths to scan
const SCAN_PATHS = [
  {
    name: 'AyC (Pedidos AyC 2026)',
    path: '\\\\172.30.0.10\\Compras\\02-AyC\\1-Pedidos AyC 2026',
    key: 'AyC'
  },
  {
    name: 'LOESS (Pedidos LOESS 2026)',
    path: '\\\\172.30.0.10\\Compras\\03-LOESS\\Pedidos LOESS 2026',
    key: 'LOESS'
  },
  {
    name: 'CESA (Pedidos CESA 2026)',
    path: '\\\\172.30.0.10\\Compras\\04-CESA\\1-Pedidos CESA 2026',
    key: 'CESA'
  }
];

const CACHE_FILE = path.join(__dirname, 'index.json');

// Memory cache for the index
let projectIndex = [];
let scanStatus = {
  isScanning: false,
  lastScanTime: null,
  itemCount: 0,
  errors: []
};

// Load cache on startup if exists
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      projectIndex = parsed.items || [];
      scanStatus.lastScanTime = parsed.lastScanTime || null;
      scanStatus.itemCount = projectIndex.length;
      scanStatus.errors = parsed.errors || [];
      console.log(`[Cache] Loaded ${projectIndex.length} items from cache.`);
    } else {
      console.log('[Cache] No local index.json cache found.');
    }
  } catch (err) {
    console.error('[Cache] Error loading index.json:', err);
    scanStatus.errors.push(`Error al cargar caché: ${err.message}`);
  }
}

// Recursive directory scanning function
async function scanDirectory(dirPath, key, currentDepth = 0, maxDepth = 5) {
  let results = [];
  if (currentDepth > maxDepth) return results;

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const isDirectory = entry.isDirectory();
      
      // Add the current item
      results.push({
        name: entry.name,
        path: fullPath,
        type: isDirectory ? 'folder' : 'file',
        source: key,
        depth: currentDepth
      });

      // Recurse if directory
      if (isDirectory) {
        try {
          const subResults = await scanDirectory(fullPath, key, currentDepth + 1, maxDepth);
          results = results.concat(subResults);
        } catch (subErr) {
          // Keep scanning other directories even if one fails (e.g. permission issues)
          console.warn(`[Scanner] Warning reading subdirectory ${fullPath}:`, subErr.message);
        }
      }
    }
  } catch (err) {
    console.error(`[Scanner] Error reading directory ${dirPath}:`, err.message);
    scanStatus.errors.push(`Error en ruta ${dirPath}: ${err.message}`);
  }
  
  return results;
}

// Background indexation runner
async function runIndexing() {
  if (scanStatus.isScanning) return;
  
  console.log('[Scanner] Indexing process started...');
  scanStatus.isScanning = true;
  scanStatus.errors = [];
  
  let allItems = [];
  
  for (const target of SCAN_PATHS) {
    console.log(`[Scanner] Scanning path: ${target.path}`);
    try {
      if (fs.existsSync(target.path)) {
        const items = await scanDirectory(target.path, target.key, 0, 5);
        allItems = allItems.concat(items);
        console.log(`[Scanner] Scanned ${items.length} items from ${target.name}`);
      } else {
        const errMsg = `Ruta no accesible o inexistente: ${target.path}`;
        console.error(`[Scanner] ${errMsg}`);
        scanStatus.errors.push(errMsg);
      }
    } catch (err) {
      const errMsg = `Error al escanear ${target.name}: ${err.message}`;
      console.error(`[Scanner] ${errMsg}`);
      scanStatus.errors.push(errMsg);
    }
  }
  
  projectIndex = allItems;
  scanStatus.itemCount = allItems.length;
  scanStatus.lastScanTime = new Date().toISOString();
  scanStatus.isScanning = false;
  
  // Save cache to disk
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      lastScanTime: scanStatus.lastScanTime,
      items: projectIndex,
      errors: scanStatus.errors
    }, null, 2), 'utf8');
    console.log(`[Scanner] Indexing complete. Saved ${projectIndex.length} items to index.json`);
  } catch (err) {
    console.error('[Scanner] Failed to write index.json:', err);
    scanStatus.errors.push(`Error guardando caché: ${err.message}`);
  }
}

// Load cache on startup
loadCache();

// API Endpoints
app.get('/api/status', (req, res) => {
  res.json(scanStatus);
});

app.post('/api/index', (req, res) => {
  if (scanStatus.isScanning) {
    return res.status(400).json({ error: 'Ya hay un proceso de indexación activo.' });
  }
  // Run asynchronously
  runIndexing().catch(err => {
    console.error('[Scanner] Async indexing error:', err);
  });
  res.json({ message: 'Indexación iniciada en segundo plano.' });
});

// Search API (fuzzy or substring matching)
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  const sourceFilter = req.query.source || 'all'; // AyC, LOESS, CESA, or all
  const typeFilter = req.query.type || 'all'; // folder, file, or all
  
  let results = projectIndex;
  
  if (sourceFilter !== 'all') {
    results = results.filter(item => item.source === sourceFilter);
  }
  
  if (typeFilter !== 'all') {
    results = results.filter(item => item.type === typeFilter);
  }
  
  if (query) {
    const terms = query.split(/\s+/).filter(t => t);
    results = results.filter(item => {
      const itemName = item.name.toLowerCase();
      // Match all search terms (AND search)
      return terms.every(term => itemName.includes(term));
    });
  }
  
  // Limit to 500 results for backend search performance
  res.json(results.slice(0, 500));
});

// Get all items (useful for client-side search if client wants to load all)
app.get('/api/items', (req, res) => {
  res.json(projectIndex);
});

// Endpoint to open a folder or file in Windows Explorer
app.post('/api/open', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'Falta la ruta del archivo/carpeta.' });
  }

  // Security check: only allow opening paths under our UNC roots or in the network share
  const isAllowed = SCAN_PATHS.some(target => {
    // Check if the path starts with the network base path
    return filePath.startsWith(target.path) || filePath.toLowerCase().startsWith(target.path.toLowerCase());
  });

  if (!isAllowed) {
    return res.status(403).json({ error: 'Acceso no permitido a esta ruta.' });
  }

  // Check if file exists to prevent explorer.exe error dialogs
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `La ruta no existe o no es accesible: ${filePath}` });
  }

  console.log(`[Explorer] Opening: ${filePath}`);
  
  // Launch Windows Explorer pointing to the path
  // If it's a file, we want to open its parent folder or highlight it.
  // Passing the path directly to explorer.exe will open it.
  // Using /select,fullPath highlights the file in the parent folder, which is extremely nice!
  const isDir = fs.statSync(filePath).isDirectory();
  let args = [];
  if (isDir) {
    args = [filePath];
  } else {
    args = ['/select,', filePath];
  }

  // Run explorer.exe
  const child = spawn('explorer.exe', args, {
    detached: true,
    stdio: 'ignore'
  });
  
  child.unref();

  res.json({ success: true, message: `Abriendo ${filePath} en el Explorador.` });
});

// Start the server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`Buscador de Proyectos ejecutándose en:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`===============================================`);
});

// Auto-indexing interval: 12 hours (12 * 60 * 60 * 1000 ms)
const AUTO_INDEX_INTERVAL = 12 * 60 * 60 * 1000;

// 1. Run periodic indexing in the background
setInterval(() => {
  console.log('[Scheduler] Iniciando indexación automática periódica...');
  runIndexing().catch(err => {
    console.error('[Scheduler] Error en indexación automática periódica:', err.message);
  });
}, AUTO_INDEX_INTERVAL);

// 2. Run indexing on startup if cache is older than 12 hours or does not exist
const lastScanTime = scanStatus.lastScanTime ? new Date(scanStatus.lastScanTime).getTime() : 0;
const now = Date.now();
if (now - lastScanTime > AUTO_INDEX_INTERVAL) {
  console.log('[Scheduler] La caché tiene más de 12 horas o no existe. Indexando rutas al iniciar...');
  // Run asynchronously after a short delay to not block server startup
  setTimeout(() => {
    runIndexing().catch(err => {
      console.error('[Scheduler] Error en indexación de inicio:', err.message);
    });
  }, 5000);
}

