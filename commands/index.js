// ===================== LISTE DES COMMANDES =====================
// Chaque commande est une fonction claire. Pour ajouter une commande,
// ajoute juste un nouvel objet dans le tableau `commands`.
//
// Catégories : Général, Owner, Outils, Groupe
// ==================================================================

const os = require("os");
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");
const yts = require("yt-search");
const crypto = require("crypto");
const webp = require("node-webpmux");
const mumaker = require("mumaker");
const { Jimp, ResizeStrategy, JimpMime } = require("jimp");

// Chemin vers le binaire yt-dlp téléchargé par scripts/download-ytdlp.js
// (voir "postinstall" dans package.json). Autonome, ne nécessite pas Python.
const YTDLP_PATH = path.join(__dirname, "..", "bin", "yt-dlp");

// Exécute yt-dlp avec les arguments donnés. Lève une erreur explicite si le
// binaire n'a pas pu être téléchargé (ex: pas d'accès internet au moment du
// npm install).
async function runYtDlp(args) {
  if (!fs.existsSync(YTDLP_PATH)) {
    throw new Error(
      "NO_YTDLP_BINARY: yt-dlp introuvable. Lance 'npm install' pour le télécharger."
    );
  }
  await execFileAsync(YTDLP_PATH, args, { maxBuffer: 1024 * 1024 * 50 });
}

// --- Cookies YouTube (optionnel) ---
// YouTube bloque de plus en plus souvent les téléchargements automatisés
// avec "Sign in to confirm you're not a bot". Le contournement fiable est
// de fournir des cookies d'un vrai compte YouTube connecté. Si le fichier
// "cookies/youtube.txt" existe (format Netscape, voir cookies/README.md),
// on l'utilise automatiquement ; sinon on continue sans (le contournement
// --extractor-args suffit parfois).
const YOUTUBE_COOKIES_PATH = path.join(__dirname, "..", "cookies", "youtube.txt");
function getYoutubeCookieArgs() {
  return fs.existsSync(YOUTUBE_COOKIES_PATH) ? ["--cookies", YOUTUBE_COOKIES_PATH] : [];
}
const config = require("../config");
const {
  PREFIX,
  PREFIXES,
  BOT_NAME,
  BOT_VERSION,
  OWNER_NUMBER,
  OWNER_NAME,
  MODE,
  MENU_IMAGE_URL,
  MENU_AUDIO_URLS,
  DESCRIPTION,
  GROQ_API_KEY,
} = require("../config");
const {
  START_TIME,
  isAntilinkEnabled,
  setAntilink,
  isWelcomeEnabled,
  setWelcome,
  getWelcomeMessage,
  setWelcomeMessage,
  getByeMessage,
  setByeMessage,
  isAntifakeEnabled,
  setAntifake,
  isAfkActive,
  setAfk,
  getAfkMessage,
  isAutoReplyActive,
  setAutoReply,
  getAutoReplyMessage,
  isChatbotActive,
  setChatbot,
  getChatbotExcluded,
  excludeFromChatbot,
  includeInChatbot,
  isAutoStickerSaveActive,
  setAutoStickerSave,
  getSetting,
  setSetting,
  TOGGLES,
} = require("../state");
const { extractViewOnce, getViewOnce, getChatMessages, listStoredViewOnce, buildViewOnceSendPayload } = require("../features");
const { autoStatusCommand } = require("../autostatus");
const { statusReplyCommand } = require("../statusreply");

// ------------------- Style du menu (police stylisée) -------------------

// Convertit en Unicode "monospace" (𝙰𝙱𝙲...) pour les noms de commandes
function toMonospace(str) {
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) out += String.fromCodePoint(0x1d670 + (code - 65)); // A-Z
    else if (code >= 97 && code <= 122) out += String.fromCodePoint(0x1d68a + (code - 97)); // a-z
    else if (code >= 48 && code <= 57) out += String.fromCodePoint(0x1d7f6 + (code - 48)); // 0-9
    else out += ch;
  }
  return out;
}

// Convertit en petites capitales Unicode (ɢʀᴏᴜᴘ) pour les titres de section
const SMALL_CAPS = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ",
  k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "q", r: "ʀ", s: "ꜱ", t: "ᴛ",
  u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};
function toSmallCaps(str) {
  const noAccents = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccents
    .toLowerCase()
    .split("")
    .map((ch) => SMALL_CAPS[ch] || ch)
    .join("");
}

// Construit une boîte compacte "╭─ TITRE ... │ .cmd ... ╰─" pour une
// catégorie de commandes. Style volontairement simple (pas de police
// monospace Unicode ni de symboles en trop) pour éviter les lignes trop
// larges / l'espace vide à droite sur mobile.
const CATEGORY_EMOJI = {
  "Général": "📋",
  "Owner": "👑",
  "IA": "🤖",
  "Téléchargements": "📥",
  "Images & Stickers": "🎨",
  "Traduction": "🌍",
  "Infos & Recherche": "ℹ️",
  "Utilitaires": "🧰",
  "Fun": "🎉",
  "Groupe": "👥",
  "Outils": "🛠️",
};

// IA disponibles dans le bot, listées sous la catégorie IA du .menu (nom du
// modèle + fournisseur). À tenir à jour si tu changes de modèle dans askGPT
// ou l'API utilisée par .dall.
const AVAILABLE_AI = ["Llama 3.3 70B (via Groq) — .gpt", "Pollinations AI — .dall (génération d'image)"];

function renderBox(title, items) {
  const emoji = CATEGORY_EMOJI[title] || "📂";
  const header = `╭─⭓ ${emoji} *${title.toUpperCase()}*`;
  const lines = items.map((name) => `│ • .${name}`);
  const footerLines = [];
  if (title === "IA") {
    footerLines.push(`│`);
    footerLines.push(`│ 🧠 IA disponible(s) :`);
    for (const ai of AVAILABLE_AI) {
      footerLines.push(`│    - ${ai}`);
    }
  }
  const footer = `╰────────`;
  return [header, ...lines, ...footerLines, footer].join("\n");
}

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Africa/Abidjan",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function formatRam() {
  const total = os.totalmem() / 1024 ** 3;
  const free = os.freemem() / 1024 ** 3;
  const used = total - free;
  const pct = ((used / total) * 100).toFixed(1);
  return `${used.toFixed(1)}GB / ${total.toFixed(1)}GB (${pct}%)`;
}

function formatDateFR() {
  return new Date().toLocaleString("fr-FR", {
    timeZone: "Africa/Abidjan",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ------------------------------------------------------------------

const isGroup = (jid) => jid.endsWith("@g.us");

// Récupère les métadonnées + la liste des JID admins d'un groupe
async function getAdmins(sock, groupJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const admins = metadata.participants
    .filter((p) => p.admin === "admin" || p.admin === "superadmin")
    .map((p) => p.id);
  return { metadata, admins };
}

// Extrait uniquement les chiffres d'un JID (peu importe son format :
// "1234@s.whatsapp.net", "1234:5@s.whatsapp.net", "9876@lid"...).
function extractDigits(jid) {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

// Vérifie si LE BOT (donc le compte du propriétaire, puisque c'est un
// self-bot qui tourne sur son propre numéro WhatsApp) est admin du groupe.
//
// Pourquoi pas juste `admins.includes(botJid)` ? Parce que WhatsApp utilise
// désormais aussi des identifiants "@lid" en plus des numéros classiques
// "@s.whatsapp.net" : selon le groupe, la liste des participants peut lister
// le même compte sous un format différent de celui renvoyé par
// `sock.user.id`. Une simple comparaison de chaîne peut donc dire "non admin"
// alors que le numéro EST bel et bien admin dans le groupe. On compare donc
// par numéro de téléphone (chiffres uniquement), sur tous les champs
// disponibles (id, jid, lid), et on retombe aussi sur OWNER_NUMBER en dernier
// recours puisque le bot EST le propriétaire.
function isBotAdmin(sock, metadata) {
  const botNumber = extractDigits(sock.user?.id);
  const ownerDigits = extractDigits(OWNER_NUMBER + "@s.whatsapp.net");
  return metadata.participants.some((p) => {
    if (p.admin !== "admin" && p.admin !== "superadmin") return false;
    const candidates = [p.id, p.jid, p.lid, p.phoneNumber]
      .filter(Boolean)
      .map(extractDigits);
    return candidates.some(
      (num) => (botNumber && num === botNumber) || (ownerDigits && num === ownerDigits)
    );
  });
}

// Ferme (annonce : seuls les admins écrivent) ou ouvre (tout le monde écrit)
// le groupe. Factorisé ici car utilisé par .group open/close ET par les
// alias .open/.close/.ouvrir/.fermer.
async function setGroupAnnouncement(sock, from, senderNumber, close) {
  if (!isGroup(from)) {
    return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
  }
  const { admins, metadata } = await getAdmins(sock, from);
  const senderJid = `${senderNumber}@s.whatsapp.net`;
  if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
    return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
  }
  if (!isBotAdmin(sock, metadata)) {
    return sock.sendMessage(from, { text: "❌ Je dois être admin du groupe pour faire ça." });
  }
  try {
    await sock.groupSettingUpdate(from, close ? "announcement" : "not_announcement");
  } catch (err) {
    console.error("Erreur groupSettingUpdate :", err.message);
    return sock.sendMessage(from, { text: "❌ Échec : impossible de changer les réglages du groupe." });
  }
  await sock.sendMessage(from, {
    text: close
      ? "🔒 Groupe fermé : seuls les admins peuvent écrire."
      : "🔓 Groupe ouvert : tout le monde peut écrire.",
  });
}

// Dernière liste affichée par .vu, par chat — permet de faire .vu <numéro>
// juste après sans avoir à ré-écrire un id complet. Volontairement en
// mémoire seulement (pas sur disque) : si le bot redémarre entre les deux,
// il suffit de refaire .vu pour rafraîchir la liste.
const vuListCache = new Map();

// Détermine le JID visé par une commande : mention > message cité > numéro en argument
function resolveTarget(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  if (args[0]) {
    const digits = args[0].replace(/[^0-9]/g, "");
    if (digits) return `${digits}@s.whatsapp.net`;
  }
  return null;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function isOwner(senderNumber) {
  return senderNumber === OWNER_NUMBER;
}

// Fabrique un raccourci simple du type ".online on|off" pour basculer
// un réglage précis, sans avoir à passer par .toggle <nom> on|off.
function makeToggleShortcut(name, key, desc) {
  return {
    name,
    desc: `${desc} : .${name} on|off`,
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const value = (args[0] || "").toLowerCase();
      if (value !== "on" && value !== "off") {
        return sock.sendMessage(from, { text: `Utilisation : .${name} on|off` });
      }
      setSetting(key, value === "on");
      await sock.sendMessage(from, {
        text: `${value === "on" ? "✅" : "❌"} ${TOGGLES[key]} est maintenant ${value === "on" ? "activé" : "désactivé"}.`,
      });
    },
  };
}

// Traduit un code météo WMO (utilisé par Open-Meteo) en description FR
// courte avec emoji, pour la commande .meteo.
function weatherCodeToText(code) {
  const map = {
    0: "☀️ Ciel dégagé",
    1: "🌤️ Plutôt dégagé",
    2: "⛅ Partiellement nuageux",
    3: "☁️ Couvert",
    45: "🌫️ Brouillard",
    48: "🌫️ Brouillard givrant",
    51: "🌦️ Bruine légère",
    53: "🌦️ Bruine modérée",
    55: "🌧️ Bruine dense",
    56: "🌧️ Bruine verglaçante légère",
    57: "🌧️ Bruine verglaçante dense",
    61: "🌧️ Pluie légère",
    63: "🌧️ Pluie modérée",
    65: "🌧️ Pluie forte",
    66: "🌧️ Pluie verglaçante légère",
    67: "🌧️ Pluie verglaçante forte",
    71: "🌨️ Neige légère",
    73: "🌨️ Neige modérée",
    75: "❄️ Neige forte",
    77: "❄️ Grains de neige",
    80: "🌦️ Averses légères",
    81: "🌧️ Averses modérées",
    82: "⛈️ Averses violentes",
    85: "🌨️ Averses de neige légères",
    86: "❄️ Averses de neige fortes",
    95: "⛈️ Orage",
    96: "⛈️ Orage avec grêle légère",
    99: "⛈️ Orage avec grêle forte",
  };
  return map[code] || "🌡️ Conditions inconnues";
}

// Convertit une image ou une courte vidéo en vrai sticker WEBP (512x512),
// seul format que WhatsApp sait afficher correctement pour les stickers.
// Devine l'extension d'un buffer image à partir de sa signature binaire
// (les stickers statiques Telegram sont presque toujours en .webp ou .png
// AVEC transparence — jamais en .jpg, qui ne supporte pas l'alpha).
function detectImageExtension(buffer) {
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.toString("hex", 0, 8) === "89504e470d0a1a0a") return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  return "webp"; // valeur par défaut la plus courante pour les stickers Telegram
}

async function convertToWebpSticker(inputBuffer, isVideo, { quality = 75, fps = 15, durationSec = 6 } = {}) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputExt = isVideo ? "mp4" : detectImageExtension(inputBuffer);
  const inputFile = path.join(os.tmpdir(), `ariel_stk_in_${id}.${inputExt}`);
  const outputFile = path.join(os.tmpdir(), `ariel_stk_out_${id}.webp`);
  try {
    fs.writeFileSync(inputFile, inputBuffer);
    // "format=rgba" avant le pad force ffmpeg à garder le canal alpha tout
    // du long : sans ça, le fond "white@0.0" (censé être transparent) finit
    // souvent en blanc opaque, car le format de pixels choisi par défaut
    // entre le décodage et l'encodage libwebp ne conserve pas la transparence.
    const filter =
      `scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},format=rgba,pad=512:512:-1:-1:color=white@0.0`;
    const args = [
      "-y",
      "-i", inputFile,
      ...(isVideo ? ["-t", String(durationSec)] : []), // limite les stickers animés
      "-vf", filter,
      "-loop", "0",
      "-an",
      "-vsync", "0",
      "-vcodec", "libwebp",
      "-pix_fmt", "yuva420p",
      "-quality", String(quality),
      "-preset", "default",
      outputFile,
    ];
    await execFileAsync(ffmpegPath, args);
    return fs.readFileSync(outputFile);
  } finally {
    fs.promises.unlink(inputFile).catch(() => {});
    fs.promises.unlink(outputFile).catch(() => {});
  }
}

// WhatsApp refuse d'ajouter/enregistrer ("sauvegarder") un sticker qui
// dépasse une certaine taille : il reste affichable dans la conversation
// mais impossible à ajouter aux stickers favoris ni à ré-exporter depuis le
// téléphone. C'est la cause la plus fréquente des stickers "qui ne sortent
// pas bien" une fois reçus. Limites usuelles côté client WhatsApp :
const STATIC_STICKER_LIMIT = 100 * 1024; // 100 Ko
const ANIMATED_STICKER_LIMIT = 500 * 1024; // 500 Ko

// Reconvertit avec une qualité (et, pour les animés, une durée) réduite tant
// que le résultat dépasse la limite WhatsApp, au lieu d'envoyer un fichier
// que le téléphone ne pourra pas sauvegarder correctement.
async function convertToWebpStickerWithinLimit(inputBuffer, isVideo) {
  const limit = isVideo ? ANIMATED_STICKER_LIMIT : STATIC_STICKER_LIMIT;
  const attempts = isVideo
    ? [
        { quality: 75, fps: 15, durationSec: 6 },
        { quality: 50, fps: 12, durationSec: 5 },
        { quality: 35, fps: 10, durationSec: 4 },
        { quality: 25, fps: 8, durationSec: 3 },
      ]
    : [{ quality: 80 }, { quality: 60 }, { quality: 40 }, { quality: 25 }];

  let best = null;
  for (const opts of attempts) {
    const buf = await convertToWebpSticker(inputBuffer, isVideo, opts);
    if (!best || buf.length < best.length) best = buf;
    if (buf.length <= limit) return buf;
  }
  // Même après la compression la plus agressive, ça dépasse encore : on
  // renvoie quand même le plus petit résultat obtenu (mieux qu'un échec
  // total), mais l'appelant peut choisir de le signaler/sauter.
  return best;
}

// --- Rendu des stickers Lottie (.tgs) ---
// Un sticker "animé" Telegram existe sous 2 formes : vidéo (.webm, géré par
// convertToWebpSticker via ffmpeg) ou Lottie (.tgs = JSON gzippé qui décrit
// une animation vectorielle "After Effects"). ffmpeg ne sait pas lire du
// JSON, donc pour ces stickers-là on ouvre un Chromium headless (puppeteer),
// on y joue l'animation avec lottie-web, on capture chaque frame en PNG,
// puis on réassemble le tout en WEBP animé avec ffmpeg. On garde un seul
// navigateur ouvert et on le réutilise pour tous les stickers d'un pack.
let _browserPromise = null;
let _browserUses = 0;
// Nombre de stickers Lottie rendus avant de fermer/relancer Chromium. Un seul
// navigateur gardé ouvert indéfiniment finit par accumuler de la mémoire
// (pages non totalement libérées par Puppeteer) sur les gros packs ou après
// plusieurs `.tg` d'affilée, jusqu'à planter silencieusement les rendus
// suivants : ce recyclage périodique évite ce plantage "invisible".
const BROWSER_MAX_USES = 25;
async function getBrowser() {
  if (_browserPromise && _browserUses >= BROWSER_MAX_USES) {
    const old = _browserPromise;
    _browserPromise = null;
    _browserUses = 0;
    old.then((b) => b.close().catch(() => {})).catch(() => {});
  }
  if (!_browserPromise) {
    const puppeteer = require("puppeteer");
    _browserPromise = puppeteer
      .launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
      .catch((err) => {
        _browserPromise = null;
        throw err;
      });
  }
  _browserUses++;
  return _browserPromise;
}

async function convertTgsToWebp(tgsBuffer) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const frameDir = path.join(os.tmpdir(), `ariel_tgs_${id}`);
  const outputFile = path.join(os.tmpdir(), `ariel_tgs_out_${id}.webp`);
  let page;
  try {
    const animData = JSON.parse(zlib.gunzipSync(tgsBuffer).toString("utf8"));

    // fps et durée réduits : c'est le nombre de captures d'écran Puppeteer
    // (une par frame) qui domine le temps de conversion d'un sticker animé,
    // bien plus que n'importe quel délai réseau. 15fps/6s = jusqu'à 90
    // captures ; 10fps/4s = 40 captures max, soit ~2x plus rapide par
    // sticker animé, pour une différence de fluidité à peine perceptible
    // sur un sticker WhatsApp affiché en petit.
    const fps = 10;
    const sourceFps = animData.fr || 30;
    const ip = animData.ip || 0;
    const op = animData.op || sourceFps * 3;
    const durationSec = Math.min((op - ip) / sourceFps || 3, 4); // 4s max (était 6s)
    const frameCount = Math.max(1, Math.round(durationSec * fps));

    fs.mkdirSync(frameDir, { recursive: true });

    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;background:transparent;">
        <div id="anim" style="width:512px;height:512px;"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
      </body></html>`,
      { waitUntil: "networkidle0", timeout: 20000 }
    );
    await page.evaluate((data) => {
      window.__anim = lottie.loadAnimation({
        container: document.getElementById("anim"),
        renderer: "canvas",
        loop: false,
        autoplay: false,
        animationData: data,
      });
    }, animData);

    const el = await page.$("#anim");
    for (let i = 0; i < frameCount; i++) {
      const frameNum = Math.min(ip + Math.round((i / fps) * sourceFps), op - 1);
      await page.evaluate((f) => window.__anim.goToAndStop(f, true), frameNum);
      const framePath = path.join(frameDir, `f${String(i).padStart(4, "0")}.png`);
      await el.screenshot({ path: framePath, omitBackground: true });
    }

    const args = [
      "-y",
      "-framerate", String(fps),
      "-i", path.join(frameDir, "f%04d.png"),
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white@0.0",
      "-loop", "0",
      "-vsync", "0",
      "-vcodec", "libwebp",
      "-preset", "default",
      outputFile,
    ];
    await execFileAsync(ffmpegPath, args);
    return fs.readFileSync(outputFile);
  } finally {
    if (page) await page.close().catch(() => {});
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.promises.unlink(outputFile).catch(() => {});
  }
}

// Limite le nombre de conversions Lottie (Puppeteer/Chromium) simultanées,
// indépendamment de la taille du lot général de préparation : chaque
// conversion animée ouvre un onglet Chromium et capture plusieurs dizaines
// d'images, ce qui consomme beaucoup de RAM. En laisser tourner plusieurs à
// la fois (ex: pack de 50 stickers avec plusieurs animés dans le même lot)
// peut dépasser le quota mémoire de l'hébergeur et faire tuer tout le
// process — ce qui coupe le bot sans passer par un vrai événement de
// déconnexion WhatsApp, donc sans reconnexion automatique possible.
let _tgsInFlight = 0;
const TGS_MAX_CONCURRENT = 2;
async function convertTgsToWebpLimited(tgsBuffer) {
  while (_tgsInFlight >= TGS_MAX_CONCURRENT) {
    await new Promise((r) => setTimeout(r, 150));
  }
  _tgsInFlight++;
  try {
    return await convertTgsToWebp(tgsBuffer);
  } finally {
    _tgsInFlight--;
  }
}
// générées (.dall). Fourni par le paquet npm "dejavu-fonts-ttf" pour ne
// dépendre d'aucune police installée sur le serveur d'hébergement.
const WATERMARK_FONT_DIR = path.join(__dirname, "..", "node_modules", "dejavu-fonts-ttf", "ttf");

// Récupère la largeur/hauteur d'une image en lisant le message d'erreur de
// ffmpeg (pas de ffprobe embarqué avec ffmpeg-static). Fallback 512x512.
function getImageDimensions(inputFile) {
  try {
    execFileAsyncSyncProbe(inputFile);
  } catch (e) {
    const m = (e.stderr || "").toString().match(/, (\d{2,5})x(\d{2,5})[ ,]/);
    if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  }
  return { width: 512, height: 512 };
}
function execFileAsyncSyncProbe(inputFile) {
  const { execFileSync } = require("child_process");
  execFileSync(ffmpegPath, ["-i", inputFile], { stdio: ["ignore", "ignore", "pipe"] });
}

// Incruste un bandeau semi-transparent + le nom du bot en bas d'une image.
// Contrairement à une légende WhatsApp (qui peut être coupée ou retirée en
// republiant l'image), le texte fait ici partie des pixels de l'image.
// NB : le binaire ffmpeg-static utilisé ici n'inclut pas le filtre
// "drawtext" (build sans libfreetype activée pour ce filtre précis), donc on
// dessine le bandeau avec "drawbox" (dispo) et le texte avec "ass"
// (rendu via libass, dispo), en pointant vers la police DejaVu Sans fournie.
async function addWatermark(imageBuffer, label) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputFile = path.join(os.tmpdir(), `ariel_wm_in_${id}.jpg`);
  const outputFile = path.join(os.tmpdir(), `ariel_wm_out_${id}.jpg`);
  const assFile = path.join(os.tmpdir(), `ariel_wm_${id}.ass`);
  try {
    fs.writeFileSync(inputFile, imageBuffer);
    const { width, height } = getImageDimensions(inputFile);

    const barHeight = Math.max(36, Math.round(height / 18));
    const fontsize = Math.round(barHeight * 0.5);
    const marginV = Math.round((barHeight - fontsize) * 0.6);
    // { } sont des caractères de contrôle en ASS : on les retire par sécurité.
    const safeLabel = String(label).replace(/[{}]/g, "");

    const ass =
      `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n` +
      `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
      `Style: WM,DejaVu Sans,${fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,2,10,10,${marginV},1\n\n` +
      `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
      `Dialogue: 0,0:00:00.00,0:00:05.00,WM,,0,0,0,,${safeLabel}\n`;
    fs.writeFileSync(assFile, ass);

    const filter =
      `drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.45:t=fill,` +
      `ass=filename='${assFile}':fontsdir='${WATERMARK_FONT_DIR}'`;
    await execFileAsync(ffmpegPath, ["-y", "-i", inputFile, "-vf", filter, "-update", "1", outputFile]);
    return fs.readFileSync(outputFile);
  } finally {
    fs.promises.unlink(inputFile).catch(() => {});
    fs.promises.unlink(outputFile).catch(() => {});
    fs.promises.unlink(assFile).catch(() => {});
  }
}


async function askGPT(prompt, systemPrompt) {
  if (!GROQ_API_KEY || GROQ_API_KEY === "COLLE_TA_CLE_GROQ_ICI") {
    throw new Error("NO_API_KEY");
  }
  const messages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
    : [{ role: "user", content: prompt }];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", // modèle gratuit chez Groq
      messages,
      max_tokens: 800,
      // Température basse : pour une même question, l'IA reste cohérente et
      // répond à peu près pareil à chaque fois, au lieu de varier.
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    throw new Error(`API_ERROR_${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "Pas de réponse.";
}

// Recherche une chanson sur YouTube (ytsearch1:) et télécharge l'audio en MP3
// via yt-dlp, puis l'envoie dans le chat. Nécessite ffmpeg installé sur le
// serveur pour l'extraction audio.
async function downloadAndSendAudio(sock, from, query) {
  const tmpBase = path.join(os.tmpdir(), `ariel_play_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpFile = `${tmpBase}.mp3`;
  try {
    await sock.sendMessage(from, { text: `🎵 Recherche de "${query}" en cours...` });
    await runYtDlp([
      `ytsearch1:${query}`,
      "-o", `${tmpBase}.%(ext)s`,
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--ffmpeg-location", ffmpegPath,
      "--no-check-certificates",
      "--no-warnings",
      "--prefer-free-formats",
      // YouTube bloque de plus en plus les requêtes venant de serveurs avec
      // "Sign in to confirm you're not a bot". Se faire passer pour le client
      // YouTube Android au lieu du client web évite ce blocage dans la
      // majorité des cas (pas besoin de cookies).
      "--extractor-args", "youtube:player_client=android",
      ...getYoutubeCookieArgs(),
    ]);

    if (!fs.existsSync(tmpFile)) {
      throw new Error("Fichier audio introuvable après téléchargement.");
    }

    const { size } = fs.statSync(tmpFile);
    if (size > 95 * 1024 * 1024) {
      await sock.sendMessage(from, {
        text: `❌ Fichier audio trop volumineux (${(size / 1024 / 1024).toFixed(1)}MB).`,
      });
      return;
    }

    await sock.sendMessage(from, {
      audio: fs.readFileSync(tmpFile),
      mimetype: "audio/mpeg",
      fileName: `${query}.mp3`,
      ptt: false,
    });
  } catch (err) {
    console.error(`Erreur .play (${query}) :`, err);
    const text = err.message?.startsWith("NO_YTDLP_BINARY")
      ? "❌ yt-dlp n'est pas encore installé sur le serveur. Relance 'npm install' puis réessaie."
      : `❌ Impossible de trouver ou télécharger "${query}". Réessaie avec un autre titre.`;
    await sock.sendMessage(from, { text });
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

// Télécharge une vidéo (YouTube, TikTok, Facebook...) via yt-dlp puis l'envoie
// dans le chat. Nettoie toujours le fichier temporaire, même en cas d'erreur.
async function downloadAndSendVideo(sock, from, url, platformLabel) {
  const tmpFile = path.join(os.tmpdir(), `ariel_dl_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  try {
    await sock.sendMessage(from, { text: `⏳ Téléchargement ${platformLabel} en cours...` });
    await runYtDlp([
      url,
      "-o", tmpFile,
      "-f", "mp4/bestvideo+bestaudio/best",
      "--ffmpeg-location", ffmpegPath,
      "--no-check-certificates",
      "--no-warnings",
      "--prefer-free-formats",
      "--extractor-args", "youtube:player_client=android",
      ...getYoutubeCookieArgs(),
    ]);

    if (!fs.existsSync(tmpFile)) {
      throw new Error("Fichier vidéo introuvable après téléchargement.");
    }

    const { size } = fs.statSync(tmpFile);
    // WhatsApp refuse souvent les fichiers trop volumineux selon le client
    if (size > 95 * 1024 * 1024) {
      await sock.sendMessage(from, {
        text: `❌ Vidéo trop volumineuse (${(size / 1024 / 1024).toFixed(1)}MB) pour être envoyée sur WhatsApp.`,
      });
      return;
    }

    await sock.sendMessage(from, {
      video: fs.readFileSync(tmpFile),
      caption: `✅ Téléchargement ${platformLabel} terminé.`,
    });
  } catch (err) {
    console.error(`Erreur téléchargement ${platformLabel} :`, err);
    const text = err.message?.startsWith("NO_YTDLP_BINARY")
      ? "❌ yt-dlp n'est pas encore installé sur le serveur. Relance 'npm install' puis réessaie."
      : `❌ Impossible de télécharger cette vidéo ${platformLabel}. Vérifie le lien ou réessaie plus tard.`;
    await sock.sendMessage(from, { text });
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

// --- APIs externes de secours pour .song / .video (privilégiées par ces
// deux commandes car plus rapides que yt-dlp : pas d'extraction locale) ---
const DOWNLOAD_AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
  },
};

// Essaie plusieurs APIs l'une après l'autre jusqu'à ce qu'une renvoie un
// lien de téléchargement exploitable. Chaque `source` est une fonction qui
// renvoie { url, title } ou lève une erreur.
async function tryDownloadSources(sources) {
  let lastError;
  for (const source of sources) {
    try {
      const result = await source();
      if (result?.url) return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Toutes les sources ont échoué");
}

async function fetchSongDownloadUrl(youtubeUrl) {
  return tryDownloadSources([
    async () => {
      const { data } = await axios.get(
        `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp3`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.success && data?.downloadURL) return { url: data.downloadURL, title: data.title };
      throw new Error("EliteProTech: pas de résultat");
    },
    async () => {
      const { data } = await axios.get(
        `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.success && data?.data?.download_url) {
        return { url: data.data.download_url, title: data.data.title };
      }
      throw new Error("Yupra: pas de résultat");
    },
    async () => {
      const { data } = await axios.get(
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.dl) return { url: data.dl, title: data.title };
      throw new Error("Okatsu: pas de résultat");
    },
  ]);
}

async function fetchVideoDownloadUrl(youtubeUrl) {
  return tryDownloadSources([
    async () => {
      const { data } = await axios.get(
        `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.success && data?.downloadURL) return { url: data.downloadURL, title: data.title };
      throw new Error("EliteProTech: pas de résultat");
    },
    async () => {
      const { data } = await axios.get(
        `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.success && data?.data?.download_url) {
        return { url: data.data.download_url, title: data.data.title };
      }
      throw new Error("Yupra: pas de résultat");
    },
    async () => {
      const { data } = await axios.get(
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
        DOWNLOAD_AXIOS_DEFAULTS
      );
      if (data?.result?.mp4) return { url: data.result.mp4, title: data.result.title };
      throw new Error("Okatsu: pas de résultat");
    },
  ]);
}

// Convertit un buffer audio quelconque (m4a, ogg, wav...) en MP3 via ffmpeg,
// sur le même principe que convertToWebpSticker plus haut.
async function convertBufferToMp3(buffer, sourceExt) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputFile = path.join(os.tmpdir(), `ariel_song_in_${id}.${sourceExt}`);
  const outputFile = path.join(os.tmpdir(), `ariel_song_out_${id}.mp3`);
  try {
    fs.writeFileSync(inputFile, buffer);
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputFile,
      "-vn",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "128k",
      outputFile,
    ]);
    return fs.readFileSync(outputFile);
  } finally {
    fs.promises.unlink(inputFile).catch(() => {});
    fs.promises.unlink(outputFile).catch(() => {});
  }
}

// Devine l'extension d'un buffer audio à partir de sa signature binaire.
function detectAudioExtension(buffer) {
  if (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return "mp3";
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "m4a";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (buffer.toString("ascii", 0, 4) === "RIFF") return "wav";
  return "m4a"; // valeur par défaut la plus courante pour ces APIs
}

// .song : recherche + téléchargement via APIs externes (plus rapide que
// yt-dlp car pas d'extraction locale), avec conversion MP3 systématique.
async function downloadAndSendSong(sock, from, query) {
  const { videos } = await yts(query);
  if (!videos || !videos.length) {
    await sock.sendMessage(from, { text: "Aucun résultat trouvé." });
    return;
  }
  const video = videos[0];
  await sock.sendMessage(from, {
    image: { url: video.thumbnail },
    caption: `🎵 Téléchargement : *${video.title}*\n⏱ Durée : ${video.timestamp}`,
  });

  try {
    const { url: audioUrl, title } = await fetchSongDownloadUrl(video.url);
    const { data } = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 90000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: DOWNLOAD_AXIOS_DEFAULTS.headers,
    });
    let buffer = Buffer.from(data);
    if (!buffer.length) throw new Error("Fichier audio vide");

    const ext = detectAudioExtension(buffer);
    if (ext !== "mp3") {
      buffer = await convertBufferToMp3(buffer, ext);
    }

    await sock.sendMessage(from, {
      audio: buffer,
      mimetype: "audio/mpeg",
      fileName: `${(title || video.title || "musique").replace(/[^\w\s-]/g, "")}.mp3`,
      ptt: false,
    });
  } catch (err) {
    console.error("Erreur .song :", err.message);
    await sock.sendMessage(from, {
      text: "❌ Échec du téléchargement. Toutes les sources sont indisponibles, réessaie plus tard.",
    });
  }
}

// .video : recherche ou lien direct + téléchargement via APIs externes.
async function downloadAndSendSongVideo(sock, from, searchQuery) {
  let videoUrl = searchQuery;
  let title = "";
  let thumbnail = "";

  if (!/^https?:\/\//i.test(searchQuery)) {
    const { videos } = await yts(searchQuery);
    if (!videos || !videos.length) {
      await sock.sendMessage(from, { text: "Aucune vidéo trouvée." });
      return;
    }
    videoUrl = videos[0].url;
    title = videos[0].title;
    thumbnail = videos[0].thumbnail;
  }

  if (thumbnail) {
    await sock.sendMessage(from, { image: { url: thumbnail }, caption: `*${title}*\nTéléchargement...` });
  } else {
    await sock.sendMessage(from, { text: "⏳ Téléchargement en cours..." });
  }

  try {
    const { url: dlUrl, title: apiTitle } = await fetchVideoDownloadUrl(videoUrl);
    await sock.sendMessage(from, {
      video: { url: dlUrl },
      mimetype: "video/mp4",
      fileName: `${(apiTitle || title || "video").replace(/[^\w\s-]/g, "")}.mp4`,
      caption: `*${apiTitle || title || "Vidéo"}*`,
    });
  } catch (err) {
    console.error("Erreur .video :", err.message);
    await sock.sendMessage(from, {
      text: "❌ Échec du téléchargement. Toutes les sources sont indisponibles, réessaie plus tard.",
    });
  }
}

// .traduire / .trt : essaie plusieurs APIs de traduction gratuites en
// cascade (Google -> MyMemory -> Dreaded).
async function translateText(text, lang) {
  const attempts = [
    async () => {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.[0]?.[0]?.[0];
      if (!result) throw new Error("Pas de traduction (Google)");
      return result;
    },
    async () => {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.responseData?.translatedText;
      if (!result) throw new Error("Pas de traduction (MyMemory)");
      return result;
    },
    async () => {
      const res = await fetch(`https://api.dreaded.site/api/translate?text=${encodeURIComponent(text)}&lang=${lang}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.translated) throw new Error("Pas de traduction (Dreaded)");
      return data.translated;
    },
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Toutes les APIs de traduction ont échoué");
}

const LINK_REGEX = /(https?:\/\/|chat\.whatsapp\.com\/|wa\.me\/)/i;

// --- Cache de l'image du menu ---
// Sans ce cache, sendMessage({ image: { url: MENU_IMAGE_URL } }) oblige
// Baileys à retélécharger l'image depuis Internet (ex: i.ibb.co) À CHAQUE
// fois que quelqu'un tape .menu, ce qui rend la commande lente. On la
// télécharge une seule fois en mémoire (buffer), puis on réutilise ce
// buffer pour tous les envois suivants : .menu devient quasi instantané
// après le tout premier appel.
let cachedMenuImageBuffer = null;
let menuImageFetchFailed = false;

async function getMenuImageBuffer() {
  if (!MENU_IMAGE_URL || menuImageFetchFailed) return null;
  if (cachedMenuImageBuffer) return cachedMenuImageBuffer;
  try {
    const res = await fetch(MENU_IMAGE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    cachedMenuImageBuffer = Buffer.from(arrayBuffer);
    return cachedMenuImageBuffer;
  } catch (e) {
    console.log("Impossible de mettre en cache l'image du menu :", e.message);
    menuImageFetchFailed = true; // on n'insiste pas à chaque .menu, juste le texte
    return null;
  }
}

// --- Cache des musiques du menu ---
// Même principe que le cache de l'image ci-dessus, mais pour plusieurs
// musiques : chaque lien de MENU_AUDIO_URLS est téléchargé une seule fois
// (mis en cache dans une Map lien -> buffer), puis réutilisé. À chaque
// .menu, une musique est choisie au hasard parmi celles déjà en cache
// (ou téléchargées à la volée si c'est la première fois).
const cachedMenuAudioBuffers = new Map(); // url -> Buffer
const menuAudioFetchFailedUrls = new Set();

async function getMenuAudioBuffer() {
  const urls = Array.isArray(MENU_AUDIO_URLS) ? MENU_AUDIO_URLS.filter(Boolean) : [];
  if (urls.length === 0) return null;

  const url = urls[Math.floor(Math.random() * urls.length)];

  if (menuAudioFetchFailedUrls.has(url)) return null;
  if (cachedMenuAudioBuffers.has(url)) return cachedMenuAudioBuffers.get(url);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    cachedMenuAudioBuffers.set(url, buffer);
    return buffer;
  } catch (e) {
    console.log(`Impossible de mettre en cache la musique du menu (${url}) :`, e.message);
    menuAudioFetchFailedUrls.add(url); // on n'insiste pas à chaque .menu pour ce lien
    return null;
  }
}

// Précharge TOUTES les musiques de MENU_AUDIO_URLS d'un coup (appelée une
// fois à la connexion du bot, voir index.js). Sans ça, seule la musique
// tirée au hasard lors du tout premier .menu était mise en cache : les 4
// autres restaient à télécharger la première fois qu'elles étaient tirées,
// ce qui rendait certains .menu plus lents que d'autres de façon aléatoire.
async function preloadMenuAudioBuffers() {
  const urls = Array.isArray(MENU_AUDIO_URLS) ? MENU_AUDIO_URLS.filter(Boolean) : [];
  for (const url of urls) {
    if (cachedMenuAudioBuffers.has(url) || menuAudioFetchFailedUrls.has(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      cachedMenuAudioBuffers.set(url, Buffer.from(arrayBuffer));
    } catch (e) {
      console.log(`Impossible de précharger la musique du menu (${url}) :`, e.message);
      menuAudioFetchFailedUrls.add(url);
    }
  }
}

// ------------------------------------------------------------------

// ===================== MISE À JOUR SANS GIT (fallback ZIP) =====================
// Si le bot n'a pas été installé via Git (pas de dossier .git, courant sur
// certains panels d'hébergement), .update peut quand même se mettre à jour
// en téléchargeant une archive ZIP (ex: lien "Download ZIP" de GitHub) et en
// remplaçant les fichiers, tout en préservant config.js, settings.json et
// session/ (aucune de ces données locales n'est jamais écrasée).
function downloadFileTo(url, dest, visited = new Set()) {
  return new Promise((resolve, reject) => {
    try {
      if (visited.has(url) || visited.size > 5) {
        return reject(new Error("Trop de redirections"));
      }
      visited.add(url);
      const client = url.startsWith("https://") ? require("https") : require("http");
      const req = client.get(
        url,
        { headers: { "User-Agent": "Ariel-MD-Updater/1.0", Accept: "*/*" } },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            if (!location) return reject(new Error(`HTTP ${res.statusCode} sans Location`));
            res.resume();
            return downloadFileTo(new URL(location, url).toString(), dest, visited)
              .then(resolve)
              .catch(reject);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
          file.on("error", (err) => {
            try {
              file.close(() => {});
            } catch {}
            fs.unlink(dest, () => reject(err));
          });
        }
      );
      req.on("error", (err) => fs.unlink(dest, () => reject(err)));
    } catch (e) {
      reject(e);
    }
  });
}

async function extractZipTo(zipPath, outDir) {
  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, "/")}' -Force`,
    ]);
    return;
  }
  for (const [bin, args] of [
    ["unzip", ["-o", zipPath, "-d", outDir]],
    ["7z", ["x", "-y", zipPath, `-o${outDir}`]],
    ["busybox", ["unzip", "-o", zipPath, "-d", outDir]],
  ]) {
    try {
      await execFileAsync(bin, args);
      return;
    } catch {}
  }
  throw new Error(
    "Aucun outil de décompression trouvé (unzip/7z/busybox). Mise à jour Git recommandée sur cet hébergement."
  );
}

function copyRecursiveIgnoring(src, dest, ignoreNames) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (ignoreNames.includes(entry)) continue;
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.lstatSync(s).isDirectory()) {
      copyRecursiveIgnoring(s, d, ignoreNames);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function updateViaZip(projectRoot, zipUrl) {
  const tmpDir = path.join(projectRoot, "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, "update.zip");
  await downloadFileTo(zipUrl, zipPath);

  const extractTo = path.join(tmpDir, "update_extract");
  if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
  await extractZipTo(zipPath, extractTo);

  // Les archives GitHub créent un sous-dossier "REPO-branche/" : on le
  // détecte pour copier son contenu directement à la racine du projet.
  const [firstEntry] = fs.readdirSync(extractTo).map((n) => path.join(extractTo, n));
  const srcRoot =
    firstEntry && fs.existsSync(firstEntry) && fs.lstatSync(firstEntry).isDirectory()
      ? firstEntry
      : extractTo;

  // Jamais touché par la mise à jour : config perso, session WhatsApp,
  // réglages sauvegardés, dépendances, et l'archive elle-même.
  const ignore = [
    "node_modules",
    ".git",
    "session",
    "tmp",
    "config.js",
    "settings.json",
    "status-schedules.json",
    "known-contacts.json",
  ];
  copyRecursiveIgnoring(srcRoot, projectRoot, ignore);

  try {
    fs.rmSync(extractTo, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  } catch {}
}

// ------------------------------------------------------------------

const commands = [
  // ===================== GÉNÉRAL =====================
  {
    name: "menu",
    desc: "Affiche la liste des commandes",
    category: "Général",
    run: async (sock, msg, { from, senderNumber }) => {
      const groups = {};
      const order = [
        "Général",
        "Owner",
        "IA",
        "Téléchargements",
        "Images & Stickers",
        "Traduction",
        "Infos & Recherche",
        "Utilitaires",
        "Outils",
        "Fun",
        "Groupe",
      ];
      for (const c of commands) {
        if (c.hidden) continue;
        const cat = c.category || "Général";
        groups[cat] = groups[cat] || [];
        groups[cat].push(c.name);
      }
      const cats = Object.keys(groups).sort(
        (a, b) => order.indexOf(a) - order.indexOf(b)
      );
      const boxes = cats.map((cat) => renderBox(cat, groups[cat]));

      // --- Bloc d'infos (façon "MAIN MENU" avec statistiques du bot) ---
      // La salutation vise le compte RÉELLEMENT connecté à WhatsApp (celui
      // qui a déployé/appairé le bot), pas la valeur figée OWNER_NUMBER de
      // config.js : si quelqu'un déploie ce bot sans modifier config.js (ou
      // avec un numéro différent de celui réellement lié), on veut quand
      // même afficher le bon compte. sock.user.id est au format
      // "2250788523990:12@s.whatsapp.net" (ou "...@lid" selon les cas) :
      // extractDigits() ne garde que les chiffres du numéro, avant les
      // deux-points et le "@". On ne retombe sur OWNER_NUMBER que si
      // sock.user n'est pas encore disponible (cas très rare).
      const deployerNumber = extractDigits(sock.user?.id) || OWNER_NUMBER;
      const ownerJid = `${deployerNumber}@s.whatsapp.net`;
      // sock.user.name (le "pushname") est le nom de profil que le
      // déployeur a LUI-MÊME choisi sur son compte WhatsApp — Baileys le
      // récupère automatiquement à la connexion. On l'affiche en priorité :
      // contrairement à une mention @numéro, ça ne dépend pas de si la
      // personne qui LIT le message a enregistré ce numéro dans ses propres
      // contacts. Si jamais ce nom n'est pas encore disponible (juste après
      // un tout premier appairage, avant que WhatsApp ne l'ait transmis),
      // on retombe sur la mention @numéro comme avant.
      const deployerDisplay = sock.user?.name || sock.user?.verifiedName || `@${deployerNumber}`;
      const modeEmoji = MODE.toLowerCase() === "public" ? "🌐" : "🔒";
      const infoBox =
        `┏━━◆ ⚜️ *${BOT_NAME}* ⚜️ ◆━━┓\n` +
        `┃ 👋 ${greeting()}, ${deployerDisplay}\n` +
        `┃ 🤖 Nom du bot : ${BOT_NAME}\n` +
        `┃ 👑 Propriétaire : *ARIEL*\n` +
        `┃ 📞 Contact : wa.me/${OWNER_NUMBER}\n` +
        `┃ ${modeEmoji} Mode : *${MODE.toUpperCase()}*\n` +
        `┃ 🕐 ${formatDateFR()}\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

      const text = `${infoBox}\n\n${boxes.join("\n\n")}`;

      // Envoie avec l'image du menu si MENU_IMAGE_URL est renseigné dans
      // config.js, sinon envoie le texte seul. On utilise le buffer mis en
      // cache (voir getMenuImageBuffer) pour éviter de retélécharger l'image
      // depuis Internet à chaque .menu. L'image et le texte partent
      // ensemble (dans un seul message, image + caption) : ça prend
      // quelques secondes de plus (upload de l'image vers WhatsApp),
      // mais c'est le rendu voulu.
      const menuImageBuffer = await getMenuImageBuffer();
      if (menuImageBuffer) {
        await sock.sendMessage(from, {
          image: menuImageBuffer,
          caption: text,
          mentions: [ownerJid],
        });
      } else {
        await sock.sendMessage(from, { text, mentions: [ownerJid] });
      }

      // Envoie la musique du menu juste après, si MENU_AUDIO_URL est
      // renseigné dans config.js. Envoyée comme un fichier audio normal
      // (pas un message vocal "ptt"), pour que ça s'affiche comme une
      // vraie piste de musique dans WhatsApp.
      const menuAudioBuffer = await getMenuAudioBuffer();
      if (menuAudioBuffer) {
        await sock.sendMessage(from, {
          audio: menuAudioBuffer,
          mimetype: "audio/mpeg",
          ptt: false,
        });
      }
    },
  },
  {
    name: "ping",
    desc: "Teste si le bot répond et affiche son état (vitesse, uptime, RAM)",
    category: "Général",
    run: async (sock, msg, { from }) => {
      const start = Date.now();

      const uptime = formatDuration(Date.now() - START_TIME);
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);

      const speed = Date.now() - start;

      const response = `
╭━━━〔 ⚡ ${BOT_NAME} STATUS 〕━━━╮
┃ 🏓 Vitesse   : ${speed} ms
┃ ⏳ En ligne  : ${uptime}
┃ 🧠 RAM       : ${freeMem}MB / ${totalMem}MB
┃ 💻 Plateforme : ${os.platform()}
┃ 🔖 Version   : v${BOT_VERSION}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
`.trim();

      await sock.sendMessage(from, { text: response });
    },
  },
  {
    name: "alive",
    desc: "Vérifie que le bot est en ligne",
    category: "Général",
    run: async (sock, msg, { from }) => {
      await sock.sendMessage(from, {
        text: `✅ ${BOT_NAME} est en ligne et fonctionne normalement.`,
      });
    },
  },
  {
    name: "runtime",
    desc: "Affiche depuis combien de temps le bot tourne",
    category: "Général",
    run: async (sock, msg, { from }) => {
      await sock.sendMessage(from, {
        text: `⏱️ ${BOT_NAME} tourne depuis ${formatDuration(Date.now() - START_TIME)}.`,
      });
    },
  },
  {
    name: "owner",
    desc: "Affiche le contact du propriétaire",
    category: "Général",
    run: async (sock, msg, { from }) => {
      await sock.sendMessage(from, {
        text: `Nom: ARIEL\nContact: wa.me/${OWNER_NUMBER}`,
      });
    },
  },
  {
    name: "jid",
    desc: "Affiche le JID du chat (et le tien)",
    category: "Général",
    run: async (sock, msg, { from, senderNumber }) => {
      await sock.sendMessage(from, {
        text: `💬 Chat : ${from}\n👤 Toi : ${senderNumber}@s.whatsapp.net`,
      });
    },
  },

  // ===================== PARAMÈTRES (propriétaire) =====================
  {
    name: "settings",
    desc: "Affiche l'état des réglages activables (.toggle)",
    category: "Owner",
    run: async (sock, msg, { from }) => {
      const entries = Object.entries(TOGGLES);
      const maxLen = Math.max(...entries.map(([, label]) => label.length));

      const lines = entries.map(([key, label]) => {
        const on = getSetting(key);
        const dot = on ? "🟢" : "🔴";
        const padded = label.padEnd(maxLen, " ");
        const nextAction = on ? "off" : "on";
        return `┃ ${dot} ${padded}  ›  .toggle ${key.toLowerCase()} ${nextAction}`;
      });

      const text = [
        `╭━━〔 ⚙️ *${BOT_NAME} — RÉGLAGES* 〕━━╮`,
        ...lines,
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ``,
        `💡 *.toggle <nom> on|off* pour changer un réglage`,
        `   Ex : *.toggle always_online on*`,
      ].join("\n");

      await sock.sendMessage(from, { text });
    },
  },
  {
    name: "toggle",
    desc: "Active/désactive un réglage : .toggle <nom> on|off (propriétaire)",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const key = (args[0] || "").toUpperCase();
      const value = (args[1] || "").toLowerCase();
      if (!TOGGLES[key]) {
        return sock.sendMessage(from, {
          text: `Réglage inconnu. Utilise .settings pour voir la liste.\nUtilisation : .toggle <nom> on|off`,
        });
      }
      if (value !== "on" && value !== "off") {
        return sock.sendMessage(from, { text: "Utilisation : .toggle <nom> on|off" });
      }
      setSetting(key, value === "on");
      await sock.sendMessage(from, {
        text: `${value === "on" ? "✅" : "❌"} ${TOGGLES[key]} est maintenant ${value === "on" ? "activé" : "désactivé"}.`,
      });
    },
  },
  makeToggleShortcut("online", "ALWAYS_ONLINE", "Toujours en ligne"),
  {
    name: "autostatus",
    desc: "Voir/liker les statuts auto, self-view, filtres include/exclude, emojis de like (propriétaire) : .autostatus",
    category: "Owner",
    run: async (sock, msg, { from, args, senderNumber }) => {
      await autoStatusCommand(sock, from, msg, args, senderNumber);
    },
  },
  {
    name: "autostatuslike",
    desc: "Active/désactive les likes sur les statuts vus (propriétaire) : .autostatuslike on|off",
    category: "Owner",
    run: async (sock, msg, { from, args, senderNumber }) => {
      await autoStatusCommand(sock, from, msg, ["autostatuslike", ...args], senderNumber);
    },
  },
  {
    name: "autostatusemoji",
    desc: "Gère la liste des emojis utilisés pour liker (propriétaire) : .autostatus emoji add|remove|set|clear <emojis>",
    category: "Owner",
    run: async (sock, msg, { from, args, senderNumber }) => {
      await autoStatusCommand(sock, from, msg, ["emoji", ...args], senderNumber);
    },
  },
  {
    name: "statusreply",
    desc: "Renvoie automatiquement un statut en DM à qui le commente avec un mot déclencheur (propriétaire) : .statusreply on|off|words",
    category: "Owner",
    run: async (sock, msg, { from, args, senderNumber }) => {
      await statusReplyCommand(sock, from, msg, args, senderNumber);
    },
  },
  makeToggleShortcut("anti_delete", "ANTI_DELETE", "Anti-suppression"),
  makeToggleShortcut("anticall", "ANTI_CALL", "Rejette automatiquement les appels entrants"),
  makeToggleShortcut("antivv", "ANTI_VV", "Anti-vue-unique (capture les médias vue unique, alias de .ok)"),
  makeToggleShortcut("autoread", "AUTO_READ", "Lecture automatique des messages"),
  {
    name: "reactcmd",
    desc: "Réaction sur tes commandes : .reactcmd on | off | <emoji perso>",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const value = (args[0] || "").toLowerCase();

      if (value === "off") {
        setSetting("COMMAND_REACT_EMOJI", "");
        return sock.sendMessage(from, { text: "❌ Réaction sur les commandes désactivée." });
      }
      if (value === "on" || !args[0]) {
        setSetting("COMMAND_REACT_EMOJI", config.COMMAND_REACT_EMOJI || "⏳");
        return sock.sendMessage(from, {
          text: `✅ Réaction sur les commandes activée (${getSetting("COMMAND_REACT_EMOJI")}).`,
        });
      }
      // N'importe quel autre argument = un emoji personnalisé à utiliser
      setSetting("COMMAND_REACT_EMOJI", args[0]);
      await sock.sendMessage(from, {
        text: `✅ Réaction sur les commandes réglée sur : ${args[0]}`,
      });
    },
  },
  {
    name: "ok",
    desc: "Réponds à un média vue unique avec .ok pour le révéler, ou .ok on|off pour l'anti-vue-unique auto",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args, quoted, quotedId }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }

      // Cas 1 : .ok en réponse à un message "vue unique" → le renvoyer en DM au propriétaire
      if (quoted) {
        const ownerJid = sock?.user?.id
          ? sock.user.id.split(":")[0].split("@")[0] + "@s.whatsapp.net"
          : `${OWNER_NUMBER}@s.whatsapp.net`;

        // On regarde D'ABORD dans le cache (rempli dès la réception du
        // média, voir features.js) : ça marche à tout moment, même si tu as
        // déjà ouvert le média sur ton téléphone entre-temps (WhatsApp le
        // supprime alors de ses serveurs, et un téléchargement direct
        // échouerait sans ce cache).
        const cached = getViewOnce(quotedId);
        if (cached) {
          try {
            await sock.sendMessage(ownerJid, buildViewOnceSendPayload(cached));
          } catch (e) {
            console.error("Erreur .ok (révélation depuis cache) :", e);
            await sock.sendMessage(from, { text: "❌ Impossible d'envoyer ce média." });
          }
          return;
        }

        // Repli : pas encore en cache (ex: juste après un redémarrage du
        // bot) → on tente un téléchargement direct comme avant.
        const vv = extractViewOnce(quoted);
        if (vv) {
          try {
            const { downloadMediaMessage } = require("@whiskeysockets/baileys");
            const buffer = await downloadMediaMessage(
              { message: vv.message },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );
            await sock.sendMessage(
              ownerJid,
              buildViewOnceSendPayload({ type: vv.type, buffer, caption: vv.caption, mimetype: vv.mimetype, ptt: vv.ptt })
            );
          } catch (e) {
            console.error("Erreur .ok (révélation) :", e);
            await sock.sendMessage(from, {
              text: "❌ Impossible de révéler ce média (ni en cache, ni téléchargeable).",
            });
          }
          return;
        }
      }

      // Cas 2 : .ok on|off → active/désactive la capture automatique
      const value = (args[0] || "").toLowerCase();
      if (value !== "on" && value !== "off") {
        return sock.sendMessage(from, {
          text:
            `╭─⭓ 👁️ *ANTI-VUE-UNIQUE*\n` +
            `│ • *.ok* — réponds à un média vue unique pour le révéler\n` +
            `│ • *.ok on|off* — active/désactive la capture automatique\n` +
            `│ • *.vu* — liste tous les médias vue unique en cache (60 jours), même sans le message d'origine\n` +
            `╰────────`,
        });
      }
      setSetting("ANTI_VV", value === "on");
      await sock.sendMessage(from, {
        text: `${value === "on" ? "✅" : "❌"} ${TOGGLES.ANTI_VV} est maintenant ${value === "on" ? "activé" : "désactivé"}.`,
      });
    },
  },
  {
    name: "vu",
    desc: "Liste les médias vue unique en cache (jusqu'à 60 jours) : .vu puis .vu <numéro> pour en récupérer un - propriétaire",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const ownerJid = sock?.user?.id
        ? sock.user.id.split(":")[0].split("@")[0] + "@s.whatsapp.net"
        : `${OWNER_NUMBER}@s.whatsapp.net`;

      const arg = (args[0] || "").trim();

      // .vu <numéro> : renvoie l'élément correspondant à la DERNIÈRE liste
      // affichée dans ce chat via .vu (la liste elle-même n'est pas
      // sauvegardée sur disque, seuls les médias le sont).
      if (arg) {
        const index = Number(arg);
        const list = vuListCache.get(from);
        if (!list || !Number.isInteger(index) || index < 1 || index > list.length) {
          return sock.sendMessage(from, { text: "Numéro invalide. Envoie .vu (sans rien après) pour revoir la liste à jour." });
        }
        const item = list[index - 1];
        const cached = getViewOnce(item.id);
        if (!cached) {
          return sock.sendMessage(from, { text: "❌ Ce média n'est plus disponible (supprimé du cache après 60 jours)." });
        }
        try {
          await sock.sendMessage(ownerJid, buildViewOnceSendPayload(cached));
        } catch (e) {
          console.error("Erreur .vu (envoi) :", e);
          await sock.sendMessage(from, { text: "❌ Impossible d'envoyer ce média." });
        }
        return;
      }

      // .vu sans argument : liste les médias en cache, du plus récent au
      // plus ancien — pas besoin de retrouver/citer le message d'origine
      // dans le chat, utile s'il a disparu (messages éphémères, longtemps après...).
      const list = listStoredViewOnce(15);
      if (!list.length) {
        return sock.sendMessage(from, { text: "Aucun média vue unique en cache pour le moment." });
      }
      vuListCache.set(from, list);
      const lines = list.map((item, i) => {
        const date = new Date(item.savedAt || 0).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" });
        const emoji = item.type === "video" ? "🎥" : item.type === "audio" ? "🎤" : "🖼️";
        const sender = item.senderJid ? `@${item.senderJid.split("@")[0]}` : "?";
        const label = item.caption ? ` — "${item.caption}"` : "";
        return `${i + 1}. ${emoji} ${date} — de ${sender}${label}`;
      });
      await sock.sendMessage(from, {
        text:
          `╭─⭓ 👁️ *MÉDIAS VUE UNIQUE EN CACHE*\n` +
          lines.map((l) => `│ ${l}`).join("\n") +
          `\n╰────────\nEnvoie *.vu <numéro>* pour en récupérer un (conservés 60 jours).`,
      });
    },
  },

  // ===================== UTILITAIRES =====================
  {
    name: "sticker",
    desc: "Transforme une image/vidéo en sticker (répondre à un média)",
    category: "Images & Stickers",
    run: async (sock, msg, { from, quoted }) => {
      if (!quoted || !(quoted.imageMessage || quoted.videoMessage)) {
        return sock.sendMessage(from, {
          text: "Réponds à une image ou une courte vidéo avec .sticker",
        });
      }
      try {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        const isVideo = !!quoted.videoMessage;
        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        const webpBuffer = await convertToWebpSticker(buffer, isVideo);
        await sock.sendMessage(from, { sticker: webpBuffer });
      } catch (err) {
        console.error("Erreur .sticker :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible de créer le sticker. Réessaie avec une autre image/vidéo.",
        });
      }
    },
  },
  {
    name: "toimg",
    desc: "Reconvertit un sticker en image (répondre à un sticker)",
    category: "Images & Stickers",
    run: async (sock, msg, { from, quoted }) => {
      if (!quoted || !quoted.stickerMessage) {
        return sock.sendMessage(from, {
          text: "Réponds à un sticker avec .toimg",
        });
      }
      try {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        await sock.sendMessage(from, { image: buffer });
      } catch (err) {
        console.error("Erreur .toimg :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible de reconvertir ce sticker. Réessaie avec un autre.",
        });
      }
    },
  },
  {
    name: "remini",
    desc: "Améliore la netteté/qualité d'une image (répondre à une image) : .remini",
    category: "Images & Stickers",
    run: async (sock, msg, { from, quoted }) => {
      if (!quoted || !quoted.imageMessage) {
        return sock.sendMessage(from, {
          text: "Réponds à une image avec .remini pour l'améliorer.",
        });
      }
      try {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );

        const image = await Jimp.fromBuffer(buffer);

        // Limite raisonnable pour éviter un traitement trop long sur de très
        // grandes images (le zoom x2 double déjà chaque dimension).
        const MAX_INPUT_SIDE = 1600;
        if (image.width > MAX_INPUT_SIDE || image.height > MAX_INPUT_SIDE) {
          image.scaleToFit({ w: MAX_INPUT_SIDE, h: MAX_INPUT_SIDE });
        }

        // Zoom x2 avec un algorithme d'interpolation plus doux que le
        // plus-proche-voisin, puis renforcement de netteté, contraste,
        // luminosité et saturation légers.
        image.scale({ f: 2, mode: ResizeStrategy.BEZIER });
        image.contrast(0.12);
        image.brightness(0.03);
        image.color([{ apply: "saturate", params: [12] }]);
        const sharpenKernel = [
          [0, -1, 0],
          [-1, 5, -1],
          [0, -1, 0],
        ];
        image.convolute(sharpenKernel);

        const outBuffer = await image.getBuffer(JimpMime.jpeg);
        await sock.sendMessage(
          from,
          { image: outBuffer, caption: "✨ Image améliorée (netteté x2)" },
          { quoted: msg }
        );
      } catch (err) {
        console.error("Erreur .remini :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible d'améliorer cette image. Réessaie avec une autre.",
        });
      }
    },
  },
  {
    name: "transcrire",
    desc: "Transcrit un audio/note vocale en texte (répondre à un audio) : .transcrire",
    category: "Outils",
    run: async (sock, msg, { from, quoted }) => {
      if (!quoted || !(quoted.audioMessage || quoted.pttMessage)) {
        return sock.sendMessage(from, {
          text: "Réponds à un audio ou une note vocale avec .transcrire",
        });
      }

      if (!GROQ_API_KEY || GROQ_API_KEY === "COLLE_TA_CLE_GROQ_ICI") {
        return sock.sendMessage(from, {
          text:
            "⚠️ Clé Groq manquante pour la transcription.\n\n" +
            "1️⃣ Va sur https://console.groq.com/keys et crée une clé gratuite\n" +
            "2️⃣ Envoie : .grok_clé_api=TA_CLE\n" +
            "3️⃣ Redémarre le bot, puis retape .transcrire",
        });
      }

      // On distingue explicitement chaque étape (téléchargement du média vs
      // appel de l'API) pour pouvoir dire PRÉCISÉMENT laquelle a échoué dans
      // le message d'erreur, au lieu d'un message générique — ça évite
      // d'avoir à aller fouiller les logs de l'hébergeur pour diagnostiquer.
      let buffer;
      try {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
      } catch (err) {
        console.error("Erreur .transcrire (téléchargement du média) :", err);
        await sock.sendMessage(from, {
          text: `❌ Impossible de télécharger l'audio (avant même la transcription).\n\n🔍 Détail : ${err.message || err}`,
        });
        return;
      }

      try {
        // API officielle Groq, compatible OpenAI (endpoint audio/transcriptions),
        // avec Whisper — beaucoup plus stable que les APIs tierces non
        // officielles type "aggregateur gratuit sans compte" (celles-ci
        // tombent régulièrement en panne, sans qu'on puisse rien y faire).
        const FormData = require("form-data");
        const form = new FormData();
        form.append("file", buffer, { filename: "audio.ogg" });
        form.append("model", "whisper-large-v3-turbo");
        // Pas de "language" forcé : Whisper détecte automatiquement la
        // langue parlée dans la note vocale.

        const res = await axios.post(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            timeout: 60000,
          }
        );

        const text = res.data?.text?.trim();
        if (!text) {
          throw new Error(
            `Réponse inattendue de l'API : ${JSON.stringify(res.data).slice(0, 300)}`
          );
        }

        const caption = `📝 *Transcription*\n\n${text}\n\n> ARIEL-BOT-MD`;
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
      } catch (err) {
        // Détail exact renvoyé par axios/l'API (statut HTTP + corps de
        // réponse si présent) : c'est ce qui permet de savoir si c'est une
        // clé invalide, un quota dépassé, ou un format audio refusé — sans
        // avoir besoin d'accéder à la console de l'hébergeur.
        const apiDetail = err.response
          ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data).slice(0, 300)}`
          : err.message || String(err);
        console.error("Erreur .transcrire (API Groq) :", err);
        await sock.sendMessage(from, {
          text: `❌ Impossible de transcrire cet audio.\n\n🔍 Détail : ${apiDetail}`,
        });
      }
    },
  },
  {
    name: "save",
    desc: "Sauvegarde un statut : réponds au statut (le tien ou celui d'un contact) avec .save",
    category: "Utilitaires",
    // ⚠️ Entrée purement déclarative : sert uniquement à faire apparaître
    // .save dans .menu. La logique réelle est interceptée bien avant le
    // routeur de commandes, dans index.js (handlePossibleStatusSaveCommand,
    // voir statusreply.js) — ce "run" ne sera donc jamais appelé.
    run: async () => {},
  },
  {
    name: "clear",
    desc: "Efface tous les messages connus de la discussion (propriétaire) : .clear",
    category: "Utilitaires",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }

      // Le bot ne connaît que les messages vus depuis son démarrage (WhatsApp
      // ne fournit pas d'API pour récupérer tout l'historique d'une
      // discussion) : .clear ne peut donc effacer que ceux-là.
      const chatMessages = getChatMessages(from);
      if (chatMessages.length === 0) {
        return sock.sendMessage(from, {
          text: "ℹ️ Aucun message en mémoire pour cette discussion (le bot ne peut effacer que les messages vus depuis son démarrage).",
        });
      }

      const statusMsg = await sock.sendMessage(from, {
        text: `🧹 Suppression de ${chatMessages.length} message(s)...`,
      });

      let deleted = 0;
      for (const m of chatMessages) {
        try {
          await sock.sendMessage(from, { delete: m.key });
          deleted++;
        } catch (e) {
          // Message non supprimable pour tout le monde (pas envoyé par le
          // bot, et pas admin dans ce groupe) → on l'ignore et on continue.
        }
        // Petite pause entre chaque suppression pour éviter de se faire
        // limiter/flaguer par WhatsApp en cas de suppression en masse.
        await new Promise((r) => setTimeout(r, 300));
      }

      try {
        await sock.sendMessage(from, { delete: statusMsg.key });
      } catch (e) {
        // pas grave si ça échoue
      }

      await sock.sendMessage(from, {
        text:
          `✅ ${deleted}/${chatMessages.length} message(s) supprimé(s) pour tout le monde.\n` +
          (deleted < chatMessages.length
            ? "ℹ️ Les autres n'ont pas pu être supprimés (envoyés par quelqu'un d'autre, et tu n'es pas admin ici)."
            : ""),
      });
    },
  },
  {
    name: "clearforme",
    desc: "Efface toute la discussion connue, UNIQUEMENT de ton côté — l'autre garde tout chez elle (propriétaire) : .clearforme",
    category: "Utilitaires",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }

      // Contrairement à .clear (qui supprime "pour tout le
      // monde", donc aussi visible chez l'autre personne), .clearforme
      // utilise l'action native WhatsApp "Effacer la discussion" (chatModify
      // avec clear: true) : ça n'envoie RIEN à la personne en face, elle ne
      // voit rien changer et ne reçoit aucune notification. Seul TON compte
      // (et tes autres appareils liés) voit la discussion vidée.
      const chatMessages = getChatMessages(from);
      if (chatMessages.length === 0) {
        return sock.sendMessage(from, {
          text: "ℹ️ Aucun message en mémoire pour cette discussion (le bot ne connaît que les messages vus depuis son démarrage).",
        });
      }

      // L'API WhatsApp exige les messages triés du plus récent au plus
      // ancien (le dernier élément du tableau = le message le plus ancien
      // connu).
      const sorted = [...chatMessages].sort(
        (a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0)
      );

      try {
        await sock.chatModify({ clear: true, lastMessages: sorted }, from);
        await sock.sendMessage(from, {
          text: "🧹",
        });
      } catch (err) {
        console.error("Erreur .clearforme :", err);
        await sock.sendMessage(from, { text: "❌ Impossible d'effacer la discussion." });
      }
    },
  },
  {
    name: "insta",
    desc: "Télécharge un post/reel Instagram public : .insta <lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const url = args[0];
      if (!url || !/instagram\.com/i.test(url)) {
        return sock.sendMessage(from, { text: "Utilisation : .insta <lien Instagram>" });
      }
      await downloadAndSendVideo(sock, from, url, "Instagram");
    },
  },
  {
    name: "dall",
    desc: "Génère une image à partir d'une description : .dall <description>",
    category: "IA",
    run: async (sock, msg, { from, args }) => {
      const prompt = args.join(" ");
      if (!prompt) {
        return sock.sendMessage(from, { text: "Utilisation : .dall <description de l'image>" });
      }
      try {
        await sock.sendMessage(from, { text: "🎨 Génération de l'image en cours..." });
        const seed = Math.floor(Math.random() * 1_000_000);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&nologo=true`;
        const { data } = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 60000 });
        const watermarked = await addWatermark(Buffer.from(data), BOT_NAME);
        await sock.sendMessage(from, { image: watermarked, caption: `🖼️ ${prompt}` });
      } catch (err) {
        console.error("Erreur .dall :", err);
        await sock.sendMessage(from, { text: "❌ Impossible de générer cette image. Réessaie plus tard." });
      }
    },
  },
  {
    name: "tg",
    desc: "Télécharge un pack de stickers Telegram : .tg <lien du pack>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const link = args[0];
      if (!link || !/https:\/\/t\.me\/addstickers\//i.test(link)) {
        return sock.sendMessage(
          from,
          { text: "Utilisation : .tg <lien du pack>\nEx: .tg https://t.me/addstickers/NomDuPack" },
          { quoted: null }
        );
      }

      // Le token vient UNIQUEMENT de config.js (aucune valeur de secours dans le code).
      const botToken = config.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return sock.sendMessage(from, {
          text: "❌ La commande .tg n'est pas configurée sur ce bot (token Telegram manquant).",
        });
      }

      const packName = link.replace(/^https:\/\/t\.me\/addstickers\//i, "").split(/[?&]/)[0];

      try {
        const { data: setInfo } = await axios.get(
          `https://api.telegram.org/bot${botToken}/getStickerSet`,
          { params: { name: packName }, timeout: 20000 }
        );
        if (!setInfo.ok || !setInfo.result) {
          throw new Error(setInfo.description || "Pack introuvable");
        }

        const stickers = setInfo.result.stickers; // pack entier, sans limite
        await sock.sendMessage(
          from,
          { text: `📦 ${stickers.length} stickers trouvés, envoi en cours...` },
          { quoted: null }
        );

        // Prépare un sticker : téléchargement + conversion (sans l'envoyer).
        // Séparé de l'envoi pour pouvoir paralléliser cette partie lourde.
        async function prepareSticker(sticker) {
          const { data: fileInfo } = await axios.get(
            `https://api.telegram.org/bot${botToken}/getFile`,
            { params: { file_id: sticker.file_id }, timeout: 20000 }
          );
          if (!fileInfo.ok || !fileInfo.result.file_path) return null;

          const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
          const { data: mediaBuffer } = await axios.get(fileUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
          });

          // Stickers vidéo (.webm) : convertibles directement via ffmpeg.
          // Stickers Lottie (.tgs, is_animated) : gzip JSON, pas une image/vidéo,
          // on les rend via Chromium headless + lottie-web (voir convertTgsToWebp).
          let webpBuffer;
          if (sticker.is_animated && !sticker.is_video) {
            webpBuffer = await convertTgsToWebpLimited(Buffer.from(mediaBuffer));
          } else {
            webpBuffer = await convertToWebpStickerWithinLimit(Buffer.from(mediaBuffer), !!sticker.is_video);
          }

          // Si même après recompression maximale le fichier dépasse la
          // limite WhatsApp (rare, mais possible sur des animations très
          // chargées), on ignore ce sticker plutôt que d'envoyer un fichier
          // qui s'affichera mais ne pourra pas être sauvegardé sur le
          // téléphone du destinataire.
          const limit = sticker.is_video || (sticker.is_animated && !sticker.is_video)
            ? ANIMATED_STICKER_LIMIT
            : STATIC_STICKER_LIMIT;
          if (webpBuffer.length > limit) {
            console.log(
              `⚠️ Sticker ignoré (trop volumineux même après compression : ${Math.round(webpBuffer.length / 1024)} Ko)`
            );
            return null;
          }

          const img = new webp.Image();
          await img.load(webpBuffer);
          const metadata = {
            "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
            "sticker-pack-name": packName,
            "sticker-pack-publisher": BOT_NAME,
            emojis: sticker.emoji ? [sticker.emoji] : ["🤖"],
          };
          const exifAttr = Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
            0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
          ]);
          const jsonBuffer = Buffer.from(JSON.stringify(metadata), "utf8");
          const exif = Buffer.concat([exifAttr, jsonBuffer]);
          exif.writeUIntLE(jsonBuffer.length, 14, 4);
          img.exif = exif;
          return img.save(null);
        }

        // Découpe le tableau de stickers en groupes de taille `size`.
        function chunkArray(arr, size) {
          const chunks = [];
          for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
          return chunks;
        }

        let sentCount = 0;
        const BATCH_SIZE = 4; // 4 stickers préparés en parallèle (les animés sont en plus limités séparément, voir TGS_MAX_CONCURRENT)
        for (const batch of chunkArray(stickers, BATCH_SIZE)) {
          // Préparation (téléchargement + conversion) en parallèle pour tout le lot
          const prepared = await Promise.all(
            batch.map((sticker) =>
              prepareSticker(sticker).catch((err) => {
                console.error("Erreur sticker individuel .tg :", err.message);
                return null;
              })
            )
          );

          // Envoi séquentiel (reste un par un pour éviter le spam WhatsApp)
          for (const finalBuffer of prepared) {
            if (!finalBuffer) continue;
            await sock.sendMessage(from, { sticker: finalBuffer }, { quoted: null });
            sentCount++;
            // 800ms entre chaque sticker (au lieu de 150ms) : un envoi trop
            // rapide et en rafale est ce qui déclenche le plus souvent la
            // détection anti-spam de WhatsApp et fait sauter l'appareil lié.
            await new Promise((r) => setTimeout(r, 250));
          }
        }

        await sock.sendMessage(
          from,
          { text: `✅ ${sentCount}/${stickers.length} stickers envoyés depuis "${packName}".` },
          { quoted: null }
        );
      } catch (err) {
        // On journalise le détail brut renvoyé par Telegram (429 = trop de
        // requêtes sur ce token, 401/404 = token invalide/révoqué, etc.) :
        // sans ça, toute panne du token partagé ressemble à un pack introuvable.
        console.error("Erreur .tg :", err.response?.data || err.message);
        const tgError = err.response?.data?.description;
        const isRateLimited = err.response?.status === 429;
        await sock.sendMessage(
          from,
          {
            text: isRateLimited
              ? "❌ Le bot Telegram utilisé pour .tg est temporairement limité (trop de requêtes). Réessaie dans quelques minutes, ou configure ton propre TELEGRAM_BOT_TOKEN dans config.js (via @BotFather)."
              : tgError
              ? `❌ Erreur Telegram : ${tgError}`
              : "❌ Pack introuvable. Vérifie que le lien est correct et que le pack est public.",
          },
          { quoted: null }
        );
      }
    },
  },
  {
    name: "spotify",
    desc: "Télécharge une musique depuis Spotify : .spotify <titre/artiste>",
    category: "Téléchargements",
    // API conservée telle quelle : okatsu-rolezapiiz.vercel.app (search/spotify)
    run: async (sock, msg, { from, args }) => {
      const query = args.join(" ").trim();

      if (!query) {
        return sock.sendMessage(from, {
          text: "*Usage: .spotify <song/artist/keywords>*\n\n*Example: .spotify con calma*",
        });
      }

      try {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/search/spotify?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl, {
          timeout: 20000,
          headers: { "user-agent": "Mozilla/5.0" },
        });

        if (!data?.status || !data?.result) {
          throw new Error("No result from Spotify API");
        }

        const r = data.result;
        const audioUrl = r.audio;
        if (!audioUrl) {
          return sock.sendMessage(from, { text: "*No downloadable audio found for this query.*" });
        }

        const caption = `*🎵 ${r.title || r.name || "Unknown Title"}*\n*👤 ${r.artist || ""}*\n*⏱ ${r.duration || ""}*\n*🔗 ${r.url || ""}*\n\n*Copyright wallyjaytech 2025*`.trim();

        // Envoie la pochette + les infos, puis l'audio
        if (r.thumbnails) {
          await sock.sendMessage(from, { image: { url: r.thumbnails }, caption });
        } else if (caption) {
          await sock.sendMessage(from, { text: caption });
        }

        await sock.sendMessage(from, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          fileName: `${(r.title || r.name || "track").replace(/[\\/:*?"<>|]/g, "")}.mp3`,
        });
      } catch (err) {
        console.error("[SPOTIFY] error:", err?.message || err);
        await sock.sendMessage(from, { text: "*Failed to fetch Spotify audio. Try another query later.*" });
      }
    },
  },
  {
    name: "text",
    desc: "Génère un texte stylisé : .text <style> <texte> (styles : metallic, ice, snow, neon, fire, matrix, glitch, thunder, purple, sand)",
    category: "Images & Stickers",
    run: async (sock, msg, { from, args }) => {
      const EPHOTO_STYLES = {
        metallic: "https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html",
        ice: "https://en.ephoto360.com/ice-text-effect-online-101.html",
        snow: "https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html",
        neon: "https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html",
        fire: "https://en.ephoto360.com/flame-lettering-effect-372.html",
        matrix: "https://en.ephoto360.com/matrix-text-effect-154.html",
        glitch: "https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html",
        thunder: "https://en.ephoto360.com/thunder-text-effect-online-97.html",
        purple: "https://en.ephoto360.com/purple-text-effect-online-100.html",
        sand: "https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html",
      };

      const style = (args[0] || "").toLowerCase();
      const text = args.slice(1).join(" ");

      if (!EPHOTO_STYLES[style] || !text) {
        return sock.sendMessage(from, {
          text:
            `Utilisation : .text <style> <texte>\n` +
            `Styles disponibles : ${Object.keys(EPHOTO_STYLES).join(", ")}\n` +
            `Ex : .text neon Ariel`,
        });
      }

      try {
        await sock.sendMessage(from, { text: `✨ Génération du texte "${style}" en cours...` });
        const result = await mumaker.ephoto(EPHOTO_STYLES[style], text);
        if (!result || !result.image) throw new Error("Pas d'image reçue");
        await sock.sendMessage(from, { image: { url: result.image }, caption: `✨ ${text}` });
      } catch (err) {
        console.error("Erreur .text :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Impossible de générer ce texte stylisé. Réessaie plus tard ou avec un autre style.",
        });
      }
    },
  },
  {
    name: "hacker",
    desc: "Génère un avatar hacker stylisé avec ton nom : .hacker <texte>",
    category: "Images & Stickers",
    run: async (sock, msg, { from, args }) => {
      // Vrai template ephoto360 "hacker cagoulé" : nom répété en cercle en
      // fond + silhouette du hacker devant (même rendu que l'exemple CHRISTY).
      // Ce template propose 3 variantes internes (Style 1/2/3, poses/teintes
      // différentes) que mumaker choisit au hasard à chaque appel — donc pas
      // besoin de gérer ça nous-mêmes, le rendu change déjà tout seul.
      const HACKER_URL = "https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html";

      const text = args.join(" ");

      if (!text) {
        return sock.sendMessage(from, {
          text: `Utilisation : .hacker <texte>\nEx : .hacker ARIEL`,
        });
      }

      try {
        await sock.sendMessage(from, { text: `🕶️ Génération de l'avatar hacker "${text}" en cours...` });
        const result = await mumaker.ephoto(HACKER_URL, text);
        if (!result || !result.image) throw new Error("Pas d'image reçue");
        await sock.sendMessage(from, { image: { url: result.image }, caption: `🕶️ ${text}` });
      } catch (err) {
        console.error("Erreur .hacker :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Impossible de générer cet avatar hacker. Réessaie plus tard.",
        });
      }
    },
  },
  {
    name: "tiktok",
    desc: "Télécharge une vidéo TikTok : .tiktok <lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const url = args[0];
      if (!url || !/tiktok\.com/i.test(url)) {
        return sock.sendMessage(from, { text: "Utilisation : .tiktok <lien TikTok>" });
      }
      await downloadAndSendVideo(sock, from, url, "TikTok");
    },
  },
  {
    name: "fb",
    desc: "Télécharge une vidéo Facebook : .fb <lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const url = args[0];
      if (!url || !/facebook\.com|fb\.watch/i.test(url)) {
        return sock.sendMessage(from, { text: "Utilisation : .fb <lien Facebook>" });
      }
      await downloadAndSendVideo(sock, from, url, "Facebook");
    },
  },
  {
    name: "gpt",
    desc: "Pose une question à l'IA : .gpt <question>",
    category: "IA",
    run: async (sock, msg, { from, args }) => {
      const prompt = args.join(" ");
      if (!prompt) {
        return sock.sendMessage(from, { text: "Utilisation : .gpt <ta question>" });
      }
      try {
        await sock.sendMessage(from, { text: "🤔 Réflexion en cours..." });
        const reply = await askGPT(prompt);
        await sock.sendMessage(from, { text: `🤖 ${reply}` });
      } catch (err) {
        console.error("Erreur .gpt :", err);
        if (err.message === "NO_API_KEY") {
          await sock.sendMessage(from, {
            text:
              "❌ Clé API Groq non configurée.\n\n" +
              "1️⃣ Va sur https://console.groq.com/keys et crée une clé gratuite\n" +
              "2️⃣ Envoie-moi : .grok_clé_api=TA_CLE_ICI (remplace par la clé, ex: gsk_xxxxx)\n" +
              "3️⃣ Redémarre le bot, puis retape .gpt",
          });
        } else if (err.message === "API_ERROR_401") {
          await sock.sendMessage(from, {
            text:
              "❌ Clé API Groq invalide ou expirée.\n\n" +
              "1️⃣ Va sur https://console.groq.com/keys et crée une nouvelle clé\n" +
              "2️⃣ Envoie-moi : .grok_clé_api=TA_NOUVELLE_CLE\n" +
              "3️⃣ Redémarre le bot, puis retape .gpt",
          });
        } else {
          await sock.sendMessage(from, { text: "❌ Erreur lors de la requête à l'IA. Réessaie plus tard." });
        }
      }
    },
  },
  {
    name: "song",
    desc: "Télécharge une musique YouTube (secours multi-API + conversion MP3) : .song <titre ou lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const query = args.join(" ").trim();
      if (!query) {
        return sock.sendMessage(from, { text: "Utilisation : .song <titre ou lien YouTube>" });
      }
      try {
        await downloadAndSendSong(sock, from, query);
      } catch (err) {
        console.error("Erreur .song :", err.message);
        await sock.sendMessage(from, { text: "❌ Échec du téléchargement." });
      }
    },
  },
  {
    name: "video",
    desc: "Télécharge une vidéo YouTube (recherche ou lien) : .video <titre ou lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const query = args.join(" ").trim();
      if (!query) {
        return sock.sendMessage(from, { text: "Utilisation : .video <titre ou lien YouTube>" });
      }
      try {
        await downloadAndSendSongVideo(sock, from, query);
      } catch (err) {
        console.error("Erreur .video :", err.message);
        await sock.sendMessage(from, { text: "❌ Échec du téléchargement." });
      }
    },
  },
  {
    name: "traduire",
    desc: "Traduit un texte : .traduire <code langue> <texte> ou en réponse à un message",
    category: "Traduction",
    run: async (sock, msg, { from, args }) => {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let lang;
      let text;

      if (quoted) {
        lang = (args[0] || "").trim();
        text = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || quoted.videoMessage?.caption || "";
      } else {
        lang = args[0];
        text = args.slice(1).join(" ");
      }

      if (!lang || !text) {
        return sock.sendMessage(from, {
          text:
            `╭─⭓ 🌐 *TRADUCTEUR*\n` +
            `│ • *.traduire <langue>* — en réponse à un message, le traduit\n` +
            `│ • *.traduire <langue> <texte>* — traduit le texte donné\n` +
            `╰────────\n\n` +
            "Exemple : .traduire fr hello\n" +
            "Codes courants : fr, en, es, de, it, pt, ru, ja, ko, zh, ar, hi",
        });
      }

      try {
        const translated = await translateText(text, lang);
        await sock.sendMessage(from, { text: translated });
      } catch (err) {
        console.error("Erreur .traduire :", err.message);
        await sock.sendMessage(from, { text: "❌ Échec de la traduction. Réessaie plus tard." });
      }
    },
  },
  {
    name: "trt",
    desc: "Alias de .traduire : .trt <code langue> <texte> ou en réponse à un message",
    category: "Traduction",
    run: async (sock, msg, { from, args }) => {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let lang;
      let text;

      if (quoted) {
        lang = (args[0] || "").trim();
        text = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || quoted.videoMessage?.caption || "";
      } else {
        lang = args[0];
        text = args.slice(1).join(" ");
      }

      if (!lang || !text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .trt <langue> <texte>  ou en réponse à un message : .trt <langue>",
        });
      }

      try {
        const translated = await translateText(text, lang);
        await sock.sendMessage(from, { text: translated });
      } catch (err) {
        console.error("Erreur .trt :", err.message);
        await sock.sendMessage(from, { text: "❌ Échec de la traduction. Réessaie plus tard." });
      }
    },
  },

  // ===================== GROUPE & MODÉRATION =====================
  {
    name: "tagall",
    desc: "Mentionne tous les membres du groupe (admin)",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { metadata, admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const message = args.join(" ") || "📢 Attention à tous !";
      const mentions = metadata.participants.map((p) => p.id);
      const list = metadata.participants.map((p) => `@${p.id.split("@")[0]}`).join(" ");
      await sock.sendMessage(from, { text: `${message}\n\n${list}`, mentions });
    },
  },
  {
    name: "hidetag",
    desc: "Envoie un message qui notifie tout le monde discrètement (admin)",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { metadata, admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const message = args.join(" ") || " ";
      const mentions = metadata.participants.map((p) => p.id);
      await sock.sendMessage(from, { text: message, mentions });
    },
  },
  {
    name: "kick",
    desc: "Exclut un membre (mention, réponse ou numéro) - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins, metadata } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      if (!isBotAdmin(sock, metadata)) {
        return sock.sendMessage(from, { text: "❌ Je dois être admin du groupe pour faire ça." });
      }
      const target = resolveTarget(msg, args);
      if (!target) {
        return sock.sendMessage(from, {
          text: "Mentionne, réponds au message de la personne, ou donne son numéro : .kick @membre",
        });
      }
      await sock.groupParticipantsUpdate(from, [target], "remove");
      await sock.sendMessage(from, { text: `👢 @${target.split("@")[0]} a été exclu.`, mentions: [target] });
    },
  },
  {
    name: "add",
    desc: "Ajoute un numéro au groupe - admin. Ex: .add 250788523990",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const target = resolveTarget(msg, args);
      if (!target) {
        return sock.sendMessage(from, { text: "Utilisation : .add 250788523990" });
      }
      await sock.groupParticipantsUpdate(from, [target], "add");
      await sock.sendMessage(from, { text: `✅ @${target.split("@")[0]} a été ajouté.`, mentions: [target] });
    },
  },
  {
    name: "promote",
    desc: "Promeut un membre admin (mention ou réponse) - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const target = resolveTarget(msg, args);
      if (!target) {
        return sock.sendMessage(from, { text: "Mentionne ou réponds à la personne à promouvoir." });
      }
      await sock.groupParticipantsUpdate(from, [target], "promote");
      await sock.sendMessage(from, { text: `⬆️ @${target.split("@")[0]} est maintenant admin.`, mentions: [target] });
    },
  },
  {
    name: "demote",
    desc: "Rétrograde un admin (mention ou réponse) - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const target = resolveTarget(msg, args);
      if (!target) {
        return sock.sendMessage(from, { text: "Mentionne ou réponds à la personne à rétrograder." });
      }
      await sock.groupParticipantsUpdate(from, [target], "demote");
      await sock.sendMessage(from, { text: `⬇️ @${target.split("@")[0]} n'est plus admin.`, mentions: [target] });
    },
  },
  {
    name: "group",
    desc: "Ouvre/ferme le groupe : .group open ou .group close - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      const action = (args[0] || "").toLowerCase();
      if (action !== "open" && action !== "close") {
        return sock.sendMessage(from, { text: "Utilisation : .group open  ou  .group close\n(ou plus simple : .open / .close / .ouvrir / .fermer)" });
      }
      await setGroupAnnouncement(sock, from, senderNumber, action === "close");
    },
  },
  {
    name: "close",
    desc: "Ferme le groupe : seuls les admins peuvent écrire - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber }) => {
      await setGroupAnnouncement(sock, from, senderNumber, true);
    },
  },
  {
    name: "open",
    desc: "Ouvre le groupe : tout le monde peut écrire - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber }) => {
      await setGroupAnnouncement(sock, from, senderNumber, false);
    },
  },
  {
    name: "fermer",
    desc: "Ferme le groupe : seuls les admins peuvent écrire - admin",
    category: "Groupe",
    hidden: true, // alias FR de .close, pas dupliqué dans le menu
    run: async (sock, msg, { from, senderNumber }) => {
      await setGroupAnnouncement(sock, from, senderNumber, true);
    },
  },
  {
    name: "ouvrir",
    desc: "Ouvre le groupe : tout le monde peut écrire - admin",
    category: "Groupe",
    hidden: true, // alias FR de .open, pas dupliqué dans le menu
    run: async (sock, msg, { from, senderNumber }) => {
      await setGroupAnnouncement(sock, from, senderNumber, false);
    },
  },
  {
    name: "antilink",
    desc: "Active/désactive la suppression auto des liens : .antilink on|off - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const action = (args[0] || "").toLowerCase();
      if (action !== "on" && action !== "off") {
        return sock.sendMessage(from, { text: "Utilisation : .antilink on  ou  .antilink off" });
      }
      setAntilink(from, action === "on");
      await sock.sendMessage(from, {
        text: action === "on"
          ? "🔗 Anti-lien activé : les liens seront supprimés automatiquement."
          : "🔗 Anti-lien désactivé.",
      });
    },
  },
  {
    name: "welcome",
    desc: "Active/désactive les messages de bienvenue ET d'au revoir du groupe : .welcome on|off - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const action = (args[0] || "").toLowerCase();
      if (action !== "on" && action !== "off") {
        return sock.sendMessage(from, { text: "Utilisation : .welcome on  ou  .welcome off" });
      }
      setWelcome(from, action === "on");
      await sock.sendMessage(from, {
        text: action === "on"
          ? "👋 Bienvenue/au revoir activés pour ce groupe."
          : "👋 Bienvenue/au revoir désactivés pour ce groupe.",
      });
    },
  },
  {
    name: "setwelcome",
    desc: "Personnalise le message de bienvenue : .setwelcome Salut {user} dans {group} ! - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const text = args.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .setwelcome <message>\nPlaceholders disponibles : {user} et {group}",
        });
      }
      setWelcomeMessage(from, text);
      await sock.sendMessage(from, { text: "✅ Message de bienvenue mis à jour." });
    },
  },
  {
    name: "setbye",
    desc: "Personnalise le message d'au revoir : .setbye {user} a quitté {group} - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      const text = args.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .setbye <message>\nPlaceholders disponibles : {user} et {group}",
        });
      }
      setByeMessage(from, text);
      await sock.sendMessage(from, { text: "✅ Message d'au revoir mis à jour." });
    },
  },
  {
    name: "antifake",
    desc: "Exclut auto les numéros dont l'indicatif n'est pas autorisé : .antifake on|off - admin",
    category: "Groupe",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      const { admins, metadata } = await getAdmins(sock, from);
      const senderJid = `${senderNumber}@s.whatsapp.net`;
      if (!admins.includes(senderJid) && senderNumber !== OWNER_NUMBER) {
        return sock.sendMessage(from, { text: "❌ Réservé aux admins du groupe." });
      }
      if (!isBotAdmin(sock, metadata)) {
        return sock.sendMessage(from, { text: "❌ Je dois être admin du groupe pour faire ça." });
      }
      const action = (args[0] || "").toLowerCase();
      if (action !== "on" && action !== "off") {
        return sock.sendMessage(from, { text: "Utilisation : .antifake on  ou  .antifake off" });
      }
      setAntifake(from, action === "on");
      const codes = (config.ANTIFAKE_ALLOWED_CODES || []).join(", ");
      await sock.sendMessage(from, {
        text: action === "on"
          ? `🛡️ Anti-fake activé : seuls les indicatifs [${codes}] seront acceptés.`
          : "🛡️ Anti-fake désactivé.",
      });
    },
  },
  {
    name: "update",
    desc: "Vérifie et applique les mises à jour du bot (propriétaire)",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }

      // Le code est PARTAGÉ entre toutes les instances publiques : seul
      // l'administrateur du serveur peut le mettre à jour (à la main).
      if (require("../lib/paths").IS_ORCHESTRATED) {
        return sock.sendMessage(from, {
          text: "❌ Les mises à jour sont gérées par l'administrateur du bot.",
        });
      }

      const projectRoot = path.join(__dirname, "..");
      const gitDir = path.join(projectRoot, ".git");

      // Pas de dépôt Git détecté : on tente une mise à jour par ZIP si un
      // lien a été configuré (config.js -> UPDATE_ZIP_URL), sinon on affiche
      // les instructions manuelles comme avant.
      if (!fs.existsSync(gitDir)) {
        const zipUrl = (config.UPDATE_ZIP_URL || "").trim();
        if (!zipUrl) {
          return sock.sendMessage(from, {
            text:
              "ℹ️ Ce bot n'a pas été installé via Git (pas de dossier .git détecté), " +
              "donc pas de mise à jour automatique possible ici.\n\n" +
              "Deux options :\n" +
              "1. Renseigne UPDATE_ZIP_URL dans config.js (lien \"Download ZIP\" du dépôt) pour que .update puisse se mettre à jour tout seul\n" +
              "2. Ou mets à jour manuellement : remplace tous les fichiers SAUF config.js et le dossier session/, relance `npm install`, redémarre le bot",
          });
        }

        await sock.sendMessage(from, { text: "🔄 Téléchargement de la mise à jour (ZIP)..." });
        try {
          await updateViaZip(projectRoot, zipUrl);
          await sock.sendMessage(from, { text: "📦 Installation des dépendances..." });
          await execFileAsync("npm", ["install"], { cwd: projectRoot });
          await sock.sendMessage(from, {
            text: "✅ Mise à jour terminée ! Redémarre le bot pour appliquer les changements.",
          });
        } catch (err) {
          console.error("Erreur .update (ZIP) :", err);
          await sock.sendMessage(from, {
            text: `❌ Échec de la mise à jour ZIP :\n${String(err.message || err).slice(0, 500)}`,
          });
        }
        return;
      }

      await sock.sendMessage(from, { text: "🔄 Recherche de mises à jour..." });
      try {
        const { stdout: pullOut } = await execFileAsync("git", ["pull"], { cwd: projectRoot });

        if (/Already up to date/i.test(pullOut)) {
          return sock.sendMessage(from, { text: "✅ Le bot est déjà à jour, rien à faire." });
        }

        await sock.sendMessage(from, {
          text: `✅ Mise à jour téléchargée :\n${pullOut.trim().slice(0, 800)}\n\n📦 Installation des dépendances...`,
        });

        await execFileAsync("npm", ["install"], { cwd: projectRoot });

        await sock.sendMessage(from, {
          text: "✅ Mise à jour terminée ! Redémarre le bot pour appliquer les changements.",
        });
      } catch (err) {
        console.error("Erreur .update :", err);
        const text = err.message?.includes("ENOENT")
          ? "❌ Git n'est pas disponible sur cet hébergement. Mise à jour manuelle nécessaire (voir README)."
          : "❌ Échec de la mise à jour. Vérifie la console du serveur pour le détail de l'erreur.";
        await sock.sendMessage(from, { text });
      }
    },
  },
  {
    name: "restart",
    desc: "Redémarre le bot (propriétaire)",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }

      await sock.sendMessage(from, {
        text: "🔄 Redémarrage en cours... Le bot revient dans quelques secondes.",
      });

      // On quitte le process avec un code d'erreur (1) plutôt que 0 : la
      // plupart des panels d'hébergement (Katabump, Pterodactyl, OptikLink...)
      // ne relancent automatiquement le process QUE lorsqu'il se termine
      // comme un "crash" (code non nul). Un exit(0) est souvent traité comme
      // un arrêt volontaire et ne redémarre pas tout seul.
      // Petit délai pour laisser le temps au message WhatsApp de partir
      // avant que le process ne s'arrête.
      setTimeout(() => process.exit(1), 1500);
    },
  },
  {
    name: "poll",
    desc: "Crée un sondage WhatsApp : .poll Question | Option1 | Option2 | ...",
    category: "Utilitaires",
    run: async (sock, msg, { from, args }) => {
      const parts = args
        .join(" ")
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 3) {
        return sock.sendMessage(from, {
          text:
            "Utilisation : .poll Question | Option1 | Option2 | Option3...\n" +
            "(la question, puis au moins 2 options, séparées par des |)",
        });
      }
      const [name, ...values] = parts;
      try {
        await sock.sendMessage(from, { poll: { name, values, selectableCount: 1 } });
      } catch (err) {
        console.error("Erreur .poll :", err);
        await sock.sendMessage(from, { text: "❌ Impossible de créer le sondage." });
      }
    },
  },
  {
    name: "meteo",
    desc: "Donne la météo actuelle d'une ville : .meteo Abidjan",
    category: "Infos & Recherche",
    run: async (sock, msg, { from, args }) => {
      const city = args.join(" ").trim();
      if (!city) {
        return sock.sendMessage(from, { text: "Utilisation : .meteo <ville>\nExemple : .meteo Abidjan" });
      }
      try {
        const { data: geo } = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
          params: { name: city, count: 1, language: "fr" },
          timeout: 10000,
        });
        if (!geo.results || geo.results.length === 0) {
          return sock.sendMessage(from, { text: "❌ Ville introuvable." });
        }
        const { latitude, longitude, name, country } = geo.results[0];
        const { data: weather } = await axios.get("https://api.open-meteo.com/v1/forecast", {
          params: {
            latitude,
            longitude,
            current:
              "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature",
            timezone: "auto",
          },
          timeout: 10000,
        });
        const c = weather.current;
        const text =
          `📍 *${name}, ${country}*\n\n` +
          `${weatherCodeToText(c.weather_code)}\n` +
          `🌡️ Température : ${c.temperature_2m}°C (ressenti ${c.apparent_temperature}°C)\n` +
          `💧 Humidité : ${c.relative_humidity_2m}%\n` +
          `💨 Vent : ${c.wind_speed_10m} km/h`;
        await sock.sendMessage(from, { text });
      } catch (err) {
        console.error("Erreur .meteo :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de récupérer la météo." });
      }
    },
  },
  {
    name: "indispo",
    desc: "Active le mode absent (réponse auto à qui t'écrit en DM) : .indispo [message] - propriétaire",
    category: "Général",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const message = args.join(" ").trim() || "Je suis absent pour le moment, je reviens bientôt !";
      setAfk(true, message);
      await sock.sendMessage(from, {
        text: `🌙 Mode absent activé.\nMessage envoyé à qui t'écrit en DM : "${message}"\n\nIl se désactive automatiquement dès que tu écris un message normalement, ou avec .dispo.`,
      });
    },
  },
  {
    name: "dispo",
    desc: "Désactive le mode absent - propriétaire",
    category: "Général",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      setAfk(false, "");
      await sock.sendMessage(from, { text: "☀️ Mode absent désactivé." });
    },
  },
  {
    name: "absent",
    desc: "Réponse automatique persistante à qui t'écrit en DM : .absent on <message> / .absent off - propriétaire",
    category: "Général",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const sub = (args[0] || "").toLowerCase();
      if (sub === "off") {
        setAutoReply(false);
        return sock.sendMessage(from, { text: "🔕 Réponse automatique désactivée." });
      }
      if (sub === "on") {
        const message = args.slice(1).join(" ").trim() || "Je ne suis pas disponible pour le moment, je reviens vers toi dès que possible.";
        setAutoReply(true, message);
        return sock.sendMessage(from, {
          text: `🤖 Réponse automatique activée.\nMessage envoyé à qui t'écrit en DM : "${message}"\n\nContrairement à .indispo, elle reste active tant que tu ne fais pas .absent off (même après un redémarrage du bot).`,
        });
      }
      const state = isAutoReplyActive() ? "activée ✅" : "désactivée ❌";
      return sock.sendMessage(from, {
        text:
          `┏━━◆ 🤖 *RÉPONSE AUTOMATIQUE* ◆━━┓\n` +
          `┃ État : ${state}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `╭─⭓ 📖 *COMMANDES*\n` +
          `│ • *.absent on <message>* — répond ce message à qui t'écrit\n` +
          `│ • *.absent off* — désactive la réponse auto\n` +
          `╰────────`,
      });
    },
  },
  {
    name: "chatbot",
    desc: "L'IA répond à ta place à qui t'écrit en DM, message par message : .chatbot on / .chatbot off - propriétaire",
    category: "Général",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const sub = (args[0] || "").toLowerCase();
      if (sub === "off") {
        setChatbot(false);
        return sock.sendMessage(from, { text: "🔕 Chatbot IA désactivé." });
      }
      if (sub === "exclude") {
        const number = (args[1] || "").replace(/\D/g, "");
        if (!number) {
          return sock.sendMessage(from, { text: "Utilisation : .chatbot exclude <numéro>" });
        }
        excludeFromChatbot(number);
        return sock.sendMessage(from, { text: `🚫 Le chatbot ne répondra plus à ${number}.` });
      }
      if (sub === "include") {
        const number = (args[1] || "").replace(/\D/g, "");
        if (!number) {
          return sock.sendMessage(from, { text: "Utilisation : .chatbot include <numéro>" });
        }
        includeInChatbot(number);
        return sock.sendMessage(from, { text: `✅ Le chatbot répondra de nouveau à ${number}.` });
      }
      if (sub === "excluded") {
        const list = getChatbotExcluded();
        if (!list.length) {
          return sock.sendMessage(from, { text: "Aucun contact exclu du chatbot." });
        }
        return sock.sendMessage(from, {
          text: "🚫 Contacts exclus du chatbot :\n" + list.map((n) => `- ${n}`).join("\n"),
        });
      }
      if (sub === "on") {
        if (!GROQ_API_KEY || GROQ_API_KEY === "COLLE_TA_CLE_GROQ_ICI") {
          return sock.sendMessage(from, {
            text:
              "❌ Clé API Groq non configurée, le chatbot ne peut pas répondre sans elle.\n\n" +
              "1️⃣ Va sur https://console.groq.com/keys et crée une clé gratuite\n" +
              "2️⃣ Envoie-moi : .grok_clé_api=TA_CLE_ICI\n" +
              "3️⃣ Redémarre le bot, puis retape .chatbot on",
          });
        }
        setChatbot(true);
        return sock.sendMessage(from, {
          text:
            "🤖 Chatbot IA activé.\n\n" +
            "Chaque message reçu en privé aura une réponse générée par l'IA, comme si tu répondais toi-même — peu importe ce qu'on t'écrit. Ça continue de fonctionner même si ton téléphone est éteint, tant que le bot tourne sur ton panel.\n\n" +
            "Astuce : active aussi .online on pour paraître en ligne en permanence pendant que le chatbot répond à ta place.\n\n" +
            ".chatbot off pour désactiver.",
        });
      }
      const state = isChatbotActive() ? "activé ✅" : "désactivé ❌";
      return sock.sendMessage(from, {
        text:
          `┏━━◆ 🤖 *CHATBOT IA* ◆━━┓\n` +
          `┃ État : ${state}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `╭─⭓ 📖 *COMMANDES*\n` +
          `│ • *.chatbot on* — l'IA répond à ta place en DM\n` +
          `│ • *.chatbot off* — désactive le chatbot\n` +
          `│ • *.chatbot exclude <numéro>* — ce contact n'a plus de réponse auto\n` +
          `│ • *.chatbot include <numéro>* — réactive ce contact\n` +
          `│ • *.chatbot excluded* — affiche la liste des exclus\n` +
          `╰────────`,
      });
    },
  },
  {
    name: "autosticker",
    desc: "Enregistre automatiquement tous les stickers reçus (DM et groupes) : .autosticker on / .autosticker off - propriétaire",
    category: "Général",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const sub = (args[0] || "").toLowerCase();
      if (sub === "off") {
        setAutoStickerSave(false);
        return sock.sendMessage(from, { text: "🔕 Enregistrement automatique des stickers désactivé." });
      }
      if (sub === "on") {
        setAutoStickerSave(true);
        return sock.sendMessage(from, {
          text:
            "🖼️ Enregistrement automatique des stickers activé.\n\n" +
            "Chaque sticker reçu (en privé OU dans un groupe) sera automatiquement renvoyé dans ta conversation \"Vous\" sur WhatsApp — tu le retrouveras directement dans l'app, comme n'importe quel sticker reçu.\n\n" +
            ".autosticker off pour désactiver.",
        });
      }
      const state = isAutoStickerSaveActive() ? "activé ✅" : "désactivé ❌";
      return sock.sendMessage(from, {
        text:
          `┏━━◆ 🖼️ *AUTO-STICKER* ◆━━┓\n` +
          `┃ État : ${state}\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `╭─⭓ 📖 *COMMANDES*\n` +
          `│ • *.autosticker on* — renvoie chaque sticker reçu dans ta conv "Vous"\n` +
          `│ • *.autosticker off* — désactive l'enregistrement\n` +
          `╰────────`,
      });
    },
  },
  {
    name: "lyrics",
    desc: "Paroles d'une chanson : .lyrics <artiste> - <titre> (ou juste le titre)",
    category: "Infos & Recherche",
    run: async (sock, msg, { from, args }) => {
      const text = args.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .lyrics <artiste> - <titre>\nExemple : .lyrics Stromae - Alors on danse\n(ou juste .lyrics Alors on danse)",
        });
      }
      try {
        let artist, title;
        if (text.includes(" - ")) {
          [artist, title] = text.split(" - ").map((s) => s.trim());
        } else {
          // Pas d'artiste précisé : on cherche via YouTube pour deviner l'artiste
          const search = await yts(text);
          const top = search.videos?.[0];
          if (top?.author?.name) {
            artist = top.author.name.replace(/ - Topic$/i, "").trim();
            title = text;
          } else {
            artist = "";
            title = text;
          }
        }
        const { data } = await axios.get(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
          { timeout: 15000 }
        );
        if (!data?.lyrics) {
          return sock.sendMessage(from, { text: "❌ Paroles introuvables pour cette chanson." });
        }
        const lyrics = data.lyrics.trim();
        const header = `🎤 *${artist || "?"} - ${title}*\n\n`;
        // WhatsApp coupe les très longs messages ; on tronque proprement au besoin
        const full = header + lyrics;
        await sock.sendMessage(from, {
          text: full.length > 4000 ? full.slice(0, 4000) + "\n\n[...texte tronqué...]" : full,
        });
      } catch (err) {
        console.error("Erreur .lyrics :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Paroles introuvables. Essaie le format : .lyrics <artiste> - <titre>",
        });
      }
    },
  },
  {
    name: "qrcode",
    desc: "Génère un QR code : .qrcode <texte/lien>",
    category: "Utilitaires",
    run: async (sock, msg, { from, args }) => {
      const content = args.join(" ").trim();
      if (!content) {
        return sock.sendMessage(from, { text: "Utilisation : .qrcode <texte ou lien>\nExemple : .qrcode https://wa.me/1234567890" });
      }
      try {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(content)}`;
        const { data } = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
        await sock.sendMessage(from, {
          image: Buffer.from(data),
          caption: `📷 QR code généré pour :\n${content}`,
        });
      } catch (err) {
        console.error("Erreur .qrcode :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de générer le QR code." });
      }
    },
  },
  {
    name: "shorturl",
    desc: "Raccourcit un lien : .shorturl <lien>",
    category: "Utilitaires",
    run: async (sock, msg, { from, args }) => {
      const link = args.join(" ").trim();
      if (!link || !/^https?:\/\//i.test(link)) {
        return sock.sendMessage(from, { text: "Utilisation : .shorturl <lien complet>\nExemple : .shorturl https://exemple.com/une-tres-longue-url" });
      }
      try {
        const { data } = await axios.get("https://is.gd/create.php", {
          params: { format: "simple", url: link },
          timeout: 15000,
        });
        if (typeof data === "string" && data.startsWith("Error")) {
          return sock.sendMessage(from, { text: `❌ ${data}` });
        }
        await sock.sendMessage(from, { text: `🔗 Lien raccourci :\n${data}` });
      } catch (err) {
        console.error("Erreur .shorturl :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de raccourcir ce lien." });
      }
    },
  },
  {
    name: "currency",
    desc: "Convertit une devise : .currency <montant> <de> <vers> (ex: .currency 100 USD EUR)",
    category: "Infos & Recherche",
    run: async (sock, msg, { from, args }) => {
      const [amountRaw, from_, to_] = args;
      const amount = parseFloat(amountRaw);
      if (!amount || !from_ || !to_) {
        return sock.sendMessage(from, {
          text: "Utilisation : .currency <montant> <de> <vers>\nExemple : .currency 100 USD EUR",
        });
      }
      try {
        const { data } = await axios.get("https://api.frankfurter.app/latest", {
          params: { amount, from: from_.toUpperCase(), to: to_.toUpperCase() },
          timeout: 15000,
        });
        const result = data.rates?.[to_.toUpperCase()];
        if (result === undefined) {
          return sock.sendMessage(from, { text: "❌ Devise non reconnue (essaie des codes comme USD, EUR, XOF, GBP...)." });
        }
        await sock.sendMessage(from, {
          text: `💱 ${amount} ${from_.toUpperCase()} = *${result} ${to_.toUpperCase()}*\n(taux du ${data.date})`,
        });
      } catch (err) {
        console.error("Erreur .currency :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de convertir. Vérifie les codes de devises (ex: USD, EUR, XOF)." });
      }
    },
  },
  {
    name: "base64",
    desc: "Encode/décode en base64 : .base64 encode <texte> | .base64 decode <texte>",
    category: "Utilitaires",
    run: async (sock, msg, { from, args }) => {
      const mode = (args[0] || "").toLowerCase();
      const text = args.slice(1).join(" ");
      if (!["encode", "decode"].includes(mode) || !text) {
        return sock.sendMessage(from, {
          text: "Utilisation :\n.base64 encode <texte>\n.base64 decode <texte_encodé>",
        });
      }
      try {
        const result =
          mode === "encode"
            ? Buffer.from(text, "utf8").toString("base64")
            : Buffer.from(text, "base64").toString("utf8");
        await sock.sendMessage(from, { text: `🔐 Résultat :\n${result}` });
      } catch (err) {
        await sock.sendMessage(from, { text: "❌ Impossible de traiter ce texte (base64 invalide ?)." });
      }
    },
  },
  {
    name: "listadmins",
    desc: "Liste les admins du groupe",
    category: "Groupe",
    run: async (sock, msg, { from }) => {
      if (!isGroup(from)) {
        return sock.sendMessage(from, { text: "Cette commande fonctionne seulement dans un groupe." });
      }
      try {
        const { admins } = await getAdmins(sock, from);
        if (!admins.length) {
          return sock.sendMessage(from, { text: "❌ Aucun admin trouvé (ou métadonnées indisponibles)." });
        }
        const text =
          `👑 *Admins du groupe (${admins.length})*\n\n` +
          admins.map((jid, i) => `${i + 1}. @${jid.split("@")[0]}`).join("\n");
        await sock.sendMessage(from, { text, mentions: admins });
      } catch (err) {
        console.error("Erreur .listadmins :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de récupérer la liste des admins." });
      }
    },
  },
];

// ----- Commandes ajoutées : profil (pp/fullpp/block/unblock/whois/gjid) et
// statuts (setstatus/scstatus) — voir commands/profile-status.js -----
const profileStatusCommands = require("./profile-status");
commands.push(...profileStatusCommands);

// ----- Commande ajoutée : wallpaper (.wall / .wallpaper) — voir
// commands/wallpaper.js -----
const wallpaperCommands = require("./wallpaper");
commands.push(...wallpaperCommands);

// ----- Commande ajoutée : bible (.bible / .verset / .lsg) — voir
// commands/bible.js -----
const bibleCommands = require("./bible");
commands.push(...bibleCommands);

// ----- Commande ajoutée : téléchargement via API RapidAPI (.dl) — voir
// commands/dl.js -----
const dlCommands = require("./dl");
commands.push(...dlCommands);

// ----- Commande ajoutée : statistiques de blocage (.blockstats) — voir
// blocklist-store.js (historique) + commands/blockstats.js -----
const blockstatsCommands = require("./blockstats");
commands.push(...blockstatsCommands);

// ----- Commande ajoutée : compression média (.compress) — voir
// commands/compress.js -----
const compressCommands = require("./compress");
commands.push(...compressCommands);

// ----- Commande ajoutée : texte-vers-audio (.tovoice) — voir
// commands/tovoice.js -----
const tovoiceCommands = require("./tovoice");
commands.push(...tovoiceCommands);

// ----- Commande ajoutée : texte élégant / formes ASCII (.style/.joli,
// .forme/.shape) — voir commands/elegant.js -----
const elegantCommands = require("./elegant");
commands.push(...elegantCommands);

// ----- Fin des commandes -----

module.exports = commands;
module.exports.getMenuImageBuffer = getMenuImageBuffer;
module.exports.preloadMenuAudioBuffers = preloadMenuAudioBuffers;
module.exports.initScheduledStatuses = profileStatusCommands.initScheduledStatuses;
module.exports.askGPT = askGPT;
