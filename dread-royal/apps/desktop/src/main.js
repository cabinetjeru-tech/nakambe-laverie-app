// DREAD ROYAL — application de bureau (Windows) : base PostgreSQL embarquée + API + interface,
// tout en local, sans Internet ni serveur.
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EmbeddedPostgres } = require('./postgres');
const { ensureDatabase, migrate } = require('./migrate');

const APP_PORT = 4777;
const PG_PORT = 54329;
const DB = 'dread_royal';
const INITIAL_OWNER = { username: 'proprietaire', password: 'DreadRoyal2026' };

if (!app.requestSingleInstanceLock()) app.quit();

// Disposition : <app>/desktop/main.js, <app>/api, <app>/web ; binaires PostgreSQL dans resources/pgsql (ou build/pgsql en développement)
const root = path.resolve(__dirname, '..');
const pgBin = app.isPackaged ? path.join(process.resourcesPath, 'pgsql', 'bin') : process.env.DR_PGSQL_BIN || path.resolve(root, '..', 'pgsql', 'bin');
// Windows : données dans C:\ProgramData\DreadRoyal (chemin sans espaces ni accents, fiable pour PostgreSQL)
const userData = process.platform === 'win32' ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'DreadRoyal') : app.getPath('userData');
const backupDir = path.join(app.getPath('documents'), 'DREAD ROYAL', 'Sauvegardes');
const logPath = path.join(userData, 'dread-royal.log');
fs.mkdirSync(userData, { recursive: true });
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { fs.appendFileSync(logPath, line + '\n'); } catch {} };

// Configuration locale : secrets générés une seule fois, jamais affichés
const cfgPath = path.join(userData, 'config.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
let changed = false;
if (!cfg.pgPassword) { cfg.pgPassword = crypto.randomBytes(24).toString('hex'); changed = true; }
if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(48).toString('hex'); changed = true; }
if (cfg.lan === undefined) { cfg.lan = false; changed = true; }
const saveCfg = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
if (changed) saveCfg();

const pg = new EmbeddedPostgres({ binDir: pgBin, dataDir: path.join(userData, 'pgdata'), port: PG_PORT, user: 'dreadroyal', password: cfg.pgPassword, log });
let win = null;
let nest = null;
let firstRun = false;

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${APP_PORT}`);
}

function setStatus(text) {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`document.getElementById('msg') && (document.getElementById('msg').textContent = ${JSON.stringify(text)})`).catch(() => null);
}

function checkWindowsRuntime() {
  if (process.platform !== 'win32') return;
  const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const missing = ['vcruntime140.dll', 'msvcp140.dll'].filter((f) => !fs.existsSync(path.join(sys, f)));
  if (missing.length) {
    const e = new Error(`Composant Windows manquant (${missing.join(', ')}). Installez « Microsoft Visual C++ Redistributable 2015-2022 (x64) » depuis le site de Microsoft (https://aka.ms/vs/17/release/vc_redist.x64.exe), puis relancez DREAD ROYAL.`);
    e.vcredist = true;
    throw e;
  }
}

async function startBackend() {
  checkWindowsRuntime();
  setStatus('Démarrage de la base de données…');
  firstRun = await pg.init();
  await pg.start();
  await ensureDatabase(pg.url('postgres'), DB);
  setStatus('Mise à jour de la base…');
  await migrate(pg.url(DB), path.join(root, 'api', 'prisma', 'migrations'), log);
  Object.assign(process.env, {
    NODE_ENV: 'production',
    TZ: 'Africa/Ouagadougou',
    DATABASE_URL: `${pg.url(DB)}?schema=public`,
    JWT_SECRET: cfg.jwtSecret,
    JWT_ACCESS_TTL: '15m',
    REFRESH_TTL_DAYS: '30',
    CORS_ORIGINS: [`http://127.0.0.1:${APP_PORT}`, `http://localhost:${APP_PORT}`, ...lanAddresses()].join(','),
    BACKUP_DIR: backupDir,
    BACKUP_ENGINE: 'json',
    ALLOW_UI_RESTORE: 'true',
    BACKUP_CRON: '0 13,19 * * *', // l'ordinateur est allumé en journée : sauvegardes à 13 h et 19 h
    BACKUP_KEEP: '60',
    SWAGGER: 'off',
  });
  setStatus('Démarrage de DREAD ROYAL…');
  const { startDesktopServer } = require(path.join(root, 'api', 'dist', 'desktop.js'));
  nest = await startDesktopServer({ port: APP_PORT, host: cfg.lan ? '0.0.0.0' : '127.0.0.1', webDir: path.join(root, 'web'), owner: INITIAL_OWNER, log });
}

function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Ouvrir le dossier des sauvegardes', click: () => { fs.mkdirSync(backupDir, { recursive: true }); shell.openPath(backupDir); } },
        { type: 'separator' },
        {
          label: 'Accès depuis les téléphones (Wi-Fi du salon)', type: 'checkbox', checked: cfg.lan,
          click: async (item) => {
            cfg.lan = item.checked; saveCfg();
            await dialog.showMessageBox(win, { type: 'info', title: 'Accès réseau', message: cfg.lan ? 'Accès activé. L’application va redémarrer ; autorisez-la si Windows le demande (pare-feu, réseau privé).' : 'Accès réseau désactivé. L’application va redémarrer.' });
            app.relaunch(); app.quit();
          },
        },
        { label: 'Adresse pour les téléphones…', click: () => dialog.showMessageBox(win, { type: 'info', title: 'Adresse pour les téléphones', message: cfg.lan ? `Sur un téléphone connecté au même Wi-Fi, ouvrez dans Chrome :\n\n${lanAddresses().join('\n') || '(aucun réseau détecté)'}` : 'Activez d’abord « Accès depuis les téléphones » dans ce menu.' }) },
        { type: 'separator' },
        { label: 'Journal technique', click: () => shell.openPath(logPath) },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Actualiser' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' }, { role: 'resetZoom', label: 'Taille normale' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Aide',
      submenu: [{ label: 'À propos', click: () => dialog.showMessageBox(win, { type: 'info', title: 'DREAD ROYAL', message: `DREAD ROYAL Management System ${app.getVersion()}`, detail: 'Votre couronne, votre identité.\n\nDonnées enregistrées sur cet ordinateur.\nSauvegardes : ' + backupDir }) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1000, minHeight: 640, show: false, backgroundColor: '#0B0B0B', title: 'DREAD ROYAL',
    icon: path.join(__dirname, 'logo.jpg'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Liens externes (WhatsApp…) dans le navigateur ; documents PDF dans une fenêtre de l'application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${APP_PORT}`)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 800 } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadFile(path.join(__dirname, 'loading.html'));
  try {
    await startBackend();
    await win.loadURL(`http://127.0.0.1:${APP_PORT}/login/`);
    if (firstRun) {
      dialog.showMessageBox(win, {
        type: 'info', title: 'Bienvenue dans DREAD ROYAL',
        message: 'Première connexion',
        detail: `Identifiant : ${INITIAL_OWNER.username}\nMot de passe provisoire : ${INITIAL_OWNER.password}\n\nVous devrez choisir votre propre mot de passe juste après.\n\nVos données sont enregistrées sur cet ordinateur. Des sauvegardes sont faites automatiquement dans :\n${backupDir}\nCopiez-les régulièrement sur une clé USB.`,
      });
    }
  } catch (e) {
    log(`ERREUR AU DÉMARRAGE : ${e.stack || e.message}`);
    dialog.showErrorBox('DREAD ROYAL ne peut pas démarrer', `${e.message}\n\nJournal : ${logPath}`);
    if (e.vcredist) shell.openExternal('https://aka.ms/vs/17/release/vc_redist.x64.exe');
    app.quit();
  }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on('window-all-closed', () => app.quit());
let stopping = false;
app.on('before-quit', async (e) => {
  if (stopping) return;
  stopping = true;
  e.preventDefault();
  try { if (nest) await nest.close(); } catch {}
  try { pg.stopSync(); log('PostgreSQL arrêté'); } catch {}
  app.exit(0);
});
