const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 1. Generate a valid, transparent 32x32 pixel ICO binary file
function createTransparentIco(destPath) {
  const header = Buffer.from([
    0x00, 0x00,          // Reserved
    0x01, 0x00,          // Type (1 = ICO)
    0x01, 0x00           // Image count (1)
  ]);

  const directory = Buffer.from([
    32,                  // Width (32px)
    32,                  // Height (32px)
    0,                   // Color count (0 = >256 colors)
    0,                   // Reserved
    0x01, 0x00,          // Color planes (1)
    0x20, 0x00,          // Bits per pixel (32-bit ARGB)
    0xa8, 0x10, 0x00, 0x00, // Image size (4264 bytes)
    0x16, 0x00, 0x00, 0x00  // Image offset (22)
  ]);

  const bmpHeader = Buffer.from([
    40, 0x00, 0x00, 0x00,  // Header size (40 bytes)
    32, 0x00, 0x00, 0x00,  // Width (32px)
    64, 0x00, 0x00, 0x00,  // Height (64px, doubled for ICO BMP mask height)
    0x01, 0x00,            // Planes (1)
    32, 0x00,              // Bits per pixel (32-bit)
    0x00, 0x00, 0x00, 0x00, // Compression (0 = BI_RGB)
    0x00, 0x10, 0x00, 0x00, // XOR Image size (4096 bytes)
    0x00, 0x00, 0x00, 0x00, // X pixels per meter (0)
    0x00, 0x00, 0x00, 0x00, // Y pixels per meter (0)
    0x00, 0x00, 0x00, 0x00, // Colors in color table (0)
    0x00, 0x00, 0x00, 0x00  // Important colors (0)
  ]);

  const xorMask = Buffer.alloc(4096, 0);   // XOR pixel mask (fully transparent: Alpha=0, R=0, G=0, B=0)
  const andMask = Buffer.alloc(128, 0xff);  // AND transparency mask (fully transparent: all bits 1)

  const icoBuffer = Buffer.concat([header, directory, bmpHeader, xorMask, andMask]);
  
  // Create public directory if not exists
  const publicDir = path.dirname(destPath);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(destPath, icoBuffer);
  console.log(`[ICO] Icono transparente creado en: ${destPath}`);
}

// 2. Generate start_server.vbs to run node server.js in background silently
function createStartVbs(vbsPath, projectDir) {
  // Use single backslashes in VBScript string literal (no double-escaping needed)
  const cleanPath = projectDir.replace(/\\/g, '\\');
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${cleanPath}"
WshShell.Run "cmd /c node server.js", 0, False
WScript.Sleep 1000
WshShell.Run "cmd /c start http://localhost:3080", 0, False
`;
  fs.writeFileSync(vbsPath, vbsContent, 'utf8');
  console.log(`[VBScript] Creado archivo de inicio silencioso en: ${vbsPath}`);
}

// 3. Create the Desktop Shortcut via PowerShell COM Object
function createDesktopShortcut(vbsPath, iconPath) {
  const desktopPath = path.join(process.env.USERPROFILE, 'Desktop');
  const shortcutPath = path.join(desktopPath, 'IndexMap.lnk');
  
  // Using double single-quotes to escape single quotes in PowerShell if user profile path contains them
  const escapedShortcutPath = shortcutPath.replace(/'/g, "''");
  const escapedVbsPath = vbsPath.replace(/'/g, "''").replace(/\\/g, '\\\\');
  
  const psCommand = `
$Shell = New-Object -ComObject WScript.Shell;
$Shortcut = $Shell.CreateShortcut('${escapedShortcutPath}');
$Shortcut.TargetPath = 'C:\\\\Windows\\\\System32\\\\wscript.exe';
$Shortcut.Arguments = '"${escapedVbsPath}"';
$Shortcut.IconLocation = 'C:\\\\Windows\\\\System32\\\\shell32.dll,22';
$Shortcut.Description = 'Buscador de Proyectos IndexMap';
$Shortcut.Save();
`;

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/\n/g, ' ')}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('[Error] No se pudo crear el acceso directo:', err);
      console.error(stderr);
    } else {
      console.log(`[Acceso Directo] Creado correctamente en el Escritorio: ${shortcutPath}`);
    }
  });
}

// Run script
const iconPath = path.join(__dirname, 'public', 'transparent.ico');
const vbsPath = path.join(__dirname, 'start_server.vbs');
createTransparentIco(iconPath);
createStartVbs(vbsPath, __dirname);
createDesktopShortcut(vbsPath, iconPath);
