// ===================== FONCTIONNALITÉS AUTOMATIQUES =====================
// Anti-suppression, bienvenue/au revoir, anti-lien, statuts vus auto.
// ==========================================================================

const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  isAntilinkEnabled,
  getSetting,
  isWelcomeEnabled,
  getWelcomeMessage,
  getByeMessage,
  isAntifakeEnabled,
} = require("./state");
const { handleStatusUpdate } = require("./autostatus");

const messageStore = new Map();
const MAX_STORED_MESSAGES = 1000;
const LINK_REGEX = /(https?:\/\/|chat\.whatsapp\.com\/|wa\.me\/)/i;

// --- Cache des contacts (nom enregistré dans le téléphone du propriétaire) ---
// Rempli via les événements "contacts.upsert"/"contacts.update" que Baileys
// envoie après connexion (sync des contacts du téléphone). Sert à afficher
// un vrai nom plutôt qu'un numéro ou un identifiant @lid dans les messages
// d'anti-suppression / anti-vue-unique.
const contactsCache = new Map();

// Garde une seule référence globale vers le minuteur "toujours en ligne" :
// sans ça, CHAQUE reconnexion WhatsApp (connexion fermée puis rouverte, ce
// qui arrive régulièrement, surtout sur des réseaux/panels instables) recrée
// un nouveau setInterval sans jamais supprimer le précédent. Au bout de
// quelques reconnexions accumulées sur une heure ou deux, des dizaines de
// minuteurs tournent en boucle en même temps (chacun gardant en mémoire une
// ancienne connexion déjà fermée), ce qui fait grimper la consommation
// mémoire jusqu'à ce que l'hébergeur tue le process et le redémarre de force
// — exactement ce qui ressemble à "le bot redémarre tout seul toutes les
// heures". En gardant une seule référence ici et en supprimant l'ancien
// minuteur avant d'en recréer un, une seule boucle existe à la fois, quel
// que soit le nombre de reconnexions.
let alwaysOnlineInterval = null;

function rememberContact(c) {
  if (!c?.id) return;
  const existing = contactsCache.get(c.id) || {};
  contactsCache.set(c.id, { ...existing, ...c });
}

// Enlève le suffixe d'appareil ("...:12@s.whatsapp.net" -> "...@s.whatsapp.net").
function normalizeJid(jid) {
  if (!jid) return null;
  const [user, server] = jid.split("@");
  return `${user.split(":")[0]}@${server}`;
}

// Retrouve la meilleure identité possible pour l'auteur d'un message :
// 1) le nom enregistré dans les contacts du propriétaire, si le numéro y figure ;
// 2) sinon son numéro de téléphone (+2437...) ;
// 3) en dernier recours seulement, l'identifiant @lid brut (numéro réel
//    introuvable — WhatsApp ne l'a pas communiqué).
// `key` est la clé du message (key.participant pour un groupe, key.remoteJid
// pour un DM) ; key.participantAlt / key.remoteJidAlt sont fournis par
// Baileys quand le champ principal est un @lid, avec le vrai numéro derrière.
function resolveSenderLabel(key) {
  let jid = key.participant || key.remoteJid;
  if (jid && jid.endsWith("@lid")) {
    jid = key.participantAlt || key.remoteJidAlt || jid;
  }
  jid = normalizeJid(jid);
  if (!jid) return "Inconnu";

  const contact = contactsCache.get(jid);
  const savedName = contact?.name || contact?.verifiedName;
  if (savedName) return savedName;

  const number = jid.split("@")[0];
  if (jid.endsWith("@s.whatsapp.net")) return `+${number}`;
  // Dernier recours : WhatsApp n'a communiqué qu'un identifiant interne
  // (@lid), pas le vrai numéro de téléphone. Les chiffres de cet identifiant
  // NE SONT PAS un numéro de téléphone valide — les afficher avec un "+"
  // laissait croire que c'en était un, alors que ça ne correspond à personne.
  // On l'indique clairement au lieu d'afficher un faux numéro trompeur.
  return `Numéro caché (id interne WhatsApp: ${number})`;
}

// --- Cache des médias "vue unique" ---
// Dès qu'un média vue-unique arrive, on le télécharge et on le garde en
// mémoire (accès rapide) ET sur disque dans viewonce_cache/ (survit à un
// redémarrage du bot). Beaucoup de panels d'hébergement redémarrent le
// process régulièrement (ex: toutes les heures) : sans la sauvegarde sur
// disque, tout le cache mémoire disparaissait à chaque redémarrage et .ok
// échouait dès qu'il se passait plus de quelques minutes entre l'ouverture
// du média et la commande .ok — même si WhatsApp avait bien supprimé le
// média de ses serveurs entre-temps, ce qui rendait le repli "téléchargement
// direct" impossible lui aussi.
const viewOnceStore = new Map();
const MAX_STORED_VIEWONCE = 200;

const { DATA_DIR } = require("./lib/paths");
const VIEWONCE_DIR = path.join(DATA_DIR, "viewonce_cache");
// Durée de conservation sur disque avant nettoyage automatique. Repoussée à
// 60 jours (au lieu de 30) pour couvrir largement le cas "je veux récupérer
// le média même une semaine, voire plusieurs semaines, après réception" —
// voir aussi .vu ci-dessous qui permet de le récupérer sans avoir à retrouver
// et citer le message d'origine dans le chat.
const VIEWONCE_DISK_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 jours

try {
  if (!fs.existsSync(VIEWONCE_DIR)) fs.mkdirSync(VIEWONCE_DIR, { recursive: true });
} catch (e) {
  console.log("Erreur création dossier viewonce_cache :", e.message);
}

function viewOncePaths(id) {
  // Un id de message WhatsApp peut contenir des caractères pas forcément
  // sûrs dans un nom de fichier sur tous les OS ; on les neutralise.
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    meta: path.join(VIEWONCE_DIR, `${safeId}.json`),
    bin: path.join(VIEWONCE_DIR, `${safeId}.bin`),
  };
}

function rememberViewOnce(id, data) {
  if (!id) return;
  viewOnceStore.set(id, data);
  if (viewOnceStore.size > MAX_STORED_VIEWONCE) {
    viewOnceStore.delete(viewOnceStore.keys().next().value);
  }

  // Sauvegarde sur disque en plus du cache mémoire (voir commentaire plus haut).
  try {
    const { meta, bin } = viewOncePaths(id);
    fs.writeFileSync(bin, data.buffer);
    fs.writeFileSync(
      meta,
      JSON.stringify({
        type: data.type,
        caption: data.caption || "",
        senderJid: data.senderJid || "",
        mimetype: data.mimetype || "",
        ptt: data.ptt !== false,
        savedAt: Date.now(),
      }),
      "utf8"
    );
  } catch (e) {
    console.log("Erreur écriture cache vue-unique sur disque :", e.message);
  }
}

function getViewOnce(id) {
  if (!id) return null;

  // 1) Chemin rapide : déjà en mémoire (process pas redémarré depuis).
  const inMemory = viewOnceStore.get(id);
  if (inMemory) return inMemory;

  // 2) Repli disque : utile juste après un redémarrage du bot, quand le
  // cache mémoire est vide mais que le fichier existe toujours.
  try {
    const { meta, bin } = viewOncePaths(id);
    if (fs.existsSync(meta) && fs.existsSync(bin)) {
      const parsed = JSON.parse(fs.readFileSync(meta, "utf8"));
      const buffer = fs.readFileSync(bin);
      const data = { ...parsed, buffer };
      viewOnceStore.set(id, data); // remise en mémoire pour les prochains accès
      return data;
    }
  } catch (e) {
    console.log("Erreur lecture cache vue-unique sur disque :", e.message);
  }

  return null;
}

// Liste les médias vue-unique encore en cache sur disque, du plus récent au
// plus ancien — utilisé par .vu (sans argument) pour permettre de retrouver
// et récupérer un média SANS avoir à retrouver et citer le message d'origine
// dans le chat (qui peut être difficile à retrouver, voire avoir disparu si
// les messages éphémères sont activés dans la discussion, après plusieurs
// jours).
function listStoredViewOnce(limit = 15) {
  try {
    const files = fs.readdirSync(VIEWONCE_DIR).filter((f) => f.endsWith(".json"));
    const items = [];
    for (const file of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(VIEWONCE_DIR, file), "utf8"));
        items.push({ id: file.replace(/\.json$/, ""), ...parsed });
      } catch {
        // Fichier corrompu/illisible : on l'ignore simplement.
      }
    }
    items.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return items.slice(0, limit);
  } catch (e) {
    console.log("Erreur listage cache vue-unique :", e.message);
    return [];
  }
}

// Nettoyage périodique des fichiers trop anciens sur disque, pour ne pas
// accumuler indéfiniment des médias jamais réclamés. Appelé une fois au
// démarrage, puis une fois par jour.
function cleanupOldViewOnceFiles() {
  try {
    const files = fs.readdirSync(VIEWONCE_DIR).filter((f) => f.endsWith(".json"));
    const now = Date.now();
    for (const file of files) {
      const metaPath = path.join(VIEWONCE_DIR, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (now - (parsed.savedAt || 0) > VIEWONCE_DISK_TTL_MS) {
          const binPath = metaPath.replace(/\.json$/, ".bin");
          fs.unlinkSync(metaPath);
          if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        }
      } catch {
        // Fichier corrompu/illisible : on l'ignore simplement.
      }
    }
  } catch (e) {
    console.log("Erreur nettoyage cache vue-unique :", e.message);
  }
}

cleanupOldViewOnceFiles();
setInterval(cleanupOldViewOnceFiles, 24 * 60 * 60 * 1000);

// Petit cache des métadonnées de groupe (30s) pour éviter de spammer
// l'API à chaque message quand l'anti-lien est actif.
const groupMetaCache = new Map();
async function getCachedGroupMeta(sock, jid) {
  const cached = groupMetaCache.get(jid);
  if (cached && Date.now() - cached.time < 30000) return cached.data;
  const data = await sock.groupMetadata(jid);
  groupMetaCache.set(jid, { data, time: Date.now() });
  return data;
}

function getChatMessages(jid) {
  const list = [];
  for (const m of messageStore.values()) {
    if (m.key.remoteJid === jid) list.push(m);
  }
  return list;
}

function rememberMessage(msg) {
  if (!msg.message) return;
  messageStore.set(msg.key.id, msg);
  // Sans cette limite, messageStore grossit indéfiniment avec le temps
  // (jamais vidé), ce qui finit par ralentir le bot sur les longues durées.
  if (messageStore.size > MAX_STORED_MESSAGES) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

// Renvoie le JID du compte actuellement connecté (celui de la personne qui a
// déployé le bot), plutôt que de se fier uniquement à OWNER_NUMBER dans
// config.js — utile si ce numéro n'a pas été mis à jour ou diffère du compte
// réellement lié. On retombe sur config.OWNER_NUMBER seulement si sock.user
// n'est pas encore disponible (ex: tout début de connexion).
function getOwnerJid(sock) {
  if (sock?.user?.id) {
    return sock.user.id.split(":")[0].split("@")[0] + "@s.whatsapp.net";
  }
  return config.OWNER_NUMBER + "@s.whatsapp.net";
}

// Repère un message "vue unique" (photo/vidéo qui disparaît après lecture),
// quel que soit le format utilisé par WhatsApp pour l'envelopper.
function extractViewOnce(message) {
  if (!message) return null;
  const wrapper =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    null;
  const inner = wrapper || message;

  if (inner.imageMessage?.viewOnce || wrapper?.imageMessage) {
    return { type: "image", message: inner, caption: inner.imageMessage.caption || "" };
  }
  if (inner.videoMessage?.viewOnce || wrapper?.videoMessage) {
    return { type: "video", message: inner, caption: inner.videoMessage.caption || "" };
  }
  // WhatsApp propose aussi des messages vocaux "vue unique" (écoutables une
  // seule fois) — c'est le "ou autre" demandé : on les traite pareil.
  if (inner.audioMessage?.viewOnce || wrapper?.audioMessage) {
    return {
      type: "audio",
      message: inner,
      caption: "",
      mimetype: inner.audioMessage.mimetype || "audio/ogg; codecs=opus",
      ptt: inner.audioMessage.ptt !== false,
    };
  }
  return null;
}

// Construit l'objet à passer à sock.sendMessage() pour renvoyer un média
// vue-unique mis en cache — l'audio a besoin de mimetype/ptt au lieu d'une
// simple caption, contrairement à l'image et la vidéo.
function buildViewOnceSendPayload(cached) {
  if (cached.type === "audio") {
    return {
      audio: cached.buffer,
      mimetype: cached.mimetype || "audio/ogg; codecs=opus",
      ptt: cached.ptt !== false,
    };
  }
  return { [cached.type]: cached.buffer, caption: cached.caption || "👁️ Média vue unique révélé." };
}

function setupFeatures(sock) {
  // --- Cache des contacts (voir resolveSenderLabel plus haut) ---
  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts) rememberContact(c);
  });
  sock.ev.on("contacts.update", (updates) => {
    for (const c of updates) rememberContact(c);
  });

  // --- Toujours en ligne (réglable en direct via .alwaysonline) ---
  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open" && getSetting("ALWAYS_ONLINE")) {
      sock.sendPresenceUpdate("available").catch(() => {});
    }
  });
  // WhatsApp remet parfois le statut à "indisponible" après un moment
  // d'inactivité : on le renvoie régulièrement si le réglage est actif.
  // On supprime d'abord tout minuteur précédent (voir commentaire sur
  // `alwaysOnlineInterval` plus haut) pour qu'il n'y en ait jamais qu'un
  // seul actif, même après de nombreuses reconnexions.
  if (alwaysOnlineInterval) clearInterval(alwaysOnlineInterval);
  alwaysOnlineInterval = setInterval(() => {
    if (getSetting("ALWAYS_ONLINE")) {
      sock.sendPresenceUpdate("available").catch(() => {});
    }
  }, 30000);

  // Petit cache pour ne tenter l'amorçage de session qu'une fois par contact
  // (évite de spammer presenceSubscribe si la même personne poste plusieurs
  // statuts d'affilée avant que la session ne soit établie).
  const primedContacts = new Set();

  // --- Voir / réagir automatiquement aux statuts + anti-lien ---
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // NB : on avait un filtre ici qui ne gardait QUE le statut le plus
    // récent par contact dans ce paquet, et ignorait complètement (sans
    // aucun accusé "vu") tous les autres statuts du même contact livrés dans
    // le même événement "notify". L'intention était de bloquer un cas rare
    // où WhatsApp redélivre un VIEUX statut avec un timestamp "réinjecté"
    // proche de maintenant lors de l'établissement tardif d'une session
    // chiffrée. Mais en pratique, ce filtre cassait un cas bien plus courant
    // et légitime : un contact a déjà plusieurs statuts non vus, en publie
    // un nouveau, et WhatsApp livre plusieurs entrées de ce même contact
    // dans le même paquet. Les statuts non retenus (les plus anciens du
    // paquet) n'étaient JAMAIS marqués "vu" → leur conversation ne basculait
    // jamais complètement dans "Mises à jour vues", même une fois le
    // dernier statut vu — exactement comme sur le vrai WhatsApp, où ouvrir
    // le dernier statut d'une série marque toute la série comme vue.
    //
    // On laisse donc maintenant CHAQUE statut du paquet passer individuellement
    // par isStatusFresh() (dans autostatus.js) : chacun est jugé par rapport
    // à `config.enabledAt` (l'instant du dernier .autostatus on) — pas par
    // rapport à "maintenant". Ça permet de voir tout un lot de rattrapage
    // (plusieurs statuts d'un même contact, "hier" comme "aujourd'hui")
    // livré d'un coup après une reconnexion, tant qu'il est postérieur à
    // l'activation, sans jamais remonter des statuts postés avant.
    for (const msg of messages) {
      if (msg.key.remoteJid === "status@broadcast") {
        // "notify" = nouvel événement en direct. Tout autre type ("append",
        // etc.) correspond à un historique/resync livré par WhatsApp (par
        // ex. juste après une connexion). On les VOIT désormais eux aussi
        // directement si leur horodatage est postérieur à l'activation
        // (voir handleStatusUpdate/isStatusFresh) — on ne les mémorise
        // "en attente" que s'ils sont filtrés (contact exclu, self sans
        // selfOn) ou postés AVANT l'activation, afin qu'ils soient
        // regroupés dans l'accusé "vu" du PROCHAIN statut réellement vu de
        // ce même contact. Avant ce fix, ces statuts n'étaient JAMAIS
        // accusés, ce qui laissait le cercle vert affiché indéfiniment côté
        // WhatsApp même après avoir vu le nouveau statut. Ce comportement ne
        // s'applique qu'à cette branche
        // "statut" ; il ne touche pas les autres fonctionnalités (autoread,
        // anti-lien, vue-unique...) plus bas dans cette boucle.
        // Si le contenu du statut n'a pas pu être déchiffré (session manquante
        // avec ce contact, très fréquent avec les statuts WhatsApp — ça arrive
        // surtout avec des contacts à qui tu n'as jamais parlé), msg.message
        // est vide. On en profite pour amorcer une session de chiffrement avec
        // ce contact (via presenceSubscribe, qui force Baileys à récupérer ses
        // clés), ce qui permettra à ses PROCHAINS statuts d'être déchiffrés et
        // donc likés automatiquement (réagir = envoyer un vrai message chiffré,
        // ça a besoin d'une session).
        //
        // MAIS marquer un statut comme "vu" n'a besoin ni du contenu déchiffré
        // ni d'une session chiffrée : c'est un simple accusé de réception XML
        // basé sur la clé du message (remoteJid/id/participant). C'était
        // l'erreur précédente : on sautait complètement le "vu" ici, ce qui
        // empêchait TOUJOURS les statuts des contacts jamais contactés de
        // passer dans "Mises à jour vues", même une fois la session établie.
        // On continue donc vers handleStatusUpdate dans tous les cas.
        if (!msg.message) {
          const participant = msg.key.participant;
          if (participant && !primedContacts.has(participant)) {
            primedContacts.add(participant);
            if (primedContacts.size > 500) {
              primedContacts.delete(primedContacts.values().next().value);
            }
            sock.presenceSubscribe(participant).catch(() => {});
          }
        }

        // Voir / liker (💚) automatiquement les statuts, avec gestion du
        // self-view et des filtres include/exclude par numéro — tout est
        // géré par le module autostatus.js, réglable en direct avec la
        // commande .autostatus (voir commands/index.js).
        await handleStatusUpdate(sock, { messages: [msg] }, type);
        continue;
      }

      // --- Lecture automatique des messages (.autoread) ---
      if (getSetting("AUTO_READ") && !msg.key.fromMe && msg.message) {
        try {
          await sock.readMessages([msg.key]);
        } catch (e) {
          console.log("Erreur lecture auto:", e.message);
        }
      }

      // --- Vue-unique : mise en cache immédiate + anti-vue-unique auto ---
      if (!msg.key.fromMe) {
        const vv = extractViewOnce(msg.message);
        if (vv) {
          try {
            const { downloadMediaMessage } = require("@whiskeysockets/baileys");
            const buffer = await downloadMediaMessage(
              { message: vv.message },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );
            const senderJid = msg.key.participant || msg.key.remoteJid;

            // Toujours en cache, quel que soit le réglage ANTI_VV, pour que
            // .ok / .vu puisse révéler ce média à N'IMPORTE QUEL moment plus tard.
            rememberViewOnce(msg.key.id, {
              type: vv.type,
              buffer,
              caption: vv.caption,
              senderJid,
              mimetype: vv.mimetype,
              ptt: vv.ptt,
            });

            // En plus, si l'anti-vue-unique auto est activé, on l'envoie
            // aussi immédiatement au propriétaire.
            if (getSetting("ANTI_VV")) {
              const ownerJid = getOwnerJid(sock);
              const senderLabel = resolveSenderLabel(msg.key);
              const caption =
                `👁️ *Media vue unique récupéré*\nDe : ${senderLabel}\n${vv.caption ? "Légende : " + vv.caption : ""}`.trim();
              await sock.sendMessage(ownerJid, {
                ...buildViewOnceSendPayload({ type: vv.type, buffer, mimetype: vv.mimetype, ptt: vv.ptt }),
                ...(vv.type === "audio" ? {} : { caption }),
              });
            }
          } catch (e) {
            console.log("Erreur capture vue-unique:", e.message);
          }
        }
      }

      rememberMessage(msg);

      // --- Anti-lien (par groupe) ---
      const jid = msg.key.remoteJid;
      if (jid.endsWith("@g.us") && !msg.key.fromMe && isAntilinkEnabled(jid)) {
        const body =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          "";

        if (LINK_REGEX.test(body)) {
          try {
            const metadata = await getCachedGroupMeta(sock, jid);
            const senderJid = msg.key.participant || jid;
            const senderIsAdmin = metadata.participants.some(
              (p) => p.id === senderJid && (p.admin === "admin" || p.admin === "superadmin")
            );
            if (!senderIsAdmin) {
              await sock.sendMessage(jid, { delete: msg.key });
              await sock.sendMessage(jid, {
                text: `🚫 Lien supprimé (@${senderJid.split("@")[0]}) : les liens ne sont pas autorisés ici.`,
                mentions: [senderJid],
              });
            }
          } catch (e) {
            console.log("Erreur anti-lien:", e.message);
          }
        }
      }
    }
  });

  // --- Anti-appel (réglable en direct) ---
  sock.ev.on("call", async (calls) => {
    if (!getSetting("ANTI_CALL")) return;
    for (const call of calls) {
      if (call.status === "offer") {
        try {
          await sock.rejectCall(call.id, call.from);
        } catch (e) {
          console.log("Erreur anti-appel:", e.message);
        }
      }
    }
  });

  // --- Bienvenue / au revoir + anti-fake (réglables par groupe) ---
  // .welcome on|off active à la fois le message de bienvenue ET celui
  // d'au revoir pour le groupe ; .setwelcome / .setbye permettent de
  // personnaliser chaque texte séparément (voir commands/index.js).
  sock.ev.on("group-participants.update", async (update) => {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !Array.isArray(participants)) return;

    let groupName = groupJid;
    try {
      const meta = await getCachedGroupMeta(sock, groupJid);
      groupName = meta.subject || groupJid;
    } catch {}

    for (const participantJid of participants) {
      const label = resolveSenderLabel({ participant: participantJid, remoteJid: groupJid });

      if (action === "add") {
        // Anti-fake : exclut d'abord les numéros dont l'indicatif n'est pas
        // autorisé, avant même d'envisager un message de bienvenue.
        if (isAntifakeEnabled(groupJid)) {
          const number = participantJid.split("@")[0];
          const allowed = (config.ANTIFAKE_ALLOWED_CODES || []).some((code) =>
            number.startsWith(code)
          );
          if (!allowed) {
            try {
              await sock.groupParticipantsUpdate(groupJid, [participantJid], "remove");
              await sock.sendMessage(groupJid, {
                text: `🚫 ${label} a été exclu automatiquement (anti-fake : indicatif non autorisé).`,
              });
            } catch (e) {
              console.log("Erreur anti-fake:", e.message);
            }
            continue; // pas de message de bienvenue pour un numéro exclu
          }
        }

        if (isWelcomeEnabled(groupJid)) {
          const text = getWelcomeMessage(groupJid)
            .replace(/\{user\}/g, `@${participantJid.split("@")[0]}`)
            .replace(/\{group\}/g, groupName);
          try {
            await sock.sendMessage(groupJid, { text, mentions: [participantJid] });
          } catch (e) {
            console.log("Erreur message de bienvenue:", e.message);
          }
        }
      } else if (action === "remove") {
        if (isWelcomeEnabled(groupJid)) {
          const text = getByeMessage(groupJid)
            .replace(/\{user\}/g, `@${participantJid.split("@")[0]}`)
            .replace(/\{group\}/g, groupName);
          try {
            await sock.sendMessage(groupJid, { text, mentions: [participantJid] });
          } catch (e) {
            console.log("Erreur message d'au revoir:", e.message);
          }
        }
      }
    }
  });

  // --- Anti-suppression (réglable en direct) ---
  sock.ev.on("messages.update", async (updates) => {
    if (!getSetting("ANTI_DELETE")) return;
    for (const update of updates) {
      const isDeleted =
        update.update?.message === null || update.update?.messageStubType === 1;

      if (isDeleted) {
        const original = messageStore.get(update.key.id);
        if (!original) continue;

        // Ne jamais signaler la suppression de TES propres messages (ceux
        // envoyés depuis le numéro qui héberge le bot) — seuls les messages
        // supprimés par les AUTRES doivent déclencher l'anti-suppression.
        if (original.key.fromMe) continue;

        const ownerJid = getOwnerJid(sock);
        const senderLabel = resolveSenderLabel(original.key);
        const text =
          original.message?.conversation ||
          original.message?.extendedTextMessage?.text ||
          "[média ou message non textuel]";

        try {
          await sock.sendMessage(ownerJid, {
            text: `🗑️ *Message supprimé*\nDe: ${senderLabel}\nContenu: ${text}`,
          });
        } catch (e) {
          console.log("Erreur anti-suppression:", e.message);
        }
      }
    }
  });
}

module.exports = { setupFeatures, extractViewOnce, getViewOnce, getChatMessages, listStoredViewOnce, buildViewOnceSendPayload };
