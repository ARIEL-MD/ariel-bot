// ===================== CONFIGURATION DU BOT (EXEMPLE) =====================
// Ce fichier est un MODÈLE, sans données sensibles, destiné à être partagé
// ou publié sur Git. Pour faire tourner le bot :
//   1. Copie ce fichier en "config.js"      (cp config.example.js config.js)
//   2. Remplis tes vraies valeurs dans "config.js"
//   3. Ne publie/commit jamais "config.js" (il est déjà dans .gitignore)
// ==============================================================================

const fs = require("fs");
const path = require("path");

// Le numéro WhatsApp qui héberge le bot se met dans le fichier
// METS-TON-NUMERO-ICI.txt, à la racine du projet, après le repère
// "PHONE_NUMBER:". On le lit automatiquement ci-dessous.
function lirePhoneNumberDepuisFichier() {
  try {
    const chemin = path.join(__dirname, "METS-TON-NUMERO-ICI.txt");
    const contenu = fs.readFileSync(chemin, "utf8");
    const match = contenu.match(/^PHONE_NUMBER\s*:(.*)$/im);
    if (!match) return "";
    const chiffres = match[1].replace(/[^0-9]/g, "");
    return /^[0-9]{7,15}$/.test(chiffres) ? chiffres : "";
  } catch (e) {
    return "";
  }
}

module.exports = {
  // Préfixe principal affiché dans le menu (ex: .menu)
  PREFIX: ".",

  // Tous les préfixes acceptés pour déclencher une commande.
  // Avec ça, .menu ET !menu fonctionnent tous les deux.
  PREFIXES: [".", "!"],

  // ===================== ANTI-BAN (protection du numéro) =====================
  // WhatsApp bannit/déconnecte le plus souvent un compte parce que le bot
  // envoie ses messages TROP VITE et TOUJOURS AU MÊME RYTHME (comportement
  // typique d'un script, pas d'un humain). Ce réglage force un petit délai
  // ALÉATOIRE avant chaque message envoyé par le bot, appliqué globalement
  // (menu, réponses, stickers, tout). Ça ralentit un peu le bot mais réduit
  // beaucoup le risque de bannissement. Mets ANTIBAN_ENABLED à false pour
  // désactiver (déconseillé si le bot est utilisé par beaucoup de monde).
  ANTIBAN_ENABLED: true,
  ANTIBAN_MIN_DELAY_MS: 100, // délai minimum avant un envoi
  ANTIBAN_MAX_DELAY_MS: 300, // délai maximum avant un envoi (aléatoire entre les deux)

  // Nom affiché du bot
  BOT_NAME: "ARIEL-MD",
  BOT_VERSION: "1.0",

  // Image affichée avec .menu et .alive. Mets un lien direct vers une image
  // (ex: héberge-la sur https://catbox.moe ou https://imgbb.com et colle le
  // lien direct "https://...jpg" ici). Laisse "" pour un menu texte seul.
  MENU_IMAGE_URL: "",

  // Musique(s) envoyée(s) juste après le menu (.menu). Mets un ou plusieurs
  // liens directs vers des fichiers audio (mp3, ogg...), par ex. hébergés
  // sur https://catbox.moe. S'il y en a plusieurs, une musique est choisie
  // au hasard à chaque .menu. Laisse [] (liste vide) pour ne pas envoyer
  // de musique.
  MENU_AUDIO_URLS: [],

  // Numéro du propriétaire (avec indicatif pays, sans + ni espaces).
  // Change-le librement pour héberger le bot avec TON numéro.
  OWNER_NUMBER: "243000000000",

  // ⚠️ "ARIEL MD" doit toujours rester dans ce nom, sinon le bot refuse de
  // démarrer (protection anti-suppression du crédit). Tu peux par contre
  // ajouter ton propre nom à côté, par exemple : "ARIEL MD 🤖 | TonNom"
  OWNER_NAME: "ARIEL MD 🤖 | Ton Nom",

  // Numéro WhatsApp qui va héberger le bot (pour le code d'appairage).
  // Ne se règle plus ici : écris ton numéro dans le fichier
  // METS-TON-NUMERO-ICI.txt, à la racine du projet (instructions incluses).
  PHONE_NUMBER: lirePhoneNumberDepuisFichier(),

  // Clé API Groq (gratuite), nécessaire pour la commande .gpt
  // Récupère-la sur https://console.groq.com/keys
  GROQ_API_KEY: "",

  // Token de bot Telegram (créé via @BotFather), nécessaire pour .tg
  TELEGRAM_BOT_TOKEN: "",

  // ===================== APPAIRAGE WHATSAPP VIA TELEGRAM =====================
  // Optionnel. Si les deux valeurs ci-dessous sont renseignées, le bot te
  // demandera ton numéro WhatsApp et t'enverra le code d'appairage via
  // Telegram plutôt que dans la console (utile sur un panel sans console
  // interactive). Voir telegram-pair.js pour les détails.
  //
  // Utilise un bot Telegram DÉDIÉ, différent de TELEGRAM_BOT_TOKEN ci-dessus.
  TELEGRAM_PAIRING_BOT_TOKEN: "",
  // Ton ID Telegram numérique (demande-le à @userinfobot). Seul ce chat
  // pourra déclencher/recevoir le pairing — ne le partage à personne.
  TELEGRAM_OWNER_CHAT_ID: "",

  // Lien "Download ZIP" du dépôt, utilisé par .update si pas de Git installé.
  UPDATE_ZIP_URL: "",

  // Mode : "public" (tout le monde peut utiliser le bot)
  //        "private" (seul le propriétaire peut l'utiliser)
  MODE: "public",

  // Fonctionnalités automatiques
  // (Voir/liker les statuts auto se règle maintenant avec la commande
  // .autostatus (et .autostatuslike) directement depuis WhatsApp — plus
  // besoin de toucher à ce fichier ni de redémarrer le bot.)

  ANTI_DELETE: true,
  ANTI_LINK: false,
  ANTI_CALL: true,

  // Fait apparaître le bot comme "en ligne" en permanence
  ALWAYS_ONLINE: false,

  // Anti view-once : renvoie automatiquement au propriétaire les photos/vidéos
  // "vue unique" reçues (avant qu'elles ne disparaissent après lecture)
  ANTI_VV: true,

  // Message de bienvenue/au revoir automatique dans les groupes (réglable
  // par groupe avec .welcome on|off). Personnalise le texte avec
  // .setwelcome <message> / .setbye <message> — {user} et {group} sont
  // remplacés automatiquement par le nom du membre et celui du groupe.
  WELCOME: false,

  // Anti-fake : exclut automatiquement les nouveaux membres dont le numéro
  // ne commence pas par un des indicatifs autorisés ci-dessous. Utile pour
  // filtrer les faux comptes/spam utilisant des indicatifs étrangers.
  // Réglable par groupe avec .antifake on|off. Le bot doit être admin.
  ANTIFAKE: false,
  ANTIFAKE_ALLOWED_CODES: ["225"], // indicatif(s) à autoriser, ex: ["225", "33"]

  // Emoji envoyé en réaction sur ton message DÈS qu'une commande valide est
  // reconnue, avant même qu'elle ne s'exécute (petit accusé "j'ai bien reçu
  // ta commande"). Mets "" pour désactiver cette réaction.
  COMMAND_REACT_EMOJI: "⏳",

  DESCRIPTION: "*©ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀɪᴇʟ*",
};
