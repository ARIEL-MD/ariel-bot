// ===================== CONFIGURATION DU BOT =====================
// Toutes les options sont modifiables ici. Rien n'est téléchargé
// depuis Internet : tout le code du bot est dans ce dossier.
// ==================================================================

const fs = require("fs");
const path = require("path");

// Le numéro WhatsApp qui héberge le bot ne se règle plus ici : il se met
// dans le fichier METS-TON-NUMERO-ICI.txt, à la racine du projet (visible
// dès qu'on décompresse le zip), après le repère "PHONE_NUMBER:". On le lit
// ici automatiquement ; si le fichier est vide/absent, le bot redemandera le
// numéro comme avant (voir index.js -> getConfiguredPhoneNumber).
//
// On ne fait PAS un simple "garde tous les chiffres du fichier" : le fichier
// contient aussi un numéro d'EXEMPLE dans ses instructions (ex: "Exemple :
// 2250700000000"), et le confondre avec le vrai numéro casserait tout. On ne
// regarde donc QUE ce qui suit "PHONE_NUMBER:" sur sa ligne, peu importe le
// reste du fichier.
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

  // Nom affiché du bot.
  BOT_NAME: "ARIEL-BOT 🤖",
  BOT_VERSION: "1.0",

  // Image affichée avec .menu et .alive. Mets un lien direct vers une image
  // (ex: héberge-la sur https://catbox.moe ou https://imgbb.com et colle le
  // lien direct "https://...jpg" ici). Laisse "" pour un menu texte seul.
  MENU_IMAGE_URL: "https://i.ibb.co/PGHD6Rrs/ARIEL-BOT-350-Ki-B-exact.jpg",

  // Musique(s) envoyée(s) juste après le menu (.menu). Mets un ou plusieurs
  // liens directs vers des fichiers audio (mp3, ogg...), par ex. hébergés
  // sur https://catbox.moe. S'il y en a plusieurs, une musique est choisie
  // au hasard à chaque .menu. Laisse [] (liste vide) pour ne pas envoyer
  // de musique.
  MENU_AUDIO_URLS: [
    "https://files.catbox.moe/lphfmk.mp3",
    "https://files.catbox.moe/8ceawn.mp3",
    "https://files.catbox.moe/jeajsx.mp3",
    "https://files.catbox.moe/3cao9d.mp3",
    "https://files.catbox.moe/hgzv37.mp3",
  ],

  // Numéro et nom du propriétaire.
  OWNER_NUMBER: "2250788523990",
  OWNER_NAME: "ARIEL ",

  // Numéro WhatsApp qui va héberger le bot (pour le code d'appairage).
  // Ne se règle plus ici : ouvre le fichier METS-TON-NUMERO-ICI.txt à la
  // racine du projet et écris ton numéro dedans (instructions incluses).
  // Reste vide ("") si ce fichier n'existe pas ou est vide, auquel cas le
  // numéro sera demandé en console/panneau à chaque démarrage.
  PHONE_NUMBER: lirePhoneNumberDepuisFichier(),

  // Clé API Groq (gratuite), nécessaire pour la commande .gpt
  // Récupère-la sur https://console.groq.com/keys
  GROQ_API_KEY: "",

  // Token de bot Telegram, utilisé par .tg (téléchargement de packs de
  // stickers Telegram). Change-le dans BotFather si tu veux le régénérer.
  TELEGRAM_BOT_TOKEN: "",

  // Appairage WhatsApp via Telegram (optionnel) : remplis ces deux valeurs
  // pour recevoir le code d'appairage sur Telegram au lieu de la console.
  // Utilise un bot DIFFÉRENT de TELEGRAM_BOT_TOKEN ci-dessus (crée-en un
  // nouveau via @BotFather). Ton ID se récupère via @userinfobot.
  TELEGRAM_PAIRING_BOT_TOKEN: "",
  TELEGRAM_OWNER_CHAT_ID: "",

  // Lien "Download ZIP" du dépôt (ex: https://github.com/toi/ton-repo/archive/refs/heads/main.zip)
  // Utilisé par .update UNIQUEMENT si le bot n'a pas été installé via Git.
  UPDATE_ZIP_URL: "",

  // Mode : "public" (tout le monde peut utiliser le bot)
  //        "private" (seul le propriétaire peut l'utiliser)
  MODE: "private",

  // Fonctionnalités automatiques
  // (Voir/liker les statuts auto se règle maintenant avec la commande
  // .autostatus (et .autostatuslike) directement depuis WhatsApp — plus
  // besoin de toucher à ce fichier ni de redémarrer le bot.)

  ANTI_DELETE: false,
  ANTI_LINK: false,
  ANTI_CALL: false,

  // Marque automatiquement les messages reçus comme "lus" (coche bleue)
  AUTO_READ: false,

  // Fait apparaître le bot comme "en ligne" en permanence
  ALWAYS_ONLINE: false,

  // Anti view-once : renvoie automatiquement au propriétaire les photos/vidéos
  // "vue unique" reçues (avant qu'elles ne disparaissent après lecture)
  ANTI_VV: false,

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
  ANTIFAKE_ALLOWED_CODES: ["225"], // Côte d'Ivoire par défaut : ajoute d'autres indicatifs si besoin (ex: ["225", "33"])

  // Emoji envoyé en réaction sur ton message DÈS qu'une commande valide est
  // reconnue, avant même qu'elle ne s'exécute (petit accusé "j'ai bien reçu
  // ta commande"). Mets "" pour désactiver cette réaction.
  COMMAND_REACT_EMOJI: "",

  DESCRIPTION: "*©ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀɪᴇʟ*",
};
