// ===================== CONFIG DE L'ORCHESTRATEUR MULTI-INSTANCES =====================
// Ce fichier pilote le bot Telegram PUBLIC en libre-service : n'importe qui
// connaissant le code d'invitation peut, via /pair, obtenir sa PROPRE
// instance du bot WhatsApp, isolée des autres (session, contacts, réglages
// séparés), tournant à côté des autres sur ce même serveur.
//
// ⚠️ Ne commite/partage jamais ce fichier une fois rempli (token + code
// d'invitation = accès direct à la création d'instances).
// =====================================================================================

const path = require("path");

module.exports = {
  // Nom affiché dans le message d'accueil (/start).
  BOT_DISPLAY_NAME: "ARIEL-BOT",

  // Token du bot Telegram PUBLIC (différent de TELEGRAM_PAIRING_BOT_TOKEN
  // dans ../config.js, qui reste réservé à TON usage personnel).
  // Crée-le via @BotFather.
  TELEGRAM_BOT_TOKEN: "",

  // Ton ID Telegram (récupérable via @userinfobot). Reçoit /stats, les
  // alertes, et peut changer le code d'invitation avec /setcode.
  ADMIN_CHAT_ID: "",

  // Code que les gens doivent connaître pour lancer /pair. Change-le
  // régulièrement, ou dynamiquement avec /setcode <nouveau_code> (envoyé
  // par ADMIN_CHAT_ID uniquement).
  INVITE_CODE: "CHANGE-MOI",

  // Nombre maximum d'instances actives en même temps. 0 = pas de limite.
  // (Chaque instance est un processus Node : surveille la RAM de ton serveur
  // avec /stats, et mets une limite ici si tu en as besoin.)
  MAX_INSTANCES: 0,

  // Fichier index.js à lancer pour chaque instance (le bot WhatsApp
  // partagé — un seul exemplaire de code pour tout le monde).
  BOT_ENTRY: path.join(__dirname, "..", "index.js"),

  // Dossier où chaque utilisateur reçoit son propre sous-dossier
  // (instances/<chatId>/session, settings.json, known-contacts.json...).
  INSTANCES_DIR: path.join(__dirname, "instances"),

  // Fichier où l'orchestrateur retient qui a quelle instance, pour tout
  // relancer automatiquement si le serveur redémarre.
  REGISTRY_FILE: path.join(__dirname, "registry.json"),
};
