// ===================== TÉLÉCHARGEMENT DE YT-DLP =====================
// Télécharge le binaire autonome "yt-dlp" (déjà compilé avec Python
// embarqué à l'intérieur) depuis les releases GitHub officielles.
// Contrairement au paquet npm "yt-dlp-exec", ce script ne vérifie jamais
// la présence d'un Python installé sur le système : il fonctionne donc
// sur les hébergements restreints sans root (Pterodactyl, Optilink,
// bot-hosting.net, etc.) où `apt install` est impossible.
//
// Ce script est lancé automatiquement après "npm install" (voir le champ
// "postinstall" dans package.json). Si le téléchargement échoue (pas
// d'accès internet, GitHub bloqué...), il n'interrompt PAS l'installation
// du reste du bot : seules les commandes .yt/.tiktok/.fb/.play seront
// indisponibles jusqu'à ce que tu relances "npm install".
// =======================================================================

const https = require("https");
const fs = require("fs");
const path = require("path");

const BIN_DIR = path.join(__dirname, "..", "bin");
const BIN_PATH = path.join(BIN_DIR, "yt-dlp");
// IMPORTANT : l'asset GitHub nommé exactement "yt-dlp" n'est PAS un binaire
// autonome — c'est un script Python qui nécessite un interpréteur Python
// >=3.10 déjà installé sur le système (souvent absent, ou en version trop
// ancienne, sur les hébergements type Katabump/Pterodactyl). Le VRAI binaire
// autonome pour Linux (Python embarqué à l'intérieur, aucune dépendance
// système) s'appelle "yt-dlp_linux". C'est celui qu'il faut utiliser.
// Sur une machine ARM (ex : Oracle Cloud Ampere A1, Raspberry Pi), le binaire
// x86 "yt-dlp_linux" ne se lancerait pas : on prend la version ARM64.
const ASSET_NAME = process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
const DOWNLOAD_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET_NAME}`;

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error("Trop de redirections"));
          return resolve(download(res.headers.location, dest, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function ensureYtDlp() {
  if (fs.existsSync(BIN_PATH)) return true;

  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log("⏳ Téléchargement de yt-dlp (binaire autonome, sans Python requis)...");

  try {
    const tmpPath = `${BIN_PATH}.tmp`;
    await download(DOWNLOAD_URL, tmpPath);
    fs.renameSync(tmpPath, BIN_PATH);
    fs.chmodSync(BIN_PATH, 0o755);
    console.log("✅ yt-dlp installé avec succès dans bin/yt-dlp");
    return true;
  } catch (err) {
    console.warn(`⚠️  Impossible de télécharger yt-dlp automatiquement : ${err.message}`);
    console.warn("   Les commandes .yt, .tiktok, .fb et .play seront indisponibles.");
    return false;
  }
}

async function main() {
  await ensureYtDlp();
}

module.exports = { ensureYtDlp };

// Exécuté seulement si le script est lancé directement (ex: via
// "postinstall"), pas quand il est importé ailleurs (ex: depuis index.js).
if (require.main === module) {
  main();
}
