// ===================== APPAIRAGE WHATSAPP VIA TELEGRAM =====================
// Permet de récupérer le numéro WhatsApp à connecter ET de recevoir le code
// d'appairage directement dans Telegram, plutôt que dans la console — utile
// sur les hébergeurs (panels) où la console n'est pas interactive.
//
// Mise en place :
//   1. Crée un bot avec @BotFather sur Telegram, récupère son token.
//   2. Renseigne dans config.js :
//        TELEGRAM_PAIRING_BOT_TOKEN: "123456:ABC-..."
//        TELEGRAM_OWNER_CHAT_ID: "123456789"
//      Pour connaître ton TELEGRAM_OWNER_CHAT_ID : ouvre une conversation
//      avec @userinfobot sur Telegram, il te répond avec ton ID numérique.
//   3. Au démarrage, si aucun numéro WhatsApp n'est configuré (ni argument,
//      ni variable d'env, ni config.js), le bot Telegram envoie un message
//      demandant "/pair <numéro avec indicatif pays>" au lieu d'attendre une
//      saisie dans la console.
//   4. Le code d'appairage généré par WhatsApp est envoyé dans Telegram,
//      en plus d'être affiché dans la console.
//   5. Une fois configuré, "/restart" fonctionne à tout moment (même si le
//      bot est déjà appairé et tourne normalement) pour redémarrer le
//      process — utile si le bot ne répond plus du tout sur WhatsApp.
//
// Sécurité : seul le chat dont l'ID correspond à TELEGRAM_OWNER_CHAT_ID est
// écouté ; tout message venant d'un autre chat est ignoré. Ne partage jamais
// ton TELEGRAM_PAIRING_BOT_TOKEN ni ton TELEGRAM_OWNER_CHAT_ID, et n'utilise
// pas le même token que celui de la commande .tg (garde-les séparés).
// ==============================================================================

let TelegramBot;
try {
  TelegramBot = require("node-telegram-bot-api");
} catch (e) {
  TelegramBot = null; // le package n'est installé que si cette fonctionnalité est utilisée
}

// Crée le bot Telegram de pairing, ou renvoie null si non configuré /
// dépendance manquante (le bot WhatsApp continue de fonctionner normalement
// dans ce cas, juste sans cette fonctionnalité).
function createPairingBot(config) {
  if (!config.TELEGRAM_PAIRING_BOT_TOKEN || !config.TELEGRAM_OWNER_CHAT_ID) {
    return null;
  }
  if (!TelegramBot) {
    console.warn(
      "⚠️  TELEGRAM_PAIRING_BOT_TOKEN est configuré mais le package " +
      "'node-telegram-bot-api' n'est pas installé. Lance : npm install node-telegram-bot-api"
    );
    return null;
  }

  const bot = new TelegramBot(config.TELEGRAM_PAIRING_BOT_TOKEN, { polling: true });
  bot.on("polling_error", (err) =>
    console.error("⚠️  Erreur Telegram (pairing) :", err.message)
  );
  return bot;
}

// Attend un message "/pair <numero>" venant UNIQUEMENT du propriétaire
// (TELEGRAM_OWNER_CHAT_ID), puis résout avec le numéro nettoyé (chiffres
// uniquement). Redemande automatiquement en cas de numéro invalide.
function waitForPhoneNumber(bot, config) {
  const ownerId = String(config.TELEGRAM_OWNER_CHAT_ID);

  return new Promise((resolve) => {
    bot
      .sendMessage(
        ownerId,
        "🤖 Bot WhatsApp en attente de connexion.\n" +
          "Envoie : /pair <ton numéro avec indicatif pays>\n" +
          "Exemple : /pair 2250788523990"
      )
      .catch((err) => console.error("⚠️  Envoi Telegram impossible :", err.message));

    const listener = (msg) => {
      if (String(msg.chat.id) !== ownerId) return; // ignore tout chat qui n'est pas le propriétaire
      const match = /^\/pair(?:@\w+)?\s+([0-9+\s]+)/i.exec(msg.text || "");
      if (!match) {
        if (/^\/pair/i.test(msg.text || "")) {
          bot
            .sendMessage(ownerId, "❌ Format attendu : /pair 2250788523990")
            .catch(() => {});
        }
        return;
      }
      const phoneNumber = match[1].replace(/[^0-9]/g, "");
      if (phoneNumber.length < 8) {
        bot
          .sendMessage(ownerId, "❌ Numéro invalide (trop court). Réessaie avec l'indicatif pays.")
          .catch(() => {});
        return;
      }
      bot.removeListener("message", listener);
      resolve(phoneNumber);
    };

    bot.on("message", listener);
  });
}

// Envoie le code d'appairage généré au propriétaire, sur Telegram.
function sendPairingCode(bot, config, code) {
  const ownerId = String(config.TELEGRAM_OWNER_CHAT_ID);
  return bot
    .sendMessage(
      ownerId,
      `🔑 Ton code d'appairage : ${code}\n\n` +
        "Sur ton téléphone : WhatsApp > Paramètres > Appareils liés > Lier un " +
        'appareil > "Lier avec un numéro de téléphone", puis entre ce code ' +
        "RAPIDEMENT (il expire après environ 60 secondes)."
    )
    .catch((err) => console.error("⚠️  Impossible d'envoyer le code via Telegram :", err.message));
}

// Envoie un message d'erreur au propriétaire, sur Telegram (ex : échec après
// plusieurs tentatives de demande de code).
function sendPairingError(bot, config, message) {
  const ownerId = String(config.TELEGRAM_OWNER_CHAT_ID);
  return bot.sendMessage(ownerId, `❌ ${message}`).catch(() => {});
}

// Écoute en permanence "/restart" venant du propriétaire (TELEGRAM_OWNER_CHAT_ID)
// et redémarre le process du bot WhatsApp — pratique quand le bot ne répond
// plus DU TOUT sur WhatsApp (donc que .restart, lui, est injoignable) mais que
// Telegram fonctionne encore. Contrairement à waitForPhoneNumber(), ce
// listener n'est jamais retiré : il reste actif tant que le process tourne,
// pairing terminé ou non.
function listenForRestart(bot, config) {
  const ownerId = String(config.TELEGRAM_OWNER_CHAT_ID);

  bot.on("message", (msg) => {
    if (String(msg.chat.id) !== ownerId) return; // ignore tout chat qui n'est pas le propriétaire
    if (!/^\/restart(?:@\w+)?\s*$/i.test(msg.text || "")) return;

    bot
      .sendMessage(ownerId, "🔄 Redémarrage en cours... Le bot revient dans quelques secondes.")
      .catch(() => {});

    // Code de sortie 1 (pas 0) : la plupart des panels d'hébergement
    // (Katabump, Pterodactyl, OptikLink...) ne relancent automatiquement le
    // process QUE lorsqu'il se termine comme un "crash" (code non nul) —
    // voir le même choix dans la commande WhatsApp .restart (commands/index.js).
    setTimeout(() => process.exit(1), 1500);
  });
}

module.exports = {
  createPairingBot,
  waitForPhoneNumber,
  sendPairingCode,
  sendPairingError,
  listenForRestart,
};
