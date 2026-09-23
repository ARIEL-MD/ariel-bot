// ===================== ÉTAT PARTAGÉ (avec persistance) =====================
// Petites données partagées entre commands/index.js et features.js.
// Les réglages (.online, .anti_delete, etc.) sont maintenant aussi
// sauvegardés dans un fichier JSON pour survivre aux redémarrages du bot
// (avant, tout revenait aux valeurs par défaut de config.js à chaque
// redémarrage, même si tu avais activé un réglage juste avant).
// ==============================================================================

const fs = require("fs");
const path = require("path");
const config = require("./config");

const { DATA_DIR } = require("./lib/paths");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Heure de démarrage du bot (pour .runtime)
const START_TIME = Date.now();

// Heure de la dernière (re)connexion WhatsApp effective ("open"). Mise à jour
// à CHAQUE reconnexion (contrairement à START_TIME, fixé une seule fois).
// Sert de référence pour ignorer tout ce qui est antérieur à la connexion
// en cours — messages ET statuts — même quand le process Node ne redémarre
// pas vraiment (juste une coupure/reprise WhatsApp).
let lastConnectionOpenAt = Date.now();

function setLastConnectionOpenAt(ts) {
  lastConnectionOpenAt = ts;
}
function getLastConnectionOpenAt() {
  return lastConnectionOpenAt;
}

// Anti-lien : activé/désactivé par groupe. Si un groupe n'a pas de valeur
// ici, on retombe sur config.ANTI_LINK par défaut.
const antilinkState = new Map();

function isAntilinkEnabled(jid) {
  return antilinkState.has(jid) ? antilinkState.get(jid) : config.ANTI_LINK;
}

function setAntilink(jid, enabled) {
  antilinkState.set(jid, enabled);
}

// --- Bienvenue / au revoir : activé/désactivé + message, par groupe ---
const welcomeState = new Map(); // jid -> bool
const welcomeMessages = new Map(); // jid -> texte perso ("{user}" / "{group}")
const byeMessages = new Map();

const DEFAULT_WELCOME_MSG = "👋 Bienvenue {user} dans *{group}* !";
const DEFAULT_BYE_MSG = "😢 {user} a quitté *{group}*.";

function isWelcomeEnabled(jid) {
  return welcomeState.has(jid) ? welcomeState.get(jid) : config.WELCOME;
}
function setWelcome(jid, enabled) {
  welcomeState.set(jid, enabled);
}
function getWelcomeMessage(jid) {
  return welcomeMessages.get(jid) || DEFAULT_WELCOME_MSG;
}
function setWelcomeMessage(jid, text) {
  welcomeMessages.set(jid, text);
}
function getByeMessage(jid) {
  return byeMessages.get(jid) || DEFAULT_BYE_MSG;
}
function setByeMessage(jid, text) {
  byeMessages.set(jid, text);
}

// --- Anti-fake : activé/désactivé par groupe ---
const antifakeState = new Map();

function isAntifakeEnabled(jid) {
  return antifakeState.has(jid) ? antifakeState.get(jid) : config.ANTIFAKE;
}
function setAntifake(jid, enabled) {
  antifakeState.set(jid, enabled);
}

// --- Mode absent (.indispo) : un seul état global (le bot tourne sur TON
// numéro), avec le message laissé et l'heure d'activation. ---
let afkState = { active: false, message: "", since: 0 };

function isAfkActive() {
  return afkState.active;
}
function setAfk(active, message = "") {
  afkState = { active, message, since: active ? Date.now() : 0 };
}
function getAfkMessage() {
  return afkState.message;
}
function getAfkSince() {
  return afkState.since;
}

// Réglages globaux activables/désactivables par commande (.online, etc.)
// Si non modifié depuis le démarrage, on retombe sur la valeur de config.js.
const settings = new Map();

// --- Chargement depuis settings.json au démarrage (si le fichier existe) ---
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    for (const [key, value] of Object.entries(saved)) {
      settings.set(key, value);
    }
  }
} catch (e) {
  console.log("Erreur lecture settings.json (ignorée, valeurs par défaut utilisées):", e.message);
}

// --- Sauvegarde sur disque à chaque changement ---
function persistSettings() {
  try {
    const obj = Object.fromEntries(settings);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.log("Erreur écriture settings.json :", e.message);
  }
}

// --- Réponse automatique (.absent) : contrairement à .indispo, l'état est
// PERSISTÉ sur disque (dans settings.json, via persistSettings) et ne se
// désactive jamais tout seul (ni au redémarrage, ni quand tu écris un
// message). Seul .absent off l'arrête. Pensé pour tourner en continu
// (ex: message "je réponds plus tard" pendant plusieurs jours), là où
// .indispo est prévu pour une absence courte et se coupe automatiquement.
function isAutoReplyActive() {
  return settings.has("AUTOREPLY_ACTIVE") ? settings.get("AUTOREPLY_ACTIVE") : false;
}
function setAutoReply(active, message) {
  settings.set("AUTOREPLY_ACTIVE", active);
  if (message !== undefined) settings.set("AUTOREPLY_MESSAGE", message);
  persistSettings();
}
function getAutoReplyMessage() {
  return settings.has("AUTOREPLY_MESSAGE") ? settings.get("AUTOREPLY_MESSAGE") : "";
}

// --- Chatbot IA (.chatbot) : comme .absent, l'état est PERSISTÉ sur
// disque et reste actif tant que .chatbot off n'est pas exécuté (même après
// un redémarrage du bot, et même si TA connexion/téléphone est éteint,
// puisque c'est le process du bot lui-même — hébergé séparément — qui
// répond). Contrairement à .absent (message fixe identique à tout le
// monde), chaque réponse est générée par l'IA à partir du message reçu.
function isChatbotActive() {
  return settings.has("CHATBOT_ACTIVE") ? settings.get("CHATBOT_ACTIVE") : false;
}
function setChatbot(active) {
  settings.set("CHATBOT_ACTIVE", active);
  persistSettings();
}

// --- Liste d'exclusion du chatbot (.chatbot exclude/include <numéro>) :
// contacts pour qui le chatbot ne doit JAMAIS répondre, même s'ils saluent.
// Persistée sur disque comme le reste, pour survivre aux redémarrages.
function getChatbotExcluded() {
  return settings.has("CHATBOT_EXCLUDED") ? settings.get("CHATBOT_EXCLUDED") : [];
}
function isChatbotExcluded(number) {
  return getChatbotExcluded().includes(number);
}
function excludeFromChatbot(number) {
  const list = getChatbotExcluded();
  if (!list.includes(number)) {
    list.push(number);
    settings.set("CHATBOT_EXCLUDED", list);
    persistSettings();
  }
}
function includeInChatbot(number) {
  const list = getChatbotExcluded().filter((n) => n !== number);
  settings.set("CHATBOT_EXCLUDED", list);
  persistSettings();
}

// --- Enregistrement automatique des stickers reçus (.autosticker) : comme
// .chatbot, l'état est PERSISTÉ sur disque et reste actif tant que
// .autosticker off n'est pas exécuté, même après un redémarrage du bot.
// Fonctionne en DM ET en groupe (voir index.js -> messages.upsert).
function isAutoStickerSaveActive() {
  return settings.has("AUTOSTICKER_ACTIVE") ? settings.get("AUTOSTICKER_ACTIVE") : false;
}
function setAutoStickerSave(active) {
  settings.set("AUTOSTICKER_ACTIVE", active);
  persistSettings();
}

// ===================== ANTI-RÉEXÉCUTION DES COMMANDES (persistant) =====================
// Avant : la liste des IDs de messages déjà traités n'existait qu'en mémoire
// (perdue à chaque redémarrage du process). Résultat : si l'hébergeur
// redémarre le bot (crash, manque de RAM, etc.) et que WhatsApp redélivre
// un message déjà traité juste avant, le bot "oubliait" l'avoir déjà exécuté
// et le rejouait une deuxième fois. On sauvegarde donc ces IDs sur le disque
// (processed-ids.json), comme pour settings.json, pour que ça survive à
// TOUS les redémarrages, pas seulement à un simple .restart interne.
const PROCESSED_IDS_FILE = path.join(DATA_DIR, "processed-ids.json");
const MAX_PROCESSED_IDS = 3000; // largement assez pour ne jamais confondre 2 commandes différentes

let processedIds = [];
let processedIdsSet = new Set();

try {
  if (fs.existsSync(PROCESSED_IDS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PROCESSED_IDS_FILE, "utf8"));
    if (Array.isArray(saved)) {
      processedIds = saved;
      processedIdsSet = new Set(saved);
    }
  }
} catch (e) {
  console.log("Erreur lecture processed-ids.json (ignorée, liste vide au départ):", e.message);
}

// AVANT : cette sauvegarde tournait en fs.writeFileSync (BLOQUANT) et était
// appelée à CHAQUE message reçu, groupes compris — donc à chaque message, le
// bot se figeait le temps de réécrire tout le fichier (jusqu'à 3000 IDs) sur
// le disque avant de pouvoir traiter la suite (y compris tes propres
// commandes). C'était la cause principale de la lenteur ressentie. On passe
// donc à une écriture ASYNCHRONE (fs.writeFile, ne bloque plus le bot) et en
// plus DÉBOUNCÉE : plusieurs messages qui arrivent en rafale (ex: groupe
// actif) ne déclenchent qu'UNE seule écriture disque groupée un peu plus
// tard, au lieu d'une écriture complète par message.
const PERSIST_DEBOUNCE_MS = 1500;
let persistPending = false;
let persistTimer = null;

function flushProcessedIds() {
  persistTimer = null;
  if (!persistPending) return;
  persistPending = false;
  fs.writeFile(PROCESSED_IDS_FILE, JSON.stringify(processedIds), "utf8", (e) => {
    if (e) console.log("Erreur écriture processed-ids.json :", e.message);
  });
}

function persistProcessedIds() {
  persistPending = true;
  if (persistTimer) return; // une écriture est déjà programmée, rien à faire de plus
  persistTimer = setTimeout(flushProcessedIds, PERSIST_DEBOUNCE_MS);
  // Ne bloque jamais l'arrêt du process pour ce minuteur (utile en cas de
  // .restart/kill pendant la fenêtre de débounce).
  if (persistTimer.unref) persistTimer.unref();
}

// Écrit immédiatement tout écriture en attente (utilisé à l'arrêt propre du
// process, pour ne pas perdre les derniers IDs traités juste avant un
// redémarrage).
function flushProcessedIdsSync() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (!persistPending) return;
  persistPending = false;
  try {
    fs.writeFileSync(PROCESSED_IDS_FILE, JSON.stringify(processedIds), "utf8");
  } catch (e) {
    console.log("Erreur écriture processed-ids.json (flush) :", e.message);
  }
}
process.on("exit", flushProcessedIdsSync);

// true si ce message a DÉJÀ été traité un jour (même avant un redémarrage)
function isMessageProcessed(id) {
  return !!id && processedIdsSet.has(id);
}

// Marque ce message comme traité, de façon durable (survit aux redémarrages)
function markMessageProcessed(id) {
  if (!id || processedIdsSet.has(id)) return;
  processedIdsSet.add(id);
  processedIds.push(id);
  // Purge des plus anciens si la liste devient trop grande (évite un fichier
  // qui grossit indéfiniment), tout en gardant largement de quoi couvrir les
  // redémarrages rapprochés.
  if (processedIds.length > MAX_PROCESSED_IDS) {
    const removed = processedIds.shift();
    processedIdsSet.delete(removed);
  }
  persistProcessedIds();
}

// Nom de la clé (dans config.js) -> nom lisible en français pour .settings
const TOGGLES = {
  ALWAYS_ONLINE: "Toujours en ligne",
  ANTI_DELETE: "Anti-suppression",
  ANTI_VV: "Anti-vue-unique",
  ANTI_CALL: "Anti-appel",
  AUTO_READ: "Lecture automatique",
};

function getSetting(key) {
  return settings.has(key) ? settings.get(key) : config[key];
}

function setSetting(key, value) {
  settings.set(key, value);
  persistSettings();
}

module.exports = {
  START_TIME,
  setLastConnectionOpenAt,
  getLastConnectionOpenAt,
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
  getAfkSince,
  isAutoReplyActive,
  setAutoReply,
  getAutoReplyMessage,
  isChatbotActive,
  setChatbot,
  getChatbotExcluded,
  isChatbotExcluded,
  excludeFromChatbot,
  includeInChatbot,
  isAutoStickerSaveActive,
  setAutoStickerSave,
  getSetting,
  setSetting,
  TOGGLES,
  isMessageProcessed,
  markMessageProcessed,
};
