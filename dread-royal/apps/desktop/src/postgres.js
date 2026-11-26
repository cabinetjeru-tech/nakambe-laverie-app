// Base PostgreSQL embarquée : binaires livrés avec l'application, données dans le profil utilisateur.
// Écoute uniquement sur 127.0.0.1 (jamais exposée sur le réseau).
const { execFile, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const exe = (bin, name) => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);

function run(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) { err.message += `\n${stdout}\n${stderr}`; reject(err); } else resolve({ stdout, stderr });
    });
  });
}

class EmbeddedPostgres {
  constructor({ binDir, dataDir, port, user, password, log }) {
    Object.assign(this, { binDir, dataDir, port, user, password });
    this.log = log || console.log;
    this.logFile = path.join(path.dirname(dataDir), 'postgres.log');
    // Bibliothèques partagées livrées à côté des binaires (Linux/macOS)
    const lib = path.join(binDir, '..', 'lib');
    this.env = { ...process.env, LD_LIBRARY_PATH: lib, DYLD_LIBRARY_PATH: lib, PGPASSWORD: password };
  }

  get initialized() { return fs.existsSync(path.join(this.dataDir, 'PG_VERSION')); }

  async init() {
    if (this.initialized) return false;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const pwFile = path.join(path.dirname(this.dataDir), 'pw.tmp');
    fs.writeFileSync(pwFile, this.password, { mode: 0o600 });
    try {
      this.log('Initialisation de la base de données (première utilisation)…');
      await run(exe(this.binDir, 'initdb'), ['-D', this.dataDir, '-U', this.user, '--pwfile', pwFile, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C'], { env: this.env });
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    return true;
  }

  status() {
    const r = spawnSync(exe(this.binDir, 'pg_ctl'), ['-D', this.dataDir, 'status'], { env: this.env, windowsHide: true });
    return r.status === 0;
  }

  async start() {
    if (this.status()) { this.log('PostgreSQL déjà démarré'); return; }
    // Fichier verrou orphelin après une coupure de courant
    const pid = path.join(this.dataDir, 'postmaster.pid');
    if (fs.existsSync(pid)) fs.rmSync(pid, { force: true });
    await run(exe(this.binDir, 'pg_ctl'), ['-D', this.dataDir, '-l', this.logFile, '-w', '-t', '60', '-o', `-p ${this.port} -c listen_addresses=127.0.0.1`, 'start'], { env: this.env });
    this.log(`PostgreSQL démarré (port ${this.port})`);
  }

  stopSync() {
    spawnSync(exe(this.binDir, 'pg_ctl'), ['-D', this.dataDir, '-m', 'fast', '-w', 'stop'], { env: this.env, windowsHide: true, timeout: 30000 });
  }

  url(db) {
    return `postgresql://${this.user}:${encodeURIComponent(this.password)}@127.0.0.1:${this.port}/${db}`;
  }
}

module.exports = { EmbeddedPostgres };
