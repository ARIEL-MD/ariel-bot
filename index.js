// ===================== BOT WHATSAPP - FICHIER PRINCIPAL =====================
// Basé sur Baileys (librairie open-source officielle pour WhatsApp Web).
// Aucune connexion à un serveur tiers, aucun téléchargement de code externe,
// aucun SESSION_ID à récupérer ailleurs.
//
// Flux de connexion :
//   1. Au premier démarrage, le bot te demande ton numéro WhatsApp
//      directement dans la console (ou le lit dans config.js si tu l'as
//      déjà renseigné dans PHONE_NUMBER).
//   2. Il affiche un code d'appairage à 8 caractères.
//   3. Tu entres ce code dans WhatsApp > Appareils liés > Lier avec un
//      numéro de téléphone.
//   4. Une fois connecté, la session est sauvegardée dans le dossier
//      "session/" : les prochains démarrages n'auront plus besoin du code.
// ==============================================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const readline = require("readline");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const config = require("./config");

// Permet à l'orchestrateur multi-utilisateurs (voir orchestrator/) de fixer
// le propriétaire de CETTE instance précise via une variable d'environnement,
// sans toucher à config.js — utile car chaque instance lancée pour un
// utilisateur différent doit avoir CE numéro comme propriétaire (lui-même),
// pas celui écrit en dur dans config.js. Sans cette variable (usage normal,
// bot personnel), rien ne change.
// On garde le numéro d'origine (celui de config.js) : le verrou d'identité
// plus bas (checkLock) doit continuer à comparer CETTE valeur, sinon toute
// instance lancée pour un autre utilisateur serait refusée au démarrage.
const CONFIG_OWNER_NUMBER = config.OWNER_NUMBER;
if (process.env.OWNER_NUMBER_OVERRIDE) {
  config.OWNER_NUMBER = String(process.env.OWNER_NUMBER_OVERRIDE).replace(/[^0-9]/g, "");
}
const { DATA_DIR, IS_ORCHESTRATED } = require("./lib/paths");
const commands = require("./commands");
const contactsStore = require("./contacts-store");
const blocklistStore = require("./blocklist-store");
const { setupFeatures, getViewOnce, extractViewOnce } = require("./features");
const { handlePossibleStatusReplySend, handlePossibleStatusSaveCommand } = require("./statusreply");
const { getSetting, setSetting, START_TIME, isAfkActive, setAfk, getAfkMessage, isAutoReplyActive, setAutoReply, getAutoReplyMessage, isChatbotActive, isChatbotExcluded, setLastConnectionOpenAt, isMessageProcessed, markMessageProcessed, isAutoStickerSaveActive } = require("./state");
const telegramPairing = require("./telegram-pair");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// --- Filtre anti-inondation des logs "Bad MAC" / erreurs de session ---
// libsignal (utilisé en interne par Baileys pour le chiffrement) appelle
// directement console.log/console.error pour certaines erreurs de session
// ("Session error: Bad MAC", "Closing open session...") — ces appels NE
// PASSENT PAS par le logger pino configuré en "silent" plus bas, donc rien
// ne les filtre normalement. Ça arrive très souvent avec les statuts (un
// contact sans session établie = un "Bad MAC" à chaque tentative de
// déchiffrement), parfois des dizaines par seconde. Sur un hébergement type
// panel (Pterodactyl, etc.), la console est renvoyée en direct vers
// l'interface web : une telle inondation peut saturer ce flux et FIGER tout
// le process Node le temps qu'il se vide — ce qui ralentit ou bloque même
// les commandes les plus simples (.ping) pendant que ça se produit.
// On filtre donc ces messages précis (bruit sans intérêt, sans impact sur le
// fonctionnement : Baileys gère déjà ces erreurs en interne) et on affiche
// juste un compteur groupé de temps en temps, au lieu de la stack trace
// complète à chaque fois.
(function installSignalNoiseFilter() {
  const NOISY_PATTERNS = [
    /^Session error/i,
    /Bad MAC/i,
    /^Closing open session/i,
    /^Closing session:/i,
  ];
  const isNoisy = (args) => {
    const first = args[0];
    return typeof first === "string" && NOISY_PATTERNS.some((re) => re.test(first));
  };

  let suppressedCount = 0;
  let summaryTimer = null;
  const flushSummary = () => {
    summaryTimer = null;
    if (suppressedCount > 0) {
      console.log(`🔇 ${suppressedCount} erreur(s) de session "Bad MAC" filtrée(s) (statuts non déchiffrables, sans impact) au cours des 10 dernières secondes.`);
      suppressedCount = 0;
    }
  };

  for (const method of ["log", "error", "warn"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      if (isNoisy(args)) {
        suppressedCount++;
        if (!summaryTimer) {
          summaryTimer = setTimeout(flushSummary, 10_000);
          if (summaryTimer.unref) summaryTimer.unref();
        }
        return;
      }
      original(...args);
    };
  }
})();

// --- Filet de sécurité global ---
// Sans ça, la moindre erreur non interceptée QUELQUE PART dans le code (un
// timeout réseau, un message WhatsApp mal formé, un bug dans une commande...)
// fait planter TOUT le process Node — et l'hébergeur le relance alors
// automatiquement. Vu de l'extérieur, ça ressemble à "le bot redémarre tout
// seul" et renvoie le message de connexion sans qu'on ait rien demandé.
// On intercepte donc ces erreurs ici pour les logger sans jamais couper le
// bot. Le process ne s'arrête plus que pour de vraies raisons volontaires
// (.restart, erreur fatale au tout premier démarrage avant connexion).
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Promesse rejetée non gérée (bot maintenu en ligne) :", reason);
});
process.on("uncaughtException", (err) => {
  console.error("⚠️ Erreur non interceptée (bot maintenu en ligne) :", err);
});

// ===================== ARRÊT PROPRE (SIGTERM / SIGINT) =====================
// La plupart des hébergeurs (Katabump, Pterodactyl, OptikLink, ou même juste
// un "redémarrer" manuel sur un panel) arrêtent le process en lui envoyant
// SIGTERM, puis SIGKILL s'il ne s'arrête pas assez vite. Sans gestionnaire
// ici, Node ignore SIGTERM par défaut pour ce genre de process et c'est
// souvent le panel qui finit par le tuer brutalement (SIGKILL) après un
// court délai — au moment même où Baileys peut être en train d'écrire dans
// les fichiers de session/ (dossier session/, clés de chiffrement Signal).
// Une écriture coupée en plein milieu corrompt l'état local des sessions de
// chiffrement, ce qui provoque ensuite des "Failed to decrypt message with
// any known session..." sur les messages suivants — WhatsApp doit alors
// renvoyer le message une seconde fois avant que le bot puisse le lire,
// d'où les délais de plusieurs secondes observés sur certaines commandes.
//
// En interceptant SIGTERM/SIGINT ici, on ferme proprement le socket
// WhatsApp AVANT de quitter (sock.end() : coupe la connexion sans déclencher
// la logique de reconnexion automatique), ce qui laisse le temps à Baileys
// de terminer ses écritures en cours plutôt que d'être coupé au milieu.
let isShuttingDown = false;
async function shutdownGracefully(signal) {
  if (isShuttingDown) return; // évite un double appel si le signal arrive 2x
  isShuttingDown = true;
  console.log(`\n🛑 Signal ${signal} reçu : fermeture propre de la connexion WhatsApp avant arrêt...`);
  try {
    if (currentSock) {
      currentSock.end(undefined);
    }
  } catch (e) {
    console.error("⚠️ Erreur pendant la fermeture propre du socket :", e.message);
  }
  // Petit délai pour laisser le temps aux écritures de session/ en cours de
  // se terminer avant que le process ne se termine réellement.
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.on("SIGINT", () => shutdownGracefully("SIGINT"));
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
// Sur les panels où la console n'est pas interactive, rl peut déjà être dans
// un état fermé/instable : on protège chaque appel à close() pour que ça ne
// fasse jamais planter le bot, quel que soit l'hébergeur.
const safeCloseReadline = () => {
  try {
    rl.close();
  } catch (e) {
    // Rien à faire : déjà fermé, ou pas de console interactive ici.
  }
};

// Empêche que plusieurs reconnexions se déclenchent en même temps (ex: si
// l'événement "close" arrive plusieurs fois d'affilée à cause d'un réseau
// instable). Sans ce verrou, startBot() pouvait être rappelée plusieurs fois
// et ouvrir 2+ connexions WhatsApp actives simultanément avec la même
// session, ce qui désynchronise le chiffrement (Bad MAC, "No sessions").
let isReconnecting = false;

// Référence vers le socket WhatsApp actuellement actif, mise à jour à
// chaque (re)création dans startBot(). Utilisée par les gestionnaires
// SIGTERM/SIGINT plus bas pour fermer proprement la connexion avant que le
// process ne s'arrête (voir explication détaillée à ces gestionnaires).
let currentSock = null;

// N'envoie le message "✅ connecté" qu'UNE SEULE FOIS par démarrage du
// process (au tout premier "open"), pas à chaque reconnexion automatique
// suivante. WhatsApp coupe périodiquement les sessions liées (normal, pas
// un bug), et le bot les rétablit tout seul en arrière-plan grâce à la
// session sauvegardée : ces reconnexions n'ont pas besoin d'être notifiées
// à chaque fois, seul le tout premier démarrage réel est utile à signaler.
// Persisté dans settings.json (via state.js) au lieu d'une simple variable
// en mémoire : une simple variable retombe à `false` à chaque redémarrage
// du process Node (crash, panel d'hébergement qui relance le script, etc.),
// ce qui faisait renvoyer le message de connexion à chaque fois. Avec la
// persistance sur disque, le message n'est envoyé qu'une seule fois pour de
// vrai, même après un redémarrage complet — seule la reconnexion WhatsApp
// "normale" (Closing session, coupures réseau...) reste silencieuse comme
// avant.

// ===================== VERROU D'IDENTITÉ DU BOT =====================
// Empêche le bot de démarrer si son nom, le nom du propriétaire ou son
// numéro sont modifiés. Ça n'empêche PAS quelqu'un d'autre de déployer ce
// bot avec son propre numéro WhatsApp (PHONE_NUMBER, pour le pairing) et
// d'avoir accès à toutes les commandes, y compris celles réservées au
// propriétaire : le code utilise déjà le compte réellement connecté
// (sock.user.id / msg.key.fromMe) pour décider qui est "le propriétaire" au
// moment d'exécuter les commandes.
const REF_BOT_NAME = "ARIEL-BOT 🤖";
const REF_OWNER_NAME = "ARIEL ";
const REF_OWNER_NUMBER = "2250788523990";

function checkLock(cfg) {
  const botName = String(cfg.BOT_NAME || "");
  const ownerName = String(cfg.OWNER_NAME || "");
  // Valeur d'origine de config.js, avant l'override de l'orchestrateur.
  const ownerNumber = String(CONFIG_OWNER_NUMBER || "");

  const ok =
    botName === REF_BOT_NAME &&
    ownerName === REF_OWNER_NAME &&
    ownerNumber === REF_OWNER_NUMBER;

  if (!ok) {
    console.error("\n❌ Démarrage impossible : configuration invalide.\n");
    process.exit(1);
  }
}

function checkCredit() {
  checkLock(config);
}

// Revérifie régulièrement en relisant config.js directement (et pas via
// require, qui est mis en cache). Utile sur les hébergements qui ne
// redémarrent pas le process après une modification de fichier.
function watchCredit() {
  setInterval(() => {
    try {
      delete require.cache[require.resolve("./config")];
      const freshConfig = require("./config");
      checkLock(freshConfig);
    } catch (e) {
      console.warn("Avertissement : relecture de config.js impossible :", e.message);
    }
  }, 5 * 60 * 1000); // toutes les 5 minutes
}



// Vérifie que le binaire yt-dlp (téléchargé automatiquement dans bin/ par
// scripts/download-ytdlp.js lors du npm install) est bien présent. Requis
// par .yt, .tiktok, .fb et .play.
function checkYtDlp() {
  const fs = require("fs");
  const path = require("path");
  const ytdlpPath = path.join(__dirname, "bin", "yt-dlp");
  if (!fs.existsSync(ytdlpPath)) {
    console.warn(
      "⚠️  Le binaire yt-dlp (bin/yt-dlp) est introuvable : téléchargement automatique en cours...\n" +
        "   (.yt, .tiktok, .fb et .play seront indisponibles tant que ce n'est pas terminé)"
    );
    // Beaucoup de panels d'hébergement bloquent les scripts "postinstall" de
    // npm par sécurité, donc le téléchargement fait pendant "npm install"
    // peut ne jamais avoir lieu. On retente ici, directement au démarrage du
    // bot, pour ne plus dépendre de ce postinstall.
    try {
      const { ensureYtDlp } = require("./scripts/download-ytdlp");
      ensureYtDlp().then((ok) => {
        if (ok) console.log("✅ yt-dlp est maintenant prêt : .yt/.tiktok/.fb/.play fonctionnent.");
      });
    } catch (e) {
      console.warn("Impossible de lancer le téléchargement automatique de yt-dlp :", e.message);
    }
  }
}

// Vérifie que le binaire ffmpeg portable (fourni par le paquet ffmpeg-static,
// aucun accès root/apt nécessaire) est bien présent. Requis par .play, .yt,
// .tiktok, .fb et .sticker. N'empêche pas le bot de démarrer : affiche juste
// un avertissement clair en console si le binaire est introuvable.
function checkFfmpeg() {
  try {
    const ffmpegPath = require("ffmpeg-static");
    const fs = require("fs");
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      throw new Error("binaire introuvable");
    }
  } catch {
    console.warn(
      "⚠️  Le binaire ffmpeg (paquet ffmpeg-static) est introuvable.\n" +
        "   Les commandes .play, .yt, .tiktok, .fb et .sticker ne fonctionneront pas.\n" +
        "   Relance : npm install ffmpeg-static"
    );
  }
}

// ===================== NUMÉRO DE TÉLÉPHONE (MULTI-PANEL) =====================
// But : marcher pareil sur OptikLink, Katabump, un autre panel Pterodactyl,
// un VPS, ou en local — sans jamais planter, quel que soit l'environnement,
// ET sans obliger à éditer config.js à la main.
//
// Ordre de priorité :
//   1. Argument passé dans la commande de démarrage du panel, ex :
//        node index.js 2250788523990
//      C'est LE moyen qui marche sur tous les panels, même ceux (comme
//      Katabump) qui n'ont pas de champ "variables" personnalisées : le
//      champ "Startup Command" est toujours modifiable, lui.
//   2. Variable d'environnement PHONE_NUMBER (si le panel en propose)
//   3. config.js -> PHONE_NUMBER (utile en dernier recours / en local)
//   4. Saisie en console, UNIQUEMENT si stdin est un vrai terminal interactif
//      (utile en local ou sur les panels qui transmettent bien le clavier,
//      comme OptikLink). Sur les panels où la console n'est pas interactive,
//      cette étape est sautée pour éviter le crash "ERR_USE_AFTER_CLOSE".
function getConfiguredPhoneNumber() {
  const fromArgs = process.argv[2];
  const raw = fromArgs || process.env.PHONE_NUMBER || config.PHONE_NUMBER || "";
  return String(raw).replace(/[^0-9]/g, "");
}

// pairingBot (optionnel) : instance Telegram créée par telegramPairing.createPairingBot().
// Si elle est fournie, on l'utilise en priorité par rapport à la console pour
// demander le numéro (pratique sur un panel où la console n'est pas interactive).
async function resolvePhoneNumber(pairingBot) {
  let phoneNumber = getConfiguredPhoneNumber();
  if (phoneNumber) return phoneNumber;

  if (pairingBot) {
    console.log("ℹ️  Aucun numéro configuré : en attente de '/pair <numéro>' sur Telegram...");
    phoneNumber = await telegramPairing.waitForPhoneNumber(pairingBot, config);
    return phoneNumber;
  }

  if (process.stdin.isTTY) {
    try {
      const answer = await question(
        "📱 Entre ton numéro WhatsApp avec l'indicatif pays (ex: 2250788523990) : "
      );
      phoneNumber = String(answer || "").replace(/[^0-9]/g, "");
    } catch (e) {
      // La console s'est fermée pendant qu'on attendait une réponse
      // (arrive sur certains panels malgré isTTY=true) : on retombe sur
      // le message d'erreur ci-dessous plutôt que de crasher.
      phoneNumber = "";
    }
  }

  if (!phoneNumber || phoneNumber.length < 8) {
    console.error(
      "\n❌ Aucun numéro WhatsApp valide n'a été trouvé.\n" +
        "   Le plus simple : modifie la commande de démarrage dans ton panel pour\n" +
        "   'node index.js TONNUMERO' (ex: node index.js 2250788523990), puis redémarre.\n" +
        "   Tu peux aussi le mettre dans config.js -> PHONE_NUMBER, dans une\n" +
        "   variable d'environnement PHONE_NUMBER si ton panel le permet, ou\n" +
        "   configurer TELEGRAM_PAIRING_BOT_TOKEN + TELEGRAM_OWNER_CHAT_ID dans\n" +
        "   config.js pour le faire depuis Telegram.\n"
    );
    process.exit(1);
  }

  return phoneNumber;
}

// Demande un code d'appairage à WhatsApp, avec quelques tentatives en cas
// d'échec temporaire (utile juste après l'ouverture du socket, où WhatsApp
// peut refuser une première demande trop rapprochée selon les hébergeurs).
async function requestPairingCodeWithRetry(sock, phoneNumber, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await sock.requestPairingCode(phoneNumber);
    } catch (err) {
      console.warn(`⚠️  Échec de la demande de code (tentative ${i}/${attempts}) :`, err.message);
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function startBot() {
  console.log("⏳ Chargement de la session (dossier session/)...");
  const { state, saveCreds } = await useMultiFileAuthState(
    IS_ORCHESTRATED ? path.join(DATA_DIR, "session") : "session"
  );

  console.log("⏳ Vérification de la version Baileys la plus récente...");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // on utilise le code d'appairage, pas le QR
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });
  currentSock = sock;

  // ===================== ANTI-BAN : throttle global des envois =====================
  // Enveloppe sock.sendMessage pour insérer un petit délai aléatoire avant
  // CHAQUE message envoyé par le bot, quelle que soit la commande d'où il
  // vient (menu, réponses, stickers, broadcasts...). Comme "sock" est le
  // même objet partagé partout (commands/index.js, features.js,
  // autostatus.js, statusreply.js reçoivent tous cette référence), le
  // remplacer une seule fois ici suffit à protéger tous les envois du bot,
  // sans avoir à modifier chaque commande individuellement. Les messages
  // partent en file (un par un, jamais en rafale) avec un rythme légèrement
  // irrégulier (aléatoire entre ANTIBAN_MIN_DELAY_MS et ANTIBAN_MAX_DELAY_MS)
  // pour ne pas ressembler à un script qui envoie toujours à intervalle fixe.
  if (config.ANTIBAN_ENABLED !== false) {
    const originalSendMessage = sock.sendMessage.bind(sock);
    const minDelay = Number(config.ANTIBAN_MIN_DELAY_MS) || 350;
    const maxDelay = Math.max(Number(config.ANTIBAN_MAX_DELAY_MS) || 900, minDelay);
    let outgoingQueue = Promise.resolve();

    sock.sendMessage = (...args) => {
      const jid = args[0];
      const result = outgoingQueue.then(async () => {
        const wait = minDelay + Math.random() * (maxDelay - minDelay);
        // Affiche "en train d'écrire..." pendant l'attente : en plus d'éviter
        // les rafales, ça rend le comportement plus proche de celui d'un
        // humain aux yeux de WhatsApp. Best-effort : certains chats (statuts,
        // broadcasts) refusent cet appel, donc on ignore silencieusement les
        // erreurs pour ne jamais bloquer l'envoi réel du message.
        try {
          await sock.sendPresenceUpdate("composing", jid);
        } catch {}
        await new Promise((r) => setTimeout(r, wait));
        try {
          await sock.sendPresenceUpdate("paused", jid);
        } catch {}
        return originalSendMessage(...args);
      });
      // On avale l'erreur ici uniquement pour ne pas casser la file pour les
      // envois suivants ; l'appelant reçoit quand même le rejet via `result`.
      outgoingQueue = result.catch(() => {});
      return result;
    };
  }

  contactsStore.init(sock);
  blocklistStore.init(sock);

  // --- Si pas encore connecté : demander le numéro et générer le code ---
  if (!sock.authState.creds.registered) {
    console.log("ℹ️  Aucune session enregistrée : demande du numéro de téléphone.");

    // Bot Telegram optionnel pour piloter le pairing à distance (voir
    // telegram-pair.js). Renvoie null si TELEGRAM_PAIRING_BOT_TOKEN /
    // TELEGRAM_OWNER_CHAT_ID ne sont pas configurés dans config.js — dans ce
    // cas tout se comporte exactement comme avant (console uniquement).
    const pairingBot = telegramPairing.createPairingBot(config);

    const phoneNumber = await resolvePhoneNumber(pairingBot);

    // Petit délai avant de demander le code : sur certains hébergeurs, le
    // socket WhatsApp n'est pas encore totalement prêt juste après sa
    // création, et une demande immédiate peut échouer ou fermer la
    // connexion aussitôt. Ce délai évite ce cas de figure sans rien changer
    // pour les hébergeurs où ce n'est pas nécessaire.
    await new Promise((r) => setTimeout(r, 3000));

    try {
      const code = await requestPairingCodeWithRetry(sock, phoneNumber);
      console.log(
        `\n🔑 Ton code d'appairage : ${code}\n` +
        `\nSur ton téléphone : WhatsApp > Paramètres > Appareils liés > ` +
        `Lier un appareil > "Lier avec un numéro de téléphone", puis entre ce code ` +
        `RAPIDEMENT (il expire après environ 60 secondes).\n`
      );
      if (pairingBot) {
        await telegramPairing.sendPairingCode(pairingBot, config, code);
      }
      // Si ce process a été lancé par l'orchestrateur multi-instances (voir
      // orchestrator/manager.js), il écoute via IPC (process.send n'existe
      // que dans un process "forké" avec un canal IPC) : on lui transmet le
      // code pour qu'il le relaie à l'utilisateur concerné sur Telegram.
      if (typeof process.send === "function") {
        process.send({ type: "pairing_code", code });
      }
    } catch (err) {
      const errorMessage =
        `Impossible d'obtenir un code d'appairage après plusieurs tentatives : ${err.message}\n` +
        "Vérifie que le numéro est correct et que ce numéro n'a pas déjà atteint " +
        "la limite de 4 appareils liés sur WhatsApp.";
      console.error(`\n❌ ${errorMessage}\n`);
      if (pairingBot) {
        await telegramPairing.sendPairingError(pairingBot, config, errorMessage);
      }
      if (typeof process.send === "function") {
        process.send({ type: "pairing_error", message: errorMessage });
      }
      process.exit(1);
    }
  } else {
    console.log("✅ Session déjà enregistrée trouvée : tentative de reconnexion (pas besoin de re-pairer)...");
  }

  // Fenêtre de grâce juste après une (re)connexion : WhatsApp/Baileys peut
  // livrer d'un coup un paquet de messages en attente (envoyés bien avant,
  // pendant que le bot était hors ligne) avec un horodatage qui ne reflète
  // pas toujours fidèlement leur heure d'envoi d'origine — le seul filtre
  // par horodatage (plus bas) ne suffit donc pas toujours à lui seul. On
  // ignore ici TOUT message reçu dans les premières secondes suivant chaque
  // connexion/reconnexion, peu importe son horodatage annoncé : c'est cette
  // fenêtre qui empêche de répondre à une commande tapée bien avant que le
  // bot ne redémarre.
  let readyAt = 0;
  // Heure de la dernière (re)connexion effective ("open"). Contrairement à
  // START_TIME (fixé une seule fois au tout premier démarrage du process),
  // celle-ci se met à jour à CHAQUE reconnexion — y compris quand le process
  // Node ne redémarre pas vraiment mais que seule la connexion WhatsApp se
  // coupe puis se rétablit (ce qui arrive souvent sur les hébergeurs qui
  // "redémarrent" le bot toutes les heures). Sans ça, un message tapé
  // pendant une coupure de quelques minutes, en plein milieu d'une longue
  // session du bot, passait le filtre par horodatage (car bien plus récent
  // que START_TIME) et n'était retenu que par la fenêtre de grâce de 6s
  // ci-dessous — trop courte si WhatsApp délivre la file d'attente en
  // plusieurs paquets étalés dans le temps.
  let lastConnectionOpenAt = Date.now();

  // --- Gestion de la connexion ---
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connexion fermée. Reconnexion :", shouldReconnect);

      if (shouldReconnect) {
        // Si une reconnexion est déjà programmée, on ignore ce deuxième
        // événement "close" au lieu d'ouvrir une connexion en plus.
        if (isReconnecting) {
          console.log("Reconnexion déjà en cours, on ignore ce doublon.");
          return;
        }
        isReconnecting = true;
        // Petit délai pour laisser le temps à l'ancienne connexion de bien
        // se fermer côté serveur WhatsApp avant d'en ouvrir une nouvelle.
        setTimeout(() => {
          isReconnecting = false;
          startBot();
        }, 3000);
      } else {
        safeCloseReadline();
        if (typeof process.send === "function") {
          process.send({ type: "logged_out" });
        }
      }
    } else if (connection === "open") {
      isReconnecting = false;
      lastConnectionOpenAt = Date.now();
      setLastConnectionOpenAt(lastConnectionOpenAt);
      // On ignore tout message arrivant dans les 15 prochaines secondes (voir
      // commentaire sur `readyAt` plus haut). Allongé de 6s à 15s : WhatsApp
      // peut délivrer la file d'attente accumulée pendant une coupure en
      // plusieurs paquets étalés dans le temps, pas toujours d'un seul coup.
      readyAt = Date.now() + 15000;
      console.log(`✅ ${config.BOT_NAME} est connecté à WhatsApp !`);
      safeCloseReadline();
      if (typeof process.send === "function") {
        process.send({ type: "connected", waName: sock.user?.name || sock.user?.verifiedName || null });
      }

      // --- Marque l'appareil du bot comme "en ligne" ---
      // Sans cet appel, Baileys ouvre bien la connexion WebSocket mais
      // n'annonce jamais explicitement au serveur WhatsApp que cet appareil
      // lié est "disponible". Résultat concret : WhatsApp ne pousse alors
      // certains contenus (notamment les médias comme les stickers) en temps
      // réel que quand le téléphone principal a lui-même la conversation
      // ouverte (lui est "disponible" et déclenche la livraison) ; sinon ils
      // restent en attente et n'arrivent/ne se téléchargent qu'au prochain
      // moment où le téléphone rouvre la conversation. En envoyant
      // "available" ici, à CHAQUE (re)connexion, le bot est vu comme un
      // appareil actif indépendamment du téléphone, et les stickers/médias
      // sont livrés et téléchargeables tout de suite, même WhatsApp fermé
      // sur le téléphone.
      try {
        await sock.sendPresenceUpdate("available");
      } catch (e) {
        console.log("⚠️ Impossible de définir la présence en ligne :", e.message);
      }

      // Envoie un message en DM au propriétaire pour confirmer que le bot
      // est bien connecté (utile pour le savoir tout de suite sans avoir à
      // rouvrir la console de l'hébergeur, notamment après un vrai
      // redémarrage du process). On ne le fait qu'une fois par démarrage :
      // les reconnexions automatiques suivantes (coupures WhatsApp
      // normales, souvent après quelques heures) restent silencieuses.
      if (!getSetting("HAS_SENT_CONNECT_MSG")) {
        setSetting("HAS_SENT_CONNECT_MSG", true);
        try {
          // On envoie au JID du compte connecté lui-même (self-chat / "from me"),
          // et non plus à config.OWNER_NUMBER : ainsi le message apparaît toujours
          // dans la conversation "Vous" du numéro qui héberge le bot, même si
          // OWNER_NUMBER pointe vers un autre numéro (propriétaire différent).
          const selfJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
          const now = new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Africa/Abidjan",
            dateStyle: "full",
            timeStyle: "short",
          }).format(new Date());
          await sock.sendMessage(selfJid, {
            text: `✅ *${config.BOT_NAME}* est connecté et opérationnel.\n🕐 ${now}`,
          });
        } catch (e) {
          console.log("Impossible d'envoyer le message de connexion :", e.message);
        }
      }

      // Recharge les statuts (.scstatus) programmés avant un éventuel
      // redémarrage, pour qu'ils partent bien à l'heure prévue.
      if (typeof commands.initScheduledStatuses === "function") {
        try {
          commands.initScheduledStatuses(sock);
        } catch (e) {
          console.log("Erreur rechargement statuts programmés :", e.message);
        }
      }

      // Précharge l'image du menu en mémoire dès la connexion, pour que le
      // tout premier .menu soit déjà rapide (pas seulement les suivants).
      commands.getMenuImageBuffer?.().catch(() => {});
      // Idem pour TOUTES les musiques de MENU_AUDIO_URLS (pas juste celle
      // tirée au hasard) : sans ça, seule la première musique jouée était
      // mise en cache, et les autres restaient lentes au premier tirage.
      commands.preloadMenuAudioBuffers?.().catch(() => {});
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // --- Fonctionnalités automatiques (anti-delete, welcome, etc.) ---
  setupFeatures(sock);

  // --- Gestion des commandes ---
  // Anti-doublon PERSISTANT : Baileys peut parfois redélivrer le même
  // message (notamment pour tes propres messages, fromMe, ou après un
  // redémarrage du process côté hébergeur), ce qui exécutait la commande une
  // deuxième fois. La liste des IDs déjà traités est maintenant sauvegardée
  // sur le disque (state.js -> processed-ids.json) : une commande une fois
  // exécutée ne sera JAMAIS rejouée, même après un vrai redémarrage complet
  // du bot. Seul un nouveau message (nouvel ID, donc une commande retapée)
  // sera traité.
  // Anti-spam pour le mode absent (.indispo) : évite de renvoyer le message
  // d'absence à chaque message reçu du même contact (une fois toutes les
  // 5 minutes par contact suffit largement).
  const afkRepliedRecently = new Map(); // jid -> timestamp du dernier envoi

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // 🔍 DIAGNOSTIC TEMPORAIRE : mesure où part le temps entre la réception
    // du message et l'envoi de la réponse. À retirer une fois le problème de
    // lenteur identifié (chercher "DIAG" dans les logs).
    const receivedAt = Date.now();
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message) return;

    // Fenêtre de grâce après une (re)connexion : voir commentaire sur
    // `readyAt` plus haut. On ignore tout, peu importe l'horodatage annoncé
    // par le message, pendant ces quelques secondes.
    if (Date.now() < readyAt) {
      return;
    }

    // Anti-vieilles-commandes : après un .restart (ou tout redémarrage), le
    // téléphone/serveur WhatsApp peut redélivrer des messages envoyés AVANT
    // que le bot ne soit revenu en ligne (ex: une commande tapée pendant les
    // quelques secondes de redémarrage), et Baileys les fait parfois arriver
    // avec type="notify" comme s'il s'agissait de nouveaux messages. On
    // ignore donc tout message dont l'horodatage est antérieur au démarrage
    // du process (avec 10s de marge pour les petits décalages d'horloge).
    // NB: messageTimestamp peut arriver comme nombre, chaîne, ou objet
    // "Long" selon les versions de Baileys — .toNumber() gère ce dernier cas.
    const rawTimestamp = msg.messageTimestamp;
    const msgTimestamp =
      rawTimestamp && typeof rawTimestamp === "object" && typeof rawTimestamp.toNumber === "function"
        ? rawTimestamp.toNumber() * 1000
        : Number(rawTimestamp) * 1000; // secondes -> ms
    // On compare à la PLUS RÉCENTE des deux références (démarrage du
    // process, ou dernière reconnexion WhatsApp) : couvre à la fois un vrai
    // redémarrage du process ET une simple coupure/reprise de connexion en
    // cours de route (voir commentaire sur `lastConnectionOpenAt` plus haut).
    const freshnessThreshold = Math.max(START_TIME, lastConnectionOpenAt) - 10_000;
    if (msgTimestamp && msgTimestamp < freshnessThreshold) {
      return;
    }

    // Anti-vieux-message ABSOLU : peu importe le démarrage ou la dernière
    // reconnexion, un message tapé "maintenant" a toujours un horodatage à
    // quelques secondes de l'heure réelle actuelle. Si WhatsApp redélivre un
    // vieux message (mis en file d'attente pendant une coupure, un
    // redémarrage, ou même sans coupure visible) avec un horodatage plus
    // ancien que ça, on le rejette — MÊME si ce timestamp est plus récent que
    // START_TIME/lastConnectionOpenAt (donc même si le filtre au-dessus ne
    // l'a pas déjà arrêté). C'est la vraie garantie qu'AUCUNE commande tapée
    // il y a plus d'une minute ne peut être exécutée, peu importe la raison
    // de la redélivrance.
    const MAX_MESSAGE_AGE_MS = 60_000; // 60s de marge (réseau lent, horloge tel/serveur)
    if (msgTimestamp && Date.now() - msgTimestamp > MAX_MESSAGE_AGE_MS) {
      return;
    }

    // 🔍 DIAG : écart entre l'heure annoncée par WhatsApp pour ce message et
    // le moment où le bot le reçoit réellement. Un gros écart ici veut dire
    // que le retard vient de LA RÉCEPTION (réseau/hébergeur), pas du bot.
    if (msgTimestamp) {
      console.log(`⏱️ DIAG delivery lag: ${receivedAt - msgTimestamp}ms (message envoyé à ${new Date(msgTimestamp).toISOString()}, reçu par le bot à ${new Date(receivedAt).toISOString()})`);
    }

    // Anti-réexécution DÉFINITIF : si ce message (même ID) a déjà été traité
    // un jour — y compris avant un redémarrage complet du process — on
    // l'ignore. C'est la garantie ultime : une commande déjà exécutée n'est
    // JAMAIS rejouée, quoi qu'il arrive au bot entre-temps.
    const msgId = msg.key.id;
    if (isMessageProcessed(msgId)) {
      return;
    }
    markMessageProcessed(msgId);

    const from = msg.key.remoteJid;

    // Apprend ce contact "en passant" (voir contacts-store.js), pour que
    // .setstatus / .scstatus sans numéro puisse toucher les gens avec qui tu
    // discutes réellement, même si l'historique complet n'est pas synchronisé.
    contactsStore.addJids([from, msg.key.participant].filter(Boolean));

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    // --- Enregistrement automatique des stickers reçus (.autosticker) ---
    // Marche aussi bien en DM qu'en groupe : on ne regarde que le TYPE de
    // message (stickerMessage), jamais `from`, donc un sticker envoyé dans
    // un groupe est traité exactement comme un sticker reçu en privé. On
    // exclut les stickers envoyés par le propriétaire lui-même (fromMe) :
    // pas besoin de se les renvoyer à soi-même.
    //
    // Sauvegarde = renvoyer le sticker directement dans le "self-chat" du
    // compte connecté (conversation "Vous" dans WhatsApp), et non plus sur
    // le disque du serveur : ainsi il apparaît directement dans WhatsApp,
    // consultable/téléchargeable depuis le téléphone comme n'importe quel
    // sticker reçu normalement. Fait en tâche de fond (sans await) pour ne
    // jamais ralentir le reste du traitement du message (commandes, etc.).
    if (msg.message.stickerMessage && !msg.key.fromMe && isAutoStickerSaveActive()) {
      (async () => {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        const selfJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

        // Un buffer valide commence toujours par l'en-tête RIFF/WEBP. Quand
        // le téléphone était verrouillé au moment de la réception, le lien du
        // média peut avoir expiré ou le téléchargement peut être partiel/
        // corrompu : dans ce cas WhatsApp accepte quand même l'envoi du
        // message, mais le sticker qui arrive côté téléphone est cassé et
        // impossible à sauvegarder. On vérifie donc l'en-tête avant d'envoyer,
        // et on réessaie plusieurs fois plutôt que d'envoyer un fichier
        // invalide ou d'abandonner silencieusement au premier échec.
        const isValidWebp = (buf) =>
          Buffer.isBuffer(buf) &&
          buf.length > 0 &&
          buf.toString("ascii", 0, 4) === "RIFF" &&
          buf.toString("ascii", 8, 12) === "WEBP";

        const MAX_ATTEMPTS = 3;
        let lastError = null;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            // reuploadRequest : si l'URL du média a déjà expiré au moment où
            // le bot le récupère, Baileys redemande automatiquement au
            // serveur WhatsApp un lien frais au lieu d'échouer directement.
            const buffer = await downloadMediaMessage(
              { message: msg.message },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );
            if (!isValidWebp(buffer)) {
              throw new Error("Buffer sticker invalide ou incomplet");
            }
            await sock.sendMessage(selfJid, { sticker: buffer });
            console.log(`🖼️ Sticker enregistré automatiquement dans le self-chat WhatsApp`);
            return;
          } catch (e) {
            lastError = e;
            console.log(
              `⚠️ Erreur enregistrement auto sticker (tentative ${attempt}/${MAX_ATTEMPTS}) :`,
              e.message
            );
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        }

        // Après plusieurs échecs : on informe dans le self-chat plutôt que
        // de laisser croire qu'un sticker a été traité alors qu'il a été
        // perdu en silence.
        try {
          await sock.sendMessage(selfJid, {
            text: `⚠️ Un sticker reçu n'a pas pu être enregistré automatiquement (${lastError?.message || "erreur inconnue"}).`,
          });
        } catch (_) {
          // rien à faire de plus si même ce message échoue
        }
      })();
    }

    // --- Sauvegarde d'un statut avec .save (n'importe quel statut, mais
    // uniquement quand c'est TOI qui commentes) ---
    // Vérifiée AVANT .statusreply : les deux features regardent le même
    // type de message (un commentaire sur un statut), mais avec des
    // conditions différentes (auteur du statut / mot déclencheur), donc
    // aucun risque de conflit — au pire aucune des deux ne matche.
    try {
        const saved = await handlePossibleStatusSaveCommand(sock, msg);
        if (saved) return;
    } catch (e) {
        console.error("❌ Erreur handlePossibleStatusSaveCommand:", e.message);
    }

    // --- Auto-envoi du statut quand quelqu'un le commente (.statusreply) ---
    // Doit passer AVANT .indispo / .absent / le chatbot IA : si quelqu'un
    // répond à un de tes statuts avec un mot déclencheur ("envoi"...), on
    // veut lui renvoyer le statut et s'arrêter là, sans que le chatbot IA
    // ou une réponse automatique ne vienne aussi répondre au même message.
    try {
        const sent = await handlePossibleStatusReplySend(sock, msg);
        if (sent) return;
    } catch (e) {
        console.error("❌ Erreur handlePossibleStatusReplySend:", e.message);
    }

    // Le bot tourne sur ton propre numéro : tes propres messages arrivent
    // avec fromMe=true. On les traite quand même s'ils commencent par un
    // préfixe (une vraie commande), mais on ignore tout le reste de ce
    // que TU envoies pour éviter que le bot ne réagisse à chaque message
    // que tu écris normalement à tes contacts.
    const prefixes = config.PREFIXES || [config.PREFIX];
    const usedPrefix = prefixes.find((p) => body.startsWith(p));

    // --- Mode absent (.indispo) ---
    // Désactivation automatique dès que TU écris un message normal (pas une
    // commande) : signe que tu es de retour. On ne désactive pas si c'est
    // une commande (ex: .indispo lui-même) pour ne pas se marcher dessus.
    if (msg.key.fromMe && !usedPrefix && isAfkActive()) {
      setAfk(false, "");
    }
    // Réponse automatique à qui t'écrit en DM (pas en groupe) pendant que
    // le mode absent est actif — avec un cooldown de 5 min par contact
    // pour ne pas spammer la même personne à chaque message.
    if (!msg.key.fromMe && !from.endsWith("@g.us") && isAfkActive()) {
      const lastReply = afkRepliedRecently.get(from) || 0;
      if (Date.now() - lastReply > 5 * 60 * 1000) {
        afkRepliedRecently.set(from, Date.now());
        if (afkRepliedRecently.size > 500) {
          afkRepliedRecently.delete(afkRepliedRecently.keys().next().value);
        }
        sock
          .sendMessage(from, { text: getAfkMessage() })
          .catch((e) => console.log("Erreur réponse .indispo:", e.message));
      }
    }

    // --- Réponse automatique persistante (.absent) ---
    // Contrairement à .indispo : ne se désactive jamais toute seule (ni quand tu
    // écris, ni au redémarrage du bot) — seul .absent off l'arrête.
    // Même cooldown de 5 min par contact, DM uniquement.
    if (!msg.key.fromMe && !from.endsWith("@g.us") && isAutoReplyActive()) {
      const lastReply = afkRepliedRecently.get(`autoreply:${from}`) || 0;
      if (Date.now() - lastReply > 5 * 60 * 1000) {
        afkRepliedRecently.set(`autoreply:${from}`, Date.now());
        if (afkRepliedRecently.size > 500) {
          afkRepliedRecently.delete(afkRepliedRecently.keys().next().value);
        }
        sock
          .sendMessage(from, { text: getAutoReplyMessage() })
          .catch((e) => console.log("Erreur réponse .absent:", e.message));
      }
    }

    // --- Chatbot (.chatbot) — RESTREINT AUX SALUTATIONS / REMERCIEMENTS ---
    // Ne génère plus rien via l'IA : les réponses sont 100% déterministes,
    // choisies au hasard dans de courtes listes fixes, pour garantir que le
    // bot ne dérive JAMAIS vers une conversation générale, une demande
    // d'aide ou un sujet non autorisé. Si le message ne correspond à aucun
    // cas reconnu ci-dessous, le bot reste muet.

    function pick(list) {
      return list[Math.floor(Math.random() * list.length)];
    }

    // Pour enchaîner naturellement après une virgule (ex: "Bonjour bb,
    // comment tu vas ?" et non "Bonjour bb, Comment tu vas ?").
    function lowerFirst(str) {
      return str.charAt(0).toLowerCase() + str.slice(1);
    }

    // Salutation "neutre" (ni bonjour ni bonsoir explicitement) : le mot
    // utilisé dépend de l'heure actuelle. Matin/après-midi -> Bonjour,
    // à partir de 17h -> Bonsoir. On fixe le fuseau sur Africa/Abidjan
    // explicitement (au lieu de l'heure locale du serveur) pour que ça
    // reste correct même si le bot tourne sur un serveur hébergé ailleurs
    // dans le monde.
    function timeBasedGreetingWord() {
      const hour = Number(
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Africa/Abidjan",
          hour: "numeric",
          hour12: false,
        }).format(new Date())
      );
      return hour >= 5 && hour < 17 ? "Bonjour" : "Bonsoir";
    }

    // ======================== EXPRESSIONS IVOIRIENNES, ABRÉVIATIONS ET
    // ÉCRITURE SMS ========================
    // Normalise les expressions ivoiriennes, les abréviations WhatsApp,
    // l'écriture SMS, les fautes de frappe courantes, les répétitions de
    // lettres et l'absence d'accents vers leur forme standard, AVANT toute
    // détection. Le reste du moteur (regex, réponses...) n'a donc pas
    // besoin d'être dupliqué pour chaque variante : il continue de
    // fonctionner sur la forme "propre" du message.
    function normalizeIvorianSms(rawText) {
      let t = rawText;

      // --- Salutations (répétitions de lettres, abréviations) ---
      t = t.replace(/\bbjrr+\b/gi, "Bonjour");
      t = t.replace(/\bbonjr\b/gi, "Bonjour");
      t = t.replace(/\bbonjou\b/gi, "Bonjour");
      t = t.replace(/\bbonjourr+\b/gi, "Bonjour");
      t = t.replace(/\bbjr\b/gi, "Bonjour");

      t = t.replace(/\bsltt+\b/gi, "Salut");
      t = t.replace(/\bsalu\b/gi, "Salut");
      t = t.replace(/\bsalutt+\b/gi, "Salut");
      t = t.replace(/\bslt\b/gi, "Salut");

      t = t.replace(/\bbsrr+\b/gi, "Bonsoir");
      t = t.replace(/\bbonsoi\b/gi, "Bonsoir");
      t = t.replace(/\bbonsoirr+\b/gi, "Bonsoir");
      t = t.replace(/\bbsr\b/gi, "Bonsoir");

      t = t.replace(/\bccc+\b/gi, "Coucou");
      t = t.replace(/\bcoucouu+\b/gi, "Coucou");
      t = t.replace(/\bcc\b/gi, "Coucou");

      // --- "Ça va ?" (abréviations, avec ou sans petit mot doux — le
      // petit mot doux est retiré pour retomber sur la question standard,
      // qui déclenchera la réponse habituelle) ---
      t = t.replace(/\bcv\s+bb\b/gi, "ça va");
      t = t.replace(/\bcv\s+mon\s+c(oe|œ)ur\b/gi, "ça va");
      t = t.replace(/\bsava\s+bb\b/gi, "ça va");
      t = t.replace(/\bcava\s+bb\b/gi, "ça va");
      t = t.replace(/\bsa\s+va\s+bb\b/gi, "ça va");
      t = t.replace(/\bca\s+va\s+bb\b/gi, "ça va");
      t = t.replace(/\bcv\b/gi, "ça va");
      t = t.replace(/\bcva\b/gi, "ça va");
      t = t.replace(/\bsava\b/gi, "ça va");
      t = t.replace(/\bcava\b/gi, "ça va");

      // --- "Et toi ?" ---
      t = t.replace(/\be\s*twa\b/gi, "et toi");
      t = t.replace(/\be\s+toi\b/gi, "et toi");
      t = t.replace(/\btwa\b/gi, "toi");

      // --- Merci ---
      t = t.replace(/\bmerciii+\b/gi, "merci");
      t = t.replace(/\bmercii\b/gi, "merci");
      t = t.replace(/\bmrci\b/gi, "merci");
      t = t.replace(/\bmrc\b/gi, "merci");
      t = t.replace(/\bmer6\b/gi, "merci");
      // NB : lookahead en fin de motif au lieu de \b — \b ne fonctionne
      // pas correctement juste après une lettre accentuée en fin de mot
      // (ex: "mercé"), le moteur regex JS ne traitant pas é/è/à/etc.
      // comme des caractères de mot (même limite déjà documentée plus bas
      // pour RE_APOLOGY).
      t = t.replace(/\bmerc[ée](?=\s|$|[.,;:!?])/gi, "merci");

      // --- Bonne nuit ---
      t = t.replace(/\bbn8\b/gi, "bonne nuit");
      t = t.replace(/\bbne\s+nuit\b/gi, "bonne nuit");
      t = t.replace(/\bbonne\s+nuiit\b/gi, "bonne nuit");
      t = t.replace(/\bbonne\s+nui\b/gi, "bonne nuit");
      t = t.replace(/\bbn\b/gi, "bonne nuit");

      // --- Au revoir ---
      t = t.replace(/\baurevoir\b/gi, "au revoir");
      t = t.replace(/\bau\s+revwar\b/gi, "au revoir");
      t = t.replace(/[àa]\+/gi, "à plus");
      // NB : (^|\s) au lieu de \b avant "à" — même limite que ci-dessus,
      // \b ne matche pas correctement juste avant une lettre accentuée.
      t = t.replace(/(^|\s)[àa]\s+tt(?=\s|$|[.,;:!?])/gi, "$1à plus");

      return t;
    }

    // Expressions ivoiriennes de "prise de nouvelles" (avec abréviations,
    // écriture SMS et fautes de frappe courantes) : toutes équivalentes à
    // "Comment tu vas ?" — "On dit quoi ?", "ndk", "C'est comment ?", "Ça
    // dit quoi ?", "Ça raconte quoi ?", "Quoi de neuf ?", "On est comment
    // ?"...
    // NB : (^|\s) au lieu de ^ strict en début de motif, comme pour
    // RE_HOW_ARE_YOU juste au-dessus — permet de reconnaître l'expression
    // même précédée d'une virgule résiduelle après une salutation (ex:
    // "Bonjour bb, on dit quoi ?").
    const RE_IVORIAN_HOW_ARE_YOU = /(^|\s)(on\s*(dit|di)\s*(quoi|koi|kwa|coi)|ndk|on\s*est\s*(comment|cmt)|c\s*'?\s*est\s*(comment|cmt|komen|koman)|c\s+(comment|komen|koman)|cmt|(ç|c|s)a\s*(dit|di)\s*(quoi|koi)|(ç|c|s)a\s*raconte\s*(quoi|koi)|(quoi|koi|kwa)\s*de\s*neuf|koi\s*2\s*9)\s*\??\s*$/i;

    // ======================== CORRECTION DES FAUTES D'ORTHOGRAPHE
    // ======================== Corrige les fautes de frappe courantes
    // (lettre manquante, en trop, ou substituée) sur les mots-clés utilisés
    // par le moteur de détection ci-dessous (bonjour, merci, comment...),
    // via une distance d'édition (Levenshtein). Le texte corrigé ne sert
    // QUE pour la détection interne : les réponses envoyées restent
    // toujours choisies dans les listes fixes ci-dessus, jamais générées à
    // partir du texte de l'utilisateur — la faute de frappe n'est donc
    // jamais "affichée en retour" ni ne peut faire dériver le bot vers un
    // sujet non autorisé.
    function levenshteinDistance(a, b) {
      const m = a.length;
      const n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      return dp[m][n];
    }

    function stripAccents(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    // Mots-clés utilisés par les regex de détection ci-dessous, avec la
    // distance d'édition maximale tolérée (volontairement basse — 1 ou 2 —
    // et jamais appliquée aux mots trop courts, pour éviter de corriger un
    // mot français normal en un mot-clé par erreur).
    const CHATBOT_KEYWORDS = [
      ["bonjour", 2],
      ["bonsoir", 2],
      ["salut", 1],
      ["coucou", 2],
      ["merci", 1],
      ["comment", 2],
      ["journee", 2],
      ["nuit", 1],
      ["soiree", 2],
      ["weekend", 2],
      ["courage", 2],
      ["revoir", 2],
      ["bientot", 2],
      ["demain", 2],
      ["pardon", 2],
      ["desole", 2],
      ["excuse", 2],
      ["gentil", 2],
      ["sympa", 1],
      ["formidable", 2],
      ["agreable", 2],
      ["quoi", 1],
      ["neuf", 1],
      ["raconte", 2],
    ];

    function fuzzyCorrectWord(word) {
      const folded = stripAccents(word.toLowerCase());
      // Déjà correctement orthographié (avec ou sans accent) : on ne
      // touche à rien.
      if (CHATBOT_KEYWORDS.some(([kw]) => kw === folded)) return word;

      let best = null;
      let bestDist = Infinity;
      for (const [kw, maxDist] of CHATBOT_KEYWORDS) {
        if (Math.abs(folded.length - kw.length) > maxDist) continue;
        const dist = levenshteinDistance(folded, kw);
        if (dist <= maxDist && dist < bestDist) {
          bestDist = dist;
          best = kw;
        }
      }
      if (!best) return word;
      // Réinjecte la majuscule initiale si le mot d'origine en avait une.
      return /^[A-ZÀ-Ö]/.test(word) ? best.charAt(0).toUpperCase() + best.slice(1) : best;
    }

    function fuzzyCorrectFrench(text) {
      return text.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, (word) => {
        // Mots trop courts (1-3 lettres) : jamais corrigés, trop de
        // risques de faux positifs (ex: "toi", "ta", "va").
        if (word.length <= 3) return word;
        return fuzzyCorrectWord(word);
      });
    }

    // Regex de détection. Ancrées sur le message entier (après trim), pas
    // seulement le début, pour repérer une salutation/un remerciement même
    // combiné à une question de politesse dans le même message.
    const RE_GREETING = /^(salut|coucou|cc|slt|bonjour|bonsoir|hello|hi|hey|yo|bjr)\b/i;
    // Salutation affectueuse (couple) : mot de salutation + petit mot doux.
    // Vérifiée AVANT RE_GREETING pour être reconnue comme telle plutôt que
    // comme "salutation + texte non reconnu ignoré".
    const RE_AFFECTIONATE_GREETING = /^(salut|coucou|cc|slt|bonjour|bonsoir|hello|hi|hey|yo|bjr)\s+(mon\s+|ma\s+)?(bb|b[ée]b[ée]|c(oe|œ)ur|ch[ée]ri[e]?|amour|love|babe)\b/i;
    // NB : pas de \b devant les mots accentués (ça, ta, journée...) — le
    // moteur regex JS ne traite pas les lettres accentuées comme des
    // caractères de mot, donc \b ne matche pas correctement juste avant.
    const RE_HOW_ARE_YOU = /(^|\s)(comment\s+(tu\s+vas|ça\s+va|ca\s+va|vas[-\s]?tu)|ça\s+va|ca\s+va|sa\s+va|tu\s+vas\s+bien)\s*\??\s*$/i;

    // Réponse à "comment tu vas ?" où l'utilisateur relance EXPLICITEMENT
    // la question dans la foulée (ex: "Je vais bien merci et toi ?", "Ça
    // va, et toi ?", "Ça va bien, toi aussi ?") : on répond en donnant
    // aussi notre propre état, MAIS SANS jamais reposer la question à
    // notre tour (sinon ça boucle). Nécessite littéralement "et toi" /
    // "toi aussi" à la fin — un simple "?" ne suffit pas (voir
    // RE_HOW_ARE_YOU_STATE_ONLY et RE_HOW_ARE_YOU ci-dessous pour les
    // autres cas).
    const RE_HOW_ARE_YOU_RECIPROCAL = /^(je\s+vais\s+(tr[èe]s\s+)?bien|(ça|ca|sa)\s+va\s+(tr[èe]s\s+)?bien|tout\s+va\s+bien|je\s+me\s+porte\s+bien|pas\s+mal|(ça|ca|sa)\s+va)(\s*,?\s*merci)?\s*,?\s*(et\s+toi|toi\s+aussi)\s*\??\s*\.?\s*$/i;

    // Simple état annoncé SANS relance ni "merci" formulé comme une vraie
    // question de retour (ex: "Je vais bien.", "Ça va bien.", "Ça va
    // merci.", "Pas mal.") : ici on ne DOIT PAS donner notre propre état
    // en retour (ça donnerait l'impression de répondre à une question
    // qu'on ne nous a pas posée) — une simple formule de politesse courte
    // suffit. Exclue explicitement tout message qui contient un "?" : dans
    // ce cas c'est une vraie question, gérée par RE_HOW_ARE_YOU plus bas.
    const RE_HOW_ARE_YOU_STATE_ONLY = /^(je\s+vais\s+(tr[èe]s\s+)?bien|(ça|ca|sa)\s+va\s+(tr[èe]s\s+)?bien|tout\s+va\s+bien|je\s+me\s+porte\s+bien|pas\s+mal|(ça|ca|sa)\s+va)(\s*,?\s*merci)?\s*\.?\s*$/i;
    // Reconnaît aussi les formulations courtes/incomplètes qui ont le même
    // sens ("Et ta journée ?", "Et ta journée alors ?", "Ta journée ?",
    // "Et toi, ta journée ?"), en plus des formes complètes avec verbe
    // ("comment se passe ta journée", "ta journée se passe bien", etc.).
    const RE_DAY_QUESTION = /(^|\s)(comment\s+(se\s+passe|s'est\s+pass[ée]e?|s'est\s+pass[ée])\s+ta\s+journ[ée]e|ta\s+journ[ée]e\s+(s'est\s+bien\s+pass[ée]e?|se\s+passe\s+bien)|tu\s+(as\s+pass[ée]|passes)\s+une\s+bonne\s+journ[ée]e|(et\s+)?(toi\s*,?\s*)?ta\s+journ[ée]e(\s+alors)?)\s*\??\s*$/i;
    const RE_THANKS = /^(merci\s+beaucoup|merci\s+bien|merci\s+infiniment|je\s+te\s+remercie|merci)\b/i;


    // Une vraie question/demande ailleurs dans le message : dans ce cas, on
    // ne répond jamais avec une simple formule de politesse (thanks, au
    // revoir, excuses, compliment...), pour ne pas donner l'impression
    // d'ignorer une vraie demande. Réutilisé par plusieurs catégories.
    const REQUEST_INDICATORS = /\?|peux[-\s]?tu\b|tu\s+peux\b|aide[-\s]?moi\b|dis[-\s]?moi\b|raconte[-\s]?moi\b|explique[-\s]?moi\b|montre[-\s]?moi\b|envoie[-\s]?moi\b|donne[-\s]?moi\b|\bstp\b|s'il\s+te\s+pla[iî]t/i;

    // Souhait de bonne journée / soirée / nuit / week-end / courage.
    const RE_WISH_NUIT = /^(bonne\s+nuit)\b/i;
    const RE_WISH_SOIREE = /^(bonne\s+soir[ée]e|passe\s+une\s+bonne\s+soir[ée]e)\b/i;
    const RE_WISH_JOURNEE = /^(bonne\s+journ[ée]e(\s+[àa]\s+toi)?|passe\s+une\s+bonne\s+journ[ée]e)\b/i;
    const RE_WISH_WEEKEND = /^(bon\s+week-?end)\b/i;
    const RE_WISH_COURAGE = /^(bon\s+courage)\b/i;

    // Fin de journée/nuit AFFECTUEUSE (couple) : "bonne nuit bb", "dors
    // bien mon cœur", "bonne soirée amour"... Vérifiées AVANT les souhaits
    // "neutres" ci-dessus, sinon "bonne nuit bb" matcherait RE_WISH_NUIT
    // en ignorant le petit mot doux.
    const RE_AFFECTIONATE_NUIT = /^(bonne\s+nuit|dors\s+bien|fais\s+de\s+beaux\s+r[êe]ves)\s+(mon\s+|ma\s+)?(bb|b[ée]b[ée]|c(oe|œ)ur|ch[ée]ri[e]?|amour|love|babe)\b/i;
    const RE_AFFECTIONATE_SOIREE = /^(bonne\s+soir[ée]e)\s+(mon\s+|ma\s+)?(bb|b[ée]b[ée]|c(oe|œ)ur|ch[ée]ri[e]?|amour|love|babe)\b/i;

    // Au revoir / fin de conversation.
    const RE_GOODBYE = /^(au\s+revoir|[àa]\s+bient[oô]t|[àa]\s+plus\s+tard|[àa]\s+plus\b|[àa]\s+demain|je\s+dois\s+partir|je\s+m'?en\s+vais|bonne\s+continuation)\b/i;

    // Excuses.
    // NB : lookahead au lieu de \b en fin de motif — \b ne fonctionne pas
    // correctement juste après une lettre accentuée en fin de chaîne (ex:
    // "désolé" seul), le moteur regex JS ne traitant pas é/è/etc. comme
    // des caractères de mot.
    const RE_APOLOGY = /^(d[ée]sol[ée]e?|pardon|excuse[-\s]?moi|je\s+m'?excuse)(?=\s|$|[.,;:!?])/i;

    // Compliments simples.
    const RE_COMPLIMENT = /\btu\s+es\s+(gentil(le)?|sympa|cool|agr[ée]able|formidable)\b|j'?aime\s+bien\s+discuter\s+avec\s+toi\b/i;

    const WISH_NUIT_REPLIES = ["Merci, bonne nuit à toi aussi.", "Bonne nuit, prends soin de toi."];
    const WISH_SOIREE_REPLIES = ["Merci, bonne soirée à toi aussi.", "Merci 😊 Passe une bonne soirée également."];
    const WISH_JOURNEE_REPLIES = ["Merci, bonne journée à toi aussi.", "Merci 😊 Toi aussi passe une bonne journée."];
    const WISH_WEEKEND_REPLIES = ["Merci, toi aussi bon week-end.", "Merci 😊 Bon week-end à toi aussi."];
    const WISH_COURAGE_REPLIES = ["Merci beaucoup.", "Merci, ça me touche."];

    // Générateurs (dépendent du petit mot doux choisi au hasard).
    function affectionateNuitReplies(pet) {
      return [
        `Bonne nuit ${pet}, dors bien.`,
        `Bonne nuit ${pet}, fais de beaux rêves.`,
        `Dors bien ${pet}.`,
        `Fais de beaux rêves ${pet}.`,
        `Repose-toi bien ${pet}.`,
        `Passe une bonne nuit ${pet}.`,
      ];
    }
    function affectionateSoireeReplies(pet) {
      return [
        `Bonne soirée ${pet}.`,
        `Merci, bonne soirée ${pet}.`,
        `Passe une bonne soirée ${pet}.`,
      ];
    }
    const GOODBYE_REPLIES = ["Au revoir, à bientôt.", "À bientôt !", "À plus, prends soin de toi.", "D'accord, à bientôt."];
    const APOLOGY_REPLIES = ["Ce n'est pas grave.", "Pas de souci.", "Aucun problème."];
    const COMPLIMENT_REPLIES = ["Merci, c'est gentil.", "Merci beaucoup.", "Merci, ça me fait plaisir."];

    function buildGreetingWord(userText) {
      const t = userText.trim().toLowerCase();
      if (/^bonjour\b/.test(t)) return "Bonjour";
      if (/^bonsoir\b/.test(t)) return "Bonsoir";
      return timeBasedGreetingWord();
    }

    const HOW_ARE_YOU_ANSWERS = [
      "Ça va bien, merci.",
      "Je vais bien, merci.",
      "Ça va très bien, merci.",
    ];
    // Réponses SANS relance ("Et toi ?"), utilisées quand l'utilisateur a
    // déjà répondu lui-même à "comment tu vas ?" en relançant explicitement
    // la question (et toi ?, toi aussi ?).
    const HOW_ARE_YOU_ACK_REPLIES = [
      "Je vais bien aussi, merci.",
      "Ça va bien, merci.",
      "Tout va bien, merci.",
      "Très bien, merci.",
    ];
    // Réponses neutres, utilisées quand l'utilisateur annonce juste son
    // état SANS relancer la question : on ne donne pas notre propre état
    // (on ne répond pas à une question qu'on ne nous a pas posée), une
    // simple formule de politesse suffit.
    const HOW_ARE_YOU_NEUTRAL_REPLIES = [
      "D'accord.",
      "Tant mieux.",
      "Content de l'apprendre.",
      "C'est une bonne nouvelle.",
      "Ravi de l'apprendre.",
    ];
    // Deux listes séparées selon que la journée est encore en cours
    // (matin/après-midi -> au présent) ou terminée (soir/nuit -> au
    // passé), avec la relance "Et la tienne ?" déjà incluse.
    const DAY_ANSWERS_PRESENT = [
      "Elle se passe bien, merci. Et la tienne ?",
      "Oui, elle se passe bien. Et la tienne ?",
      "Oui, ma journée se passe bien, merci. Et la tienne ?",
      "Oui, tout se passe bien. Et la tienne ?",
    ];
    const DAY_ANSWERS_PAST = [
      "Elle s'est bien passée, merci. Et la tienne ?",
      "Oui, elle s'est bien passée. Et la tienne ?",
      "Oui, elle s'est bien passée, merci. Et la tienne ?",
      "Oui, tout s'est bien passé. Et la tienne ?",
    ];
    // Même bornage horaire que timeBasedGreetingWord() : avant 17h -> journée
    // en cours (présent), à partir de 17h -> journée terminée (passé).
    function dayAnswer() {
      const hour = Number(
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Africa/Abidjan",
          hour: "numeric",
          hour12: false,
        }).format(new Date())
      );
      const dayStillOngoing = hour >= 5 && hour < 17;
      return pick(dayStillOngoing ? DAY_ANSWERS_PRESENT : DAY_ANSWERS_PAST);
    }
    const POLITE_QUESTIONS = ["Comment tu vas ?", "Ça va ?", "Comment ça va ?", "Tu vas bien ?"];
    const PET_NAMES = ["bb", "mon cœur"];
    const THANKS_REPLIES = ["De rien 😊", "Avec plaisir 😊", "Je t'en prie 🙂", "Il n'y a pas de quoi 😊"];

    // Construit la réponse à envoyer, ou null si aucun cas autorisé ne
    // correspond (le chatbot doit alors rester muet).
    function buildChatbotReply(rawText) {
      // 1) Normalise les abréviations WhatsApp / écriture SMS / expressions
      //    ivoiriennes, PUIS 2) corrige les fautes de frappe restantes sur
      //    les mots-clés reconnus. Tout le reste de la détection ci-dessous
      //    s'applique ensuite sans modification.
      const text = fuzzyCorrectFrench(normalizeIvorianSms(rawText)).trim();
      if (!text) return null;

      // 1. Remerciement : le bot répond tant que le message reste de la
      //    gratitude pure (ex: "Merci", "Merci pour tout ce que tu fais",
      //    "Merci pour hier"). Si une VRAIE question ou demande suit
      //    ("Merci, peux-tu m'aider ?", "Merci, tu peux m'appeler ?"), il
      //    ne répond PAS "de rien" (ça donnerait l'impression d'ignorer la
      //    demande) : il reste muet, la demande attend une vraie réponse
      //    du propriétaire.
      if (RE_THANKS.test(text)) {
        if (REQUEST_INDICATORS.test(text)) {
          return null;
        }
        return pick(THANKS_REPLIES);
      }

      // 2. Salutation affectueuse (couple) : "bonjour bb", "coucou mon
      //    cœur", "salut amour"... Ton affectueux, MAIS jamais de vraie
      //    déclaration de sentiments ou de relation ("je t'aime", "tu es
      //    ma copine", etc.) — uniquement une variante chaleureuse de la
      //    salutation normale.
      if (RE_AFFECTIONATE_GREETING.test(text)) {
        const greetingWord = buildGreetingWord(text);
        const petName = pick(PET_NAMES);
        const rest = text.replace(RE_AFFECTIONATE_GREETING, "").trim();

        if (RE_DAY_QUESTION.test(rest) || RE_DAY_QUESTION.test(text)) {
          return `${greetingWord} ${petName}, ${lowerFirst(dayAnswer())}`;
        }
        if (
          RE_HOW_ARE_YOU.test(rest) ||
          RE_HOW_ARE_YOU.test(text) ||
          RE_IVORIAN_HOW_ARE_YOU.test(rest) ||
          RE_IVORIAN_HOW_ARE_YOU.test(text)
        ) {
          return `${greetingWord} ${petName}, ${lowerFirst(pick(HOW_ARE_YOU_ANSWERS))} Et toi ?`;
        }
        if (!rest) {
          return `${greetingWord} ${petName}, ${lowerFirst(pick(POLITE_QUESTIONS))}`;
        }
        // Salutation affectueuse suivie d'autre chose de non autorisé :
        // on répond uniquement à la salutation et on ignore le reste.
        return Math.random() < 0.5
          ? `${greetingWord} ${petName} !`
          : `${greetingWord} ${petName}, ${lowerFirst(pick(POLITE_QUESTIONS))}`;
      }

      // 3. Salutation (seule ou combinée à une question de politesse
      //    autorisée : "comment tu vas" / "ta journée").
      if (RE_GREETING.test(text)) {
        const greetingWord = buildGreetingWord(text);
        const rest = text.replace(RE_GREETING, "").trim();

        if (RE_DAY_QUESTION.test(rest) || RE_DAY_QUESTION.test(text)) {
          return `${greetingWord} ! ${dayAnswer()}`;
        }
        if (
          RE_HOW_ARE_YOU.test(rest) ||
          RE_HOW_ARE_YOU.test(text) ||
          RE_IVORIAN_HOW_ARE_YOU.test(rest) ||
          RE_IVORIAN_HOW_ARE_YOU.test(text)
        ) {
          return `${greetingWord} ! ${pick(HOW_ARE_YOU_ANSWERS)} Et toi ?`;
        }
        // Salutation seule, ou suivie d'autre chose de non autorisé
        // (demande d'aide, question générale, etc.) : on répond
        // uniquement à la salutation et on ignore le reste.
        if (!rest || rest.length > 0) {
          // rest vide -> salutation simple : on peut enchaîner nous-même
          // avec une question de politesse courte.
          // rest non vide et non reconnu -> on ignore le reste, mais on
          // garde une réponse courte et variée (avec ou sans relance).
          if (!rest) {
            return `${greetingWord} ! ${pick(POLITE_QUESTIONS)}`;
          }
          return Math.random() < 0.5
            ? `${greetingWord} !`
            : `${greetingWord} ! ${pick(POLITE_QUESTIONS)}`;
        }
      }

      // 4. Réponse déjà donnée à "comment tu vas ?".
      //    - Relance explicite ("et toi ?", "toi aussi ?") -> on redonne
      //      notre état, SANS jamais reposer la question à notre tour.
      //    - État seul, sans relance (ex: "Je vais bien.", "Ça va merci.")
      //      -> simple formule de politesse, sans donner notre propre état.
      if (RE_HOW_ARE_YOU_RECIPROCAL.test(text)) {
        return pick(HOW_ARE_YOU_ACK_REPLIES);
      }
      if (RE_HOW_ARE_YOU_STATE_ONLY.test(text)) {
        return pick(HOW_ARE_YOU_NEUTRAL_REPLIES);
      }

      // 5. "Comment tu vas ?" posé seul, sans salutation devant — y
      //    compris les expressions ivoiriennes de prise de nouvelles :
      //    "On dit quoi ?", "ndk", "C'est comment ?", "Ça dit quoi ?",
      //    "Ça raconte quoi ?", "Quoi de neuf ?", "On est comment ?"...
      if (RE_HOW_ARE_YOU.test(text) || RE_IVORIAN_HOW_ARE_YOU.test(text)) {
        return `${pick(HOW_ARE_YOU_ANSWERS)} Et toi ?`;
      }

      // 6. Question sur la journée posée seule, sans salutation devant.
      if (RE_DAY_QUESTION.test(text)) {
        return dayAnswer();
      }

      // 7. Fin de journée/nuit AFFECTUEUSE (couple) : "bonne nuit bb",
      //    "dors bien mon cœur", "bonne soirée amour"... Vérifiée avant
      //    les souhaits neutres pour ne pas perdre le petit mot doux.
      //    Ton affectueux uniquement, jamais de vraie déclaration de
      //    sentiments/relation.
      if (RE_AFFECTIONATE_NUIT.test(text) || RE_AFFECTIONATE_SOIREE.test(text)) {
        if (REQUEST_INDICATORS.test(text)) return null;
        const petName = pick(PET_NAMES);
        if (RE_AFFECTIONATE_NUIT.test(text)) return pick(affectionateNuitReplies(petName));
        return pick(affectionateSoireeReplies(petName));
      }

      // 8. Souhait de bonne journée / soirée / nuit / week-end / courage.
      //    Si une vraie question/demande suit, on reste muet plutôt que de
      //    répondre uniquement au souhait.
      if (
        RE_WISH_NUIT.test(text) ||
        RE_WISH_SOIREE.test(text) ||
        RE_WISH_JOURNEE.test(text) ||
        RE_WISH_WEEKEND.test(text) ||
        RE_WISH_COURAGE.test(text)
      ) {
        if (REQUEST_INDICATORS.test(text)) return null;
        if (RE_WISH_NUIT.test(text)) return pick(WISH_NUIT_REPLIES);
        if (RE_WISH_SOIREE.test(text)) return pick(WISH_SOIREE_REPLIES);
        if (RE_WISH_JOURNEE.test(text)) return pick(WISH_JOURNEE_REPLIES);
        if (RE_WISH_WEEKEND.test(text)) return pick(WISH_WEEKEND_REPLIES);
        return pick(WISH_COURAGE_REPLIES);
      }

      // 9. Au revoir / fin de conversation. Ne relance jamais une question.
      if (RE_GOODBYE.test(text)) {
        if (REQUEST_INDICATORS.test(text)) return null;
        return pick(GOODBYE_REPLIES);
      }

      // 10. Excuses. Ne demande jamais d'explication, ne relance pas.
      if (RE_APOLOGY.test(text)) {
        if (REQUEST_INDICATORS.test(text)) return null;
        return pick(APOLOGY_REPLIES);
      }

      // 11. Compliment simple. Réponse polie courte, sans relance.
      if (RE_COMPLIMENT.test(text)) {
        if (REQUEST_INDICATORS.test(text)) return null;
        return pick(COMPLIMENT_REPLIES);
      }

      // Tout le reste (demandes d'aide, questions générales, autres
      // sujets...) : le chatbot ne répond rien du tout.
      return null;
    }

    // Anti-spam : évite que le chatbot ne réponde en boucle si un même
    // contact enchaîne plusieurs salutations très rapprochées (ex: il tape
    // "salut" deux fois par erreur). Un cooldown de 2 minutes par contact.
    const chatbotCooldown = new Map(); // jid -> timestamp du dernier déclenchement
    const CHATBOT_COOLDOWN_MS = 2 * 60 * 1000;
    function isChatbotOnCooldown(jid) {
      const last = chatbotCooldown.get(jid);
      return last && Date.now() - last < CHATBOT_COOLDOWN_MS;
    }
    function markChatbotTriggered(jid) {
      chatbotCooldown.set(jid, Date.now());
    }

    if (
      !msg.key.fromMe &&
      !from.endsWith("@g.us") &&
      isChatbotActive() &&
      body.trim() &&
      !isChatbotExcluded((msg.key.participant || from).split("@")[0]) &&
      !isChatbotOnCooldown(from)
    ) {
      const reply = buildChatbotReply(body);

      if (reply) {
        markChatbotTriggered(from);
        // Pas de simulation de frappe ("composing...") : un indicateur "en
        // train d'écrire" affiché en boucle est régulier et repérable, ce
        // qui peut justement trahir le bot. On se contente d'un simple
        // délai avant l'envoi, sans rien afficher à l'écran.
        const CHATBOT_REPLY_DELAY_MS = 15000; // 15 secondes
        setTimeout(() => {
          sock
            .sendMessage(from, { text: reply }, { quoted: msg })
            .catch((e) => console.log("Erreur réponse .chatbot :", e.message));
        }, CHATBOT_REPLY_DELAY_MS);
      }
    }

    if (msg.key.fromMe && !usedPrefix) return;
    if (!usedPrefix) return;

    const bodyAfterPrefix = body.slice(usedPrefix.length).trim();

    // --- Commande spéciale : .grok_clé_api=gsk_xxx pour enregistrer la clé
    // Groq directement depuis WhatsApp, sans toucher au fichier config.js
    // à la main. Réservé au propriétaire du bot.
    const keySetMatch = bodyAfterPrefix.match(/^grok[_ ]?cl[ée]?_?api\s*=\s*(\S+)$/i);
    if (keySetMatch) {
      // Désactivée pour les instances publiques : config.js est PARTAGÉ par
      // tous les utilisateurs, chacun pourrait le réécrire pour tout le monde.
      if (IS_ORCHESTRATED) {
        await sock.sendMessage(from, {
          text:
            "ℹ️ La clé API de l'IA est gérée par l'administrateur du bot (elle est " +
            "commune à toutes les instances). Si .gpt / .chatbot / .transcrire ne " +
            "répondent pas, préviens-le : tu n'as rien à configurer de ton côté.",
        });
        return;
      }
      const senderNumber = msg.key.fromMe
        ? config.OWNER_NUMBER
        : (msg.key.participant || from).split("@")[0];
      if (senderNumber !== config.OWNER_NUMBER) return;

      const newKey = keySetMatch[1];
      // La valeur est écrite telle quelle dans config.js (du code JavaScript) :
      // on n'accepte donc que les caractères d'une vraie clé API.
      if (!/^[A-Za-z0-9_\-]{10,200}$/.test(newKey)) {
        await sock.sendMessage(from, { text: "❌ Clé invalide (caractères non autorisés)." });
        return;
      }
      try {
        const configPath = path.join(__dirname, "config.js");
        let content = fs.readFileSync(configPath, "utf8");
        if (!/GROQ_API_KEY\s*:/.test(content)) {
          throw new Error("Ligne GROQ_API_KEY introuvable dans config.js");
        }
        content = content.replace(
          /GROQ_API_KEY\s*:\s*"[^"]*"/,
          `GROQ_API_KEY: "${newKey}"`
        );
        fs.writeFileSync(configPath, content, "utf8");
        await sock.sendMessage(from, {
          text:
            "✅ Clé Groq enregistrée dans config.js !\n" +
            "⚠️ Redémarre le bot pour qu'elle soit prise en compte, puis retape .gpt.",
        });
      } catch (err) {
        console.error("Erreur enregistrement clé Groq :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible d'enregistrer la clé automatiquement. Colle-la à la main dans config.js (GROQ_API_KEY).",
        });
      }
      return;
    }

    // Mode privé : seul le propriétaire peut utiliser le bot.
    // Si c'est toi qui envoies la commande (fromMe), on sait déjà que
    // c'est toi, le propriétaire.
    const senderNumber = msg.key.fromMe
      ? config.OWNER_NUMBER
      : (msg.key.participant || from).split("@")[0];
    if (config.MODE === "private" && senderNumber !== config.OWNER_NUMBER) return;

    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;

    let [cmdName, ...args] = bodyAfterPrefix.split(/\s+/);

    // Réponse (avec un préfixe, peu importe le mot utilisé) à un média vue
    // unique déjà en cache ou encore récupérable : on traite ça comme .ok,
    // pour révéler le média sans devoir taper exactement ".ok". Réservé au
    // propriétaire, comme .ok lui-même.
    if (quoted && senderNumber === config.OWNER_NUMBER) {
      const alreadyCached = getViewOnce(quotedId);
      const isViewOnce = alreadyCached || extractViewOnce(quoted);
      if (isViewOnce) {
        cmdName = "ok";
        args = [];
      }
    }

    const command = commands.find(
      (c) => c.name === cmdName.toLowerCase() || (c.aliases && c.aliases.includes(cmdName.toLowerCase()))
    );
    if (!command) return;

    // 🔍 DIAG : temps écoulé entre la réception du message et le moment où
    // on est prêt à lancer la commande (filtres, anti-doublon, etc. — tout
    // ce qui se passe AVANT command.run()).
    console.log(`⏱️ DIAG pre-dispatch: ${Date.now() - receivedAt}ms écoulés avant de lancer .${cmdName}`);

    // Petite réaction (ex: ⏳) sur le message pour montrer que la commande a
    // bien été reçue, AVANT qu'elle ne s'exécute. On n'attend pas le
    // résultat (pas de "await") pour ne pas retarder la commande elle-même,
    // et une erreur ici (ex: réaction refusée) ne doit jamais bloquer
    // l'exécution de la commande.
    // Capturé une seule fois : si ce réglage change en cours de route (cas
    // très rare), on garde quand même la même valeur pour poser ET retirer
    // la réaction, plutôt que de risquer de la poser sans jamais la retirer.
    const reactEmoji = getSetting("COMMAND_REACT_EMOJI");

    if (reactEmoji) {
      sock
        .sendMessage(from, { react: { text: reactEmoji, key: msg.key } })
        .catch((e) => console.log("Erreur réaction commande:", e.message));
    }

    // (Simulation de frappe ".autotyping" retirée : elle ajoutait un délai
    // de 1,2 à 4 secondes avant chaque commande, jugé trop lent à l'usage.
    // Les commandes s'exécutent donc maintenant immédiatement.)

    // On enveloppe "sock" pour que TOUTE réponse envoyée par une commande
    // cite automatiquement le message qui l'a déclenchée (comme quand on
    // tire un message vers la gauche sur WhatsApp pour y répondre). Comme
    // ça, aucune commande n'a besoin d'être modifiée une par une : il suffit
    // que command.run() reçoive ce "sock" enveloppé au lieu du sock brut.
    const sockReply = new Proxy(sock, {
      get(target, prop, receiver) {
        if (prop === "sendMessage") {
          return (jid, content, options = {}) =>
            target.sendMessage(jid, content, { quoted: msg, ...options });
        }
        const value = Reflect.get(target, prop, receiver);
        // Les autres méthodes du sock (groupMetadata, downloadMediaMessage,
        // etc.) doivent rester liées à l'objet d'origine, sinon un "this"
        // interne pointerait vers ce Proxy au lieu du vrai socket.
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      const runStart = Date.now();
      await command.run(sockReply, msg, { from, args, quoted, quotedId, senderNumber });
      // 🔍 DIAG : temps pris par command.run() lui-même (inclut le/les
      // sendMessage() internes, donc l'envoi réseau vers WhatsApp).
      console.log(`⏱️ DIAG command.run(.${cmdName}): ${Date.now() - runStart}ms`);
    } catch (err) {
      console.error(`Erreur dans la commande ${cmdName}:`, err);
      await sock.sendMessage(from, { text: "❌ Une erreur est survenue." }, { quoted: msg });
    } finally {
      // Retire la réaction posée avant l'exécution (ex: ⏳), maintenant que
      // la commande a fini de s'exécuter (avec ou sans erreur) : sur
      // WhatsApp, on "enlève" une réaction en en renvoyant une avec un texte
      // vide sur la même clé de message.
      if (reactEmoji) {
        sock
          .sendMessage(from, { react: { text: "", key: msg.key } })
          .catch((e) => console.log("Erreur suppression réaction commande:", e.message));
      }
    }
  });
}

// ===================== SERVEUR HTTP DE COMPATIBILITÉ (MULTI-PANEL) =====================
// Ce bot n'a besoin d'aucun serveur web pour fonctionner : il ne parle qu'à
// WhatsApp. Mais certains panels/hébergeurs (Render, Railway, Replit, ou des
// panels Pterodactyl configurés en mode "web service") surveillent un port
// HTTP pour savoir si l'app est "vivante", et redémarrent le process s'ils
// ne reçoivent jamais de réponse dessus — ce qui peut ressembler exactement
// à "le bot redémarre tout seul régulièrement", même quand WhatsApp reste
// bien connecté de son côté.
//
// On ouvre donc un petit serveur qui répond juste "OK" sur le port fourni
// par le panel (variable d'environnement PORT), ou 3000 par défaut. Sur les
// panels qui n'en ont pas besoin, ce serveur ne gêne strictement rien : il
// tourne juste en silence à côté. S'il ne peut pas démarrer pour une raison
// quelconque (port déjà utilisé, environnement qui bloque l'écoute réseau...),
// on l'ignore sans jamais faire planter le bot pour autant.
function startHealthCheckServer() {
  try {
    const http = require("http");
    const port = Number(process.env.PORT) || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`${config.BOT_NAME} est en ligne.`);
    });
    server.on("error", (e) => {
      console.warn("⚠️  Serveur HTTP de compatibilité indisponible (ignoré) :", e.message);
    });
    server.listen(port, () => {
      console.log(`🌐 Serveur HTTP de compatibilité à l'écoute sur le port ${port}.`);
    });
  } catch (e) {
    console.warn("⚠️  Impossible de démarrer le serveur HTTP de compatibilité (ignoré) :", e.message);
  }
}

checkCredit();
checkFfmpeg();
checkYtDlp();
// 🐛 CORRECTIF (redémarrages intempestifs) : watchCredit() relançait ce
// contrôle strict TOUTES LES 5 MINUTES, POUR TOUJOURS, en tuant tout le
// process (process.exit(1)) au moindre écart avec les valeurs de référence
// (même un espace invisible dans OWNER_NAME, ou config.js surpris à moitié
// réécrit pile au moment où .gpt_clé_api=... l'enregistre). Sur un
// hébergeur qui relance automatiquement un process qui plante, ça donnait
// exactement le symptôme observé : le bot "redémarre tout seul" en boucle,
// avec le message "connecté et opérationnel" qui revient à chaque fois. Ce
// contrôle ne protège qu'un aspect cosmétique (propriété du bot) une fois
// déjà démarré — aucune fonctionnalité n'en dépend une fois en ligne. On
// garde donc UNIQUEMENT le contrôle unique au démarrage (checkCredit(),
// ci-dessus) et on retire cette re-vérification permanente.
// watchCredit();
startHealthCheckServer();
startBot();
