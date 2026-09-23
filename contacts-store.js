// ===================== CARNET DE CONTACTS AUTOMATIQUE =====================
// Baileys ne synchronise pas nativement "tous mes contacts" comme
// l'application officielle. Ce petit module observe les événements normaux
// de la connexion (historique, contacts, discussions, messages reçus) et
// mémorise au fur et à mesure les numéros croisés, dans known-contacts.json.
//
// Utilisé par .setstatus / .scstatus quand on ne précise aucun numéro :
// le statut part alors vers tous les contacts déjà connus du bot, sans rien
// avoir à taper.
// ============================================================================

const fs = require("fs");
const path = require("path");

const { DATA_DIR } = require("./lib/paths");
const FILE = path.join(DATA_DIR, "known-contacts.json");

let known = new Set();

function load() {
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, "utf8"));
    known = new Set(arr);
  } catch {
    known = new Set();
  }
}
load();

// Écriture asynchrone + débouncée (comme processed-ids.json dans state.js) :
// addJids() est appelée à chaque message pour apprendre le contact "en
// passant", et un fs.writeFileSync bloquant à chaque premier message d'un
// nouveau contact ralentissait la réponse. Plusieurs nouveaux contacts qui
// arrivent en rafale ne déclenchent donc plus qu'UNE seule écriture groupée.
const SAVE_DEBOUNCE_MS = 1500;
let savePending = false;
let saveTimer = null;

function flushSave() {
  saveTimer = null;
  if (!savePending) return;
  savePending = false;
  fs.writeFile(FILE, JSON.stringify([...known], null, 2), "utf8", (e) => {
    if (e) console.error("Erreur sauvegarde known-contacts.json :", e.message);
  });
}

function save() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  if (saveTimer.unref) saveTimer.unref();
}

function flushSaveSync() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!savePending) return;
  savePending = false;
  try {
    fs.writeFileSync(FILE, JSON.stringify([...known], null, 2), "utf8");
  } catch (e) {
    console.error("Erreur sauvegarde known-contacts.json (flush) :", e.message);
  }
}
process.on("exit", flushSaveSync);

const isUserJid = (jid) => typeof jid === "string" && jid.endsWith("@s.whatsapp.net");

function addJids(jids = []) {
  let changed = false;
  for (const jid of jids) {
    if (isUserJid(jid) && !known.has(jid)) {
      known.add(jid);
      changed = true;
    }
  }
  if (changed) save();
}

function getKnownContacts() {
  return [...known];
}

// Branche les écouteurs sur le socket Baileys pour remplir le carnet tout
// seul, sans action de l'utilisateur.
function init(sock) {
  sock.ev.on("messaging-history.set", ({ contacts }) => {
    if (Array.isArray(contacts)) addJids(contacts.map((c) => c.id));
  });
  sock.ev.on("contacts.upsert", (contacts) => {
    addJids(contacts.map((c) => c.id));
  });
  sock.ev.on("contacts.update", (updates) => {
    addJids(updates.map((c) => c.id).filter(Boolean));
  });
  sock.ev.on("chats.upsert", (chats) => {
    addJids(chats.map((c) => c.id));
  });
}

module.exports = { init, addJids, getKnownContacts };
