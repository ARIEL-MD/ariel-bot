// ===================== HISTORIQUE DE LA LISTE DE BLOCAGE =====================
// Baileys ne donne pas nativement un historique : juste un événement
// "blocklist.set" (l'état complet, envoyé une fois à la connexion) et
// "blocklist.update" (les changements, avec type "add"/"remove"). Ce module
// écoute ces deux événements et mémorise tout, au fur et à mesure, dans
// blocklist-history.json — pour que .blockstats puisse répondre même après
// un redémarrage du bot.
// ================================================================================

const fs = require("fs");
const path = require("path");

const { DATA_DIR } = require("./lib/paths");
const FILE = path.join(DATA_DIR, "blocklist-history.json");

// Nombre max d'événements gardés en mémoire/disque (évite un fichier qui
// grossit indéfiniment sur un très long historique).
const MAX_HISTORY = 500;

let current = new Set(); // jids actuellement bloqués, d'après les événements observés
let history = []; // [{ jid, action: "block" | "unblock", at: <timestamp ms> }]

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    current = new Set(Array.isArray(data.current) ? data.current : []);
    history = Array.isArray(data.history) ? data.history : [];
  } catch {
    current = new Set();
    history = [];
  }
}
load();

function save() {
  try {
    fs.writeFileSync(
      FILE,
      JSON.stringify({ current: [...current], history }, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("Erreur sauvegarde blocklist-history.json :", e.message);
  }
}

function recordEvent(jid, action) {
  history.push({ jid, action, at: Date.now() });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
}

// Branche les écouteurs sur le socket Baileys pour remplir l'historique
// tout seul, sans action de l'utilisateur.
function init(sock) {
  // Snapshot complète envoyée par WhatsApp à la connexion. La toute première
  // fois (aucune donnée mémorisée avant), on enregistre chaque entrée comme
  // "déjà bloqué" pour que .blockstats ait quelque chose à montrer dès le
  // départ. Les fois suivantes (reconnexions), on met juste à jour l'état
  // courant sans dupliquer d'événements dans l'historique.
  sock.ev.on("blocklist.set", ({ blocklist }) => {
    const list = Array.isArray(blocklist) ? blocklist : [];
    const isFirstLoad = current.size === 0 && history.length === 0;
    current = new Set(list);
    if (isFirstLoad) {
      for (const jid of list) recordEvent(jid, "block");
    }
    save();
  });

  sock.ev.on("blocklist.update", ({ blocklist, type }) => {
    const list = Array.isArray(blocklist) ? blocklist : [];
    const action = type === "remove" ? "unblock" : "block";
    for (const jid of list) {
      if (action === "block") current.add(jid);
      else current.delete(jid);
      recordEvent(jid, action);
    }
    save();
  });
}

function getBlocklistData() {
  return { current: [...current], history: [...history] };
}

module.exports = { init, getBlocklistData };
