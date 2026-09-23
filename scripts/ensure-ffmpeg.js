// ===================== VÉRIFICATION / TÉLÉCHARGEMENT DE FFMPEG =====================
// Le paquet "ffmpeg-static" télécharge son binaire via son propre script
// d'installation. Les versions récentes de npm BLOQUENT par défaut les scripts
// d'installation des dépendances ("install scripts not yet covered by
// allowScripts"), donc le binaire peut manquer après "npm install" et les
// commandes .sticker, .play, .compress, etc. ne fonctionnent plus.
//
// Ce script est lancé par le "postinstall" de NOTRE projet (qui, lui, n'est
// pas bloqué) : si le binaire est absent, il lance lui-même l'installation
// de ffmpeg-static. Sans effet si le binaire est déjà là. N'interrompt jamais
// "npm install" en cas d'échec.
// =====================================================================================
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function main() {
  let ffmpegPath;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    console.warn("⚠️  Paquet ffmpeg-static introuvable (lance : npm install).");
    return;
  }
  if (ffmpegPath && fs.existsSync(ffmpegPath)) return; // déjà présent

  const pkgDir = path.dirname(require.resolve("ffmpeg-static/package.json"));
  const installer = path.join(pkgDir, "install.js");
  if (!fs.existsSync(installer)) {
    console.warn("⚠️  install.js de ffmpeg-static introuvable, ffmpeg non installé.");
    return;
  }

  console.log("⏳ Téléchargement de ffmpeg (binaire manquant)...");
  const r = spawnSync(process.execPath, [installer], { cwd: pkgDir, stdio: "inherit" });
  if (r.status === 0 && ffmpegPath && fs.existsSync(ffmpegPath)) {
    console.log("✅ ffmpeg installé.");
  } else {
    console.warn("⚠️  Téléchargement de ffmpeg impossible : .sticker, .play, .compress... seront indisponibles.");
  }
}

try {
  main();
} catch (e) {
  console.warn("⚠️  Vérification de ffmpeg ignorée :", e.message);
}
