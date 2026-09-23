// ===================== DOSSIER DE DONNÉES (par instance) =====================
// Là où le bot range TOUT ce qui lui est propre : settings.json,
// known-contacts.json, blocklist-history.json, processed-ids.json, data/,
// viewonce_cache/, status-schedules.json, tmp/...
//
// - Bot personnel (node index.js) : BOT_DATA_DIR n'est pas défini, donc on
//   retombe sur le dossier du projet -> comportement identique à avant.
// - Instance lancée par l'orchestrateur : il définit BOT_DATA_DIR sur
//   orchestrator/instances/<chatId>/, donc chaque utilisateur a ses propres
//   fichiers, et rien n'est partagé entre deux utilisateurs.
// ==============================================================================
const path = require("path");

const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.resolve(process.env.BOT_DATA_DIR)
  : path.join(__dirname, "..");

// true si ce process est une instance lancée par l'orchestrateur public.
const IS_ORCHESTRATED = Boolean(process.env.BOT_DATA_DIR);

module.exports = { DATA_DIR, IS_ORCHESTRATED };
