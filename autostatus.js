//════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════//
//                                                                                                                                                                                        //
//                                                                   𝐀𝐑𝐈𝐄𝐋-𝐁𝐎𝐓-𝐌𝐃                                                                                                          //
//                                                                                                                                                                                        //
//                                                                  𝐕 : 1.0.0                                                                                                             //
//                                                                                                                                                                                        //
//                                                                                                                                                                                        //
//                 █████╗ ██████╗ ██╗███████╗██╗      ██████╗  ██████╗ ████████╗   ███╗   ███╗██████╗                                                                       //
//                ██╔══██╗██╔══██╗██║██╔════╝██║      ██╔══██╗██╔═══██╗╚══██╔══╝   ████╗ ████║██╔══██╗                                                                      //
//                ███████║██████╔╝██║█████╗  ██║█████╗██████╔╝██║   ██║   ██║█████╗██╔████╔██║██║  ██║                                                                      //
//                ██╔══██║██╔══██╗██║██╔══╝  ██║╚════╝██╔══██╗██║   ██║   ██║╚════╝██║╚██╔╝██║██║  ██║                                                                      //
//                ██║  ██║██║  ██║██║███████╗███████╗ ██████╔╝╚██████╔╝   ██║      ██║ ╚═╝ ██║██████╔╝                                                                      //
//                ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝    ╚═╝      ╚═╝     ╚═╝╚═════╝                                                                       //
//                                                                                                                                                                                        //
//                                                                 𝐂𝐎𝐏𝐘𝐑𝐈𝐆𝐇𝐓 2025                                                                                                        //
//                                                                                                                                                                                        //
//                                                                                                                                                                                        //
//════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════//
//* 
//  * project_name : ARIEL-MD
//  * author : wallyjaytech
//  * youtube : https://www.youtube.com/wallyjaytechy
//  * description : WALLYJAYTECH-MD ,A Multi-Device whatsapp user bot.
//*
//*
//re-upload? recode? copy code? give credit to wallyjaytech 2025:)
//Instagram: wallyjaytech
//Telegram: t.me/wallyjaytech
//GitHub: wallyjaytechh
//WhatsApp: +2348144317152
//want more free bot scripts? subscribe to my youtube channel: https://youtube.com/@wallyjaytechy
//   * Created By Github: wallyjaytechh.
//   * Credit To ally jay tech
//   * © 2025 WALLYJAYTECH-MD.
// ⛥┌┤
// */
/**
 * WALLYJAYTECH-MD - A WhatsApp Bot
 * Auto Status Viewer with Likes (💚 Green Heart)
 * Professional Version with Include/Exclude & Self-View
 * FULLY FIXED: Self-View now works by comparing bot's own JID/LID
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./lib/paths');
const { OWNER_NUMBER } = require('./config');

const configPath = path.join(DATA_DIR, 'data', 'autostatus.json');

const defaultConfig = {
    enabled: false,
    likeOn: false,
    selfOn: false,
    includeMode: false,
    numberList: [],
    likeEmojis: ['💚']
};

// Choisit un emoji au hasard dans la liste configurée (ou 💚 par défaut si
// la liste est vide, pour ne jamais planter avec un like sans emoji).
function pickLikeEmoji(config) {
    const list = Array.isArray(config.likeEmojis) && config.likeEmojis.length > 0
        ? config.likeEmojis
        : ['💚'];
    return list[Math.floor(Math.random() * list.length)];
}

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════

function initConfig() {
    try {
        const dataDir = path.join(DATA_DIR, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        const configHash = JSON.stringify(defaultConfig);
        
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({ ...defaultConfig, _hash: configHash }, null, 2));
        }
        
        const config = JSON.parse(fs.readFileSync(configPath));
        let needsUpdate = false;
        
        for (const [key, value] of Object.entries(defaultConfig)) {
            if (config[key] === undefined) { config[key] = value; needsUpdate = true; }
        }
        if (config._hash !== configHash) needsUpdate = true;
        
        if (needsUpdate) {
            config._hash = configHash;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('📝 Autostatus config migrated');
        }
        
        return config;
    } catch (error) { 
        console.error('❌ Error reading config:', error);
        return { ...defaultConfig }; 
    }
}

function readConfig() {
    return initConfig();
}

function writeConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (e) {
        console.error('❌ Failed to write config:', e.message);
        return false;
    }
}

// ═══════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════

function extractPhoneNumber(jid) {
    if (!jid) return null;
    if (jid.endsWith('@lid')) return null;
    let phone = jid.split('@')[0];
    if (phone.includes(':')) phone = phone.split(':')[0];
    phone = phone.replace(/[^0-9]/g, '');
    return phone.length > 0 ? phone : null;
}

// ⚠️ FIX EXCLUDE/INCLUDE @lid : avant, on ne regardait que
// message.key.remoteJidAlt/participantAlt (des champs STATIQUES, souvent
// absents au moment exact où le statut arrive). Si le contact est masqué en
// @lid et que ce champ n'est pas encore rempli, `phone` restait `null` →
// la fonction renvoyait `null` ("pas dans la liste") → le contact passait
// à travers le filtre exclude comme s'il n'y était pas, même s'il figurait
// bien dans la liste avec son vrai numéro. On réutilise donc
// resolveRealParticipant() (async), qui retente aussi via le lidMapping
// interne de Baileys (avec un court délai) — la même résolution déjà fiable
// utilisée pour les likes — au lieu de se limiter aux champs Alt statiques.
async function isNumberInList(message, sock) {
    const config = readConfig();
    if (!config.numberList || config.numberList.length === 0) return null;

    const isStatus = message.key.remoteJid === 'status@broadcast';
    let phone = null;

    if (isStatus) {
        const participant = message.key.participant;
        if (!participant) return null;

        if (participant.endsWith('@lid')) {
            const resolved = sock
                ? await resolveRealParticipant(message.key, sock)
                : (message.key.remoteJidAlt?.includes('@s.whatsapp.net') ? message.key.remoteJidAlt : null);
            if (resolved?.includes('@s.whatsapp.net')) {
                phone = extractPhoneNumber(resolved);
            }
        } else {
            phone = extractPhoneNumber(participant);
        }
    } else {
        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        let senderJid = isGroup ? (message.key.participant || message.participant) : chatId;
        if (!senderJid) return null;

        if (senderJid.endsWith('@lid')) {
            const fakeKey = {
                participant: senderJid,
                remoteJid: chatId,
                participantPn: message.key.participantPn,
                senderPn: message.key.senderPn,
                participantAlt: message.key.participantAlt,
                remoteJidAlt: message.key.remoteJidAlt,
            };
            const resolved = sock ? await resolveRealParticipant(fakeKey, sock) : null;
            if (resolved?.includes('@s.whatsapp.net')) {
                phone = extractPhoneNumber(resolved);
            } else if (message.key.remoteJidAlt?.includes('@s.whatsapp.net')) {
                phone = extractPhoneNumber(message.key.remoteJidAlt);
            } else if (message.key.participantAlt?.includes('@s.whatsapp.net')) {
                phone = extractPhoneNumber(message.key.participantAlt);
            }
        } else {
            phone = extractPhoneNumber(senderJid);
        }
    }

    if (!phone || phone.length < 7) return null;

    const found = config.numberList.some(num => {
        const normalizedNum = num.replace(/[^0-9]/g, '');
        return phone === normalizedNum || phone.endsWith(normalizedNum) || normalizedNum.endsWith(phone);
    });

    return config.includeMode ? found : !found;
}

// Convertit messageTimestamp (nombre, chaîne, ou objet "Long" selon les
// versions de Baileys) en millisecondes, comme dans index.js.
function getMessageTimestampMs(message) {
    const raw = message?.messageTimestamp;
    if (!raw) return null;
    const seconds =
        typeof raw === 'object' && typeof raw.toNumber === 'function'
            ? raw.toNumber()
            : Number(raw);
    return seconds ? seconds * 1000 : null;
}

// ANCIEN COMPORTEMENT (retiré) : le bot exigeait qu'un statut arrive dans
// les 90 dernières secondes par rapport à "maintenant", en plus d'être
// postérieur à la connexion en cours. Résultat : un statut publié APRÈS
// l'activation d'AutoStatus, mais livré en retard (reco, lot de rattrapage,
// plusieurs statuts d'un même contact d'affilée...), était rejeté et ne
// passait donc JAMAIS dans "Mises à jour vues" — même si le comportement
// attendu est simple : dès qu'AutoStatus est ON, TOUT statut posté à partir
// de ce moment-là doit finir vu, peu importe quand il arrive réellement
// jusqu'au bot (dans la seconde ou dans le lot de rattrapage après une
// coupure). Un statut posté AVANT l'activation ne doit jamais être vu.
//
// Nouvelle règle, la seule qui compte désormais : on compare l'horodatage du
// statut à `config.enabledAt` (mémorisé au moment du .autostatus on). Pas de
// fenêtre glissante sur "maintenant".
const CONNECTION_GRACE_MS = 10 * 1000; // petite marge pour les décalages d'horloge

// ═══════════════════════════════════════
// ANTI-DOUBLON
// ═══════════════════════════════════════
// Baileys peut redélivrer le même événement de statut (reconnexion, retry
// réseau, event "notify" + resync qui se chevauchent...). On garde donc en
// mémoire les IDs de statuts déjà traités pour ne jamais les revoir/liker
// une deuxième fois. Bornée en taille pour ne pas grossir indéfiniment.
const processedStatusIds = new Set();
const MAX_PROCESSED_CACHE = 2000;

function isDuplicateStatus(id) {
    if (!id) return false;
    if (processedStatusIds.has(id)) return true;
    processedStatusIds.add(id);
    if (processedStatusIds.size > MAX_PROCESSED_CACHE) {
        // Retire l'entrée la plus ancienne (ordre d'insertion des Set JS)
        processedStatusIds.delete(processedStatusIds.values().next().value);
    }
    return false;
}

// ═══════════════════════════════════════
// ACCUSÉS "VU" EN ATTENTE PAR CONTACT — ABANDONNÉ
// ═══════════════════════════════════════
// Historique : plusieurs tentatives de "rattraper" un vieux statut jamais
// accusé en le regroupant avec le statut fraîchement reçu du même contact
// (accusé unique fusionné, puis accusés individuels envoyés dans l'ordre)
// ont toutes échoué en conditions réelles — pire, la dernière tentative
// bloquait aussi l'accusé du statut ACTUEL. Conclusion retenue : WhatsApp
// exige probablement d'avoir réellement récupéré le contenu d'un statut
// pendant qu'il était encore actif pour honorer un accusé "vu" ; un vieux
// statut délibérément ignoré à l'époque ne peut plus être rattrapé après
// coup, quoi qu'on envoie. Le mécanisme correspondant a donc été retiré :
// seul le statut qui vient réellement d'être reçu est désormais accusé.

// Résout un participant potentiellement masqué en @lid vers son vrai numéro
// (@s.whatsapp.net), via les champs annexes exposés par Baileys sur la clé
// du message. Renvoie null si aucune résolution n'est possible : dans ce
// cas WhatsApp ne peut pas rattacher l'accusé de lecture à une session
// chiffrée valide, et le statut reste alors bloqué dans "Récentes" côté
// téléphone même si le bot logge "Viewed" (readMessages() a bien tourné
// localement, mais le "vu" ne remonte jamais réellement à WhatsApp).
async function resolveRealParticipant(msgKey, sock) {
    const participant = msgKey.participant || msgKey.remoteJid;
    if (!participant) return null;
    if (!participant.endsWith('@lid')) return participant;

    const realNumber =
        msgKey.participantPn ||
        msgKey.senderPn ||
        msgKey.participantAlt ||
        msgKey.remoteJidAlt;

    if (realNumber?.includes('@s.whatsapp.net')) return realNumber;

    // Dernier recours : le store interne de Baileys (signalRepository.lidMapping)
    // connaît souvent la correspondance LID -> vrai numéro même quand elle
    // n'est pas présente sur la clé du message elle-même (elle est apprise en
    // arrière-plan dès que ce contact a échangé un message "normal" avec le
    // compte, indépendamment du statut en cours). On l'interroge explicitement
    // au lieu de se limiter aux champs déjà fournis sur msgKey.
    const lidStore = sock?.signalRepository?.lidMapping;
    if (!lidStore?.getPNForLID) return null;

    // Baileys apprend parfois la correspondance LID -> PN quelques instants
    // seulement après avoir reçu l'événement du statut (elle arrive souvent
    // via le traitement interne d'un autre message qui se chevauche). Un
    // seul essai immédiat rate donc régulièrement une correspondance qui
    // existe déjà une seconde plus tard. On retente donc une fois après une
    // courte pause avant d'abandonner.
    for (const delayMs of [0, 1500]) {
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        try {
            const pn = await lidStore.getPNForLID(participant);
            if (pn) {
                // getPNForLID peut renvoyer soit un JID complet, soit juste le numéro
                return pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
            }
        } catch (e) {
            console.error('⚠️ lidMapping lookup error:', e.message);
        }
    }

    return null;
}

// ═══════════════════════════════════════
// ACCUSÉS "VU" EN ATTENTE PAR CONTACT — reprise (v2)
// ═══════════════════════════════════════
// Historique : deux tentatives précédentes de "rattraper" un vieux statut
// jamais accusé ont échoué en conditions réelles. En reprenant le code, une
// vraie erreur est apparue dans LES DEUX : l'accusé de l'ANCIEN statut était
// envoyé avec le "participant" du NOUVEAU statut, pas le sien. Si WhatsApp
// vérifie que le champ participant correspond exactement à l'expéditeur
// déclaré du message concerné (ce qui est probable), un accusé avec le
// mauvais participant est simplement ignoré côté serveur, sans erreur — ce
// qui expliquerait un échec systématique indépendamment de la stratégie
// (fusionné ou individuel). On reprend donc l'idée, mais en conservant la
// clé D'ORIGINE (remoteJid + id + participant tels quels) de chaque ancien
// statut ignoré, pour accuser chacun avec SES PROPRES informations.
//
// La clé de recherche (pour retrouver "les statuts en attente de CE
// contact"), elle, reste normalisée sur le numéro réel résolu quand
// possible : un même contact peut apparaître sous différentes formes de
// participant (@lid vs numéro réel) d'un statut à l'autre, et la recherche
// doit les faire correspondre même si le participant BRUT stocké diffère.
//
// Persisté sur disque (comme settings.json / processed-ids.json ailleurs
// dans le bot) pour survivre à un redémarrage du bot entre deux statuts du
// même contact.
const pendingKeysByContact = new Map(); // clé normalisée -> [ {remoteJid,id,participant,fromMe}, ... ]
const MAX_TRACKED_CONTACTS = 500;
const MAX_PENDING_KEYS_PER_CONTACT = 50;

const PENDING_ACKS_FILE = path.join(DATA_DIR, 'data', 'pending-status-acks.json');

function loadPendingAcks() {
    try {
        if (!fs.existsSync(PENDING_ACKS_FILE)) return;
        const saved = JSON.parse(fs.readFileSync(PENDING_ACKS_FILE, 'utf8'));
        for (const [key, keys] of Object.entries(saved)) {
            if (Array.isArray(keys) && keys.length > 0) {
                pendingKeysByContact.set(key, keys);
            }
        }
    } catch (e) {
        console.error('⚠️ Erreur lecture pending-status-acks.json (ignorée) :', e.message);
    }
}
loadPendingAcks();

let pendingAcksSaveTimer = null;
function savePendingAcksSoon() {
    if (pendingAcksSaveTimer) return;
    pendingAcksSaveTimer = setTimeout(() => {
        pendingAcksSaveTimer = null;
        try {
            const dataDir = path.join(DATA_DIR, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const obj = Object.fromEntries(pendingKeysByContact);
            fs.writeFile(PENDING_ACKS_FILE, JSON.stringify(obj), 'utf8', (e) => {
                if (e) console.error('⚠️ Erreur écriture pending-status-acks.json :', e.message);
            });
        } catch (e) {
            console.error('⚠️ Erreur écriture pending-status-acks.json :', e.message);
        }
    }, 1500);
    if (pendingAcksSaveTimer.unref) pendingAcksSaveTimer.unref();
}

function buildPendingKey(resolvedParticipant, rawParticipant) {
    if (resolvedParticipant) {
        const phone = extractPhoneNumber(resolvedParticipant);
        if (phone) return `pn:${phone}`;
    }
    return rawParticipant ? `raw:${rawParticipant}` : null;
}

async function rememberPendingStatus(msgKey, sock) {
    if (!msgKey?.id) return;
    const resolved = await resolveRealParticipant(msgKey, sock);
    const key = buildPendingKey(resolved, msgKey.participant);
    if (!key) return;

    let list = pendingKeysByContact.get(key);
    if (!list) {
        list = [];
        pendingKeysByContact.set(key, list);
        if (pendingKeysByContact.size > MAX_TRACKED_CONTACTS) {
            pendingKeysByContact.delete(pendingKeysByContact.keys().next().value);
        }
    }
    // Anti-doublon simple (même id déjà en attente pour ce contact).
    if (!list.some((k) => k.id === msgKey.id)) {
        list.push({
            remoteJid: msgKey.remoteJid,
            id: msgKey.id,
            participant: msgKey.participant,
            fromMe: !!msgKey.fromMe,
        });
        if (list.length > MAX_PENDING_KEYS_PER_CONTACT) list.shift();
    }
    savePendingAcksSoon();
}

// Récupère (et vide) les clés d'origine en attente pour ce contact, dans
// l'ordre où elles ont été mémorisées (du plus ancien au plus récent).
function takePendingStatusKeys(resolvedParticipant, rawParticipant) {
    const key = buildPendingKey(resolvedParticipant, rawParticipant);
    if (!key) return [];
    const list = pendingKeysByContact.get(key);
    if (!list || list.length === 0) return [];
    pendingKeysByContact.delete(key);
    savePendingAcksSoon();
    return list;
}

// ✅ FIXED: Detects self-status by comparing participant LID to bot's own number
async function shouldViewStatus(message, botJid, sock) {
    try {
        const config = readConfig();
        if (!config.enabled) return false;
        if (!message.key || message.key.remoteJid !== 'status@broadcast') return false;

        // PREUVE DE TERRAIN (BWM-XMD) : ce bot ne filtre PAS par date du
        // tout — il voit tout statut qui passe dans l'event `messages.upsert`
        // dès que l'option est activée, peu importe quand il a été posté.
        // On retire donc complètement le filtre par horodatage ici : plus de
        // fenêtre de fraîcheur, plus de seuil d'activation. Seuls les vrais
        // choix de filtrage de l'utilisateur restent (include/exclude,
        // self-view) plus bas.

        const participant = message.key.participant || '';
        const participantNumber = participant.split('@')[0];
        const botNumber = botJid ? botJid.split('@')[0] : null;

        // Detect self-status: fromMe OR participant number matches bot's own number
        const isSelf = message.key.fromMe === true || 
                       (botNumber && participantNumber === botNumber);

        // Self-view check
        if (isSelf && !config.selfOn) return false;

        // Skip number filter for own status (always view own)
        if (!isSelf) {
            const listResult = await isNumberInList(message, sock);
            if (listResult !== null && !listResult) return false;
        }

        return true;
    } catch (e) { return false; }
}

// Différence avec shouldViewStatus() : ici on ne regarde QUE les filtres qui
// représentent un choix EXPLICITE de l'utilisateur (contact exclu/hors liste
// include, ou statut perso avec selfOn désactivé). On ignore volontairement
// `config.enabled` : ça ne veut pas dire "je ne veux jamais voir ce statut",
// juste "pas maintenant" — donc ça ne doit PAS empêcher de mémoriser l'ID
// pour un accusé groupé futur (voir rememberPendingStatus plus haut). Un
// contact réellement filtré (exclude, hors include, self sans selfOn), lui,
// ne doit jamais être mémorisé : sinon un changement ultérieur de filtre
// marquerait rétroactivement "vu" des statuts que l'utilisateur avait
// explicitement choisi d'ignorer.
async function isParticipantOptedOut(message, botJid, sock) {
    try {
        if (!message.key || message.key.remoteJid !== 'status@broadcast') return true;

        const participant = message.key.participant || '';
        const participantNumber = participant.split('@')[0];
        const botNumber = botJid ? botJid.split('@')[0] : null;
        const isSelf = message.key.fromMe === true ||
                       (botNumber && participantNumber === botNumber);

        const config = readConfig();
        if (isSelf) return !config.selfOn;

        const listResult = await isNumberInList(message, sock);
        if (listResult !== null && !listResult) return true;

        return false;
    } catch (e) { return true; }
}

async function isAutoStatusEnabled() { 
    return readConfig().enabled; 
}

async function isStatusLikeEnabled() { 
    return readConfig().likeOn; 
}

// ═══════════════════════════════════════
// STATUS HANDLERS
// ═══════════════════════════════════════

// sock.readMessages() (Baileys) appelle en interne fetchPrivacySettings() et
// choisit le type d'accusé 'read' OU 'read-self' selon le réglage de
// confidentialité "Accusés de lecture" du compte WhatsApp du bot :
//   - readreceipts = 'all'  → type 'read'      → l'auteur du statut voit "vu"
//   - readreceipts = autre  → type 'read-self' → accusé envoyé mais MARQUÉ
//     comme self-only : WhatsApp l'accepte (aucune erreur, d'où le log
//     "✅ Viewed" qui ment) mais ne l'affiche PAS dans la liste des vues de
//     l'auteur, exactement comme pour les messages normaux. C'est pour ça
//     qu'un like peut aussi ne jamais apparaître : sans une vue "réelle"
//     enregistrée côté WhatsApp, la réaction est envoyée mais rattachée à
//     un viewer que l'auteur ne voit pas.
// On contourne donc readMessages() ici et on force explicitement le type
// 'read' via sendReceipt(), indépendamment du réglage de confidentialité du
// compte lié au bot.
async function forceReadReceipt(sock, readKey) {
    // On force le type 'read' plutôt que sock.readMessages() brut : ce
    // dernier choisit lui-même entre 'read' et 'read-self' selon le réglage
    // de confidentialité "Accusés de lecture" du compte lié au bot, et
    // 'read-self' ne remonte jamais dans la liste des vues de l'auteur du
    // statut, même si le log affiche "✅ Viewed" (aucune erreur n'est levée).
    try {
        if (typeof sock.sendReceipt === 'function') {
            await sock.sendReceipt(readKey.remoteJid, readKey.participant, [readKey.id], 'read');
        } else {
            await sock.readMessages([readKey]);
        }
    } catch (e) {
        console.log(`⚠️ Échec accusé lecture statut ${readKey.id} :`, e.message);
        throw e;
    }
}

async function likeStatus(sock, msgKey, preResolvedParticipant = null) {
    try {
        const config = readConfig();
        if (!config.enabled || !config.likeOn) return;

        // WhatsApp masque de plus en plus les contacts derrière un LID
        // (@lid) plutôt que leur vrai numéro (@s.whatsapp.net). Réagir à un
        // statut nécessite une session chiffrée vers l'identité exacte du
        // contact ; si seul le LID est connu et que Baileys n'a pas résolu
        // le vrai numéro, WhatsApp refuse la réaction (406 not-acceptable).
        // Si handleStatusUpdate a déjà fait la résolution (pour le readMessages),
        // on la réutilise ici au lieu de la refaire (évite un 2e aller-retour,
        // avec ses éventuels 1.5s de délai de retry, pour rien).
        const participant = preResolvedParticipant || await resolveRealParticipant(msgKey, sock);
        if (!participant) {
            console.log(`⏭️ Like sauté (contact en @lid, numéro non résolu) : ${msgKey.id}`);
            return;
        }

        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const emoji = pickLikeEmoji(config);

        // On utilise l'API officielle de Baileys pour réagir (sock.sendMessage
        // avec `react`) plutôt qu'un relayMessage construit à la main : c'est
        // cette dernière approche qui empêchait la réaction de s'afficher
        // (WhatsApp acceptait la requête sans erreur mais l'ignorait, car le
        // message n'était pas généré/encodé comme Baileys l'attend).
        await sock.sendMessage('status@broadcast', {
            react: {
                text: emoji,
                key: msgKey
            }
        }, {
            statusJidList: [participant, myJid]
        });

        console.log(`${emoji} Liked: ${msgKey.id}`);
    } catch (error) {
        console.error('❌ Like error:', error.message);
    }
}

async function handleStatusUpdate(sock, status, type = 'notify') {
    try {
        if (!status.messages || status.messages.length === 0) return;
        
        const msg = status.messages[0];
        const config = readConfig();
        const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;

        // Debug log
        console.log(`📱 Status received | from: ${msg.key.participant} | fromMe: ${msg.key.fromMe} | id: ${msg.key.id} | type: ${type}`);
        if (msg.key.participant?.endsWith('@lid')) {
            console.log('🔍 Debug LID — champs bruts de la clé :', JSON.stringify(msg.key));
        }

        // PREUVE DE TERRAIN (BWM-XMD) : plus aucun filtre par date. On voit
        // (accusé + like) tout statut qui passe les filtres restants
        // (activé, contact pas exclu/self géré), que l'événement Baileys
        // soit "notify" (en direct) ou "append" (rattrapage après une
        // coupure/reconnexion) — exactement le comportement décrit : même un
        // statut déjà là avant l'activation finit vu dès qu'il repasse dans
        // l'event, et tout le lot part d'un coup en "Mises à jour vues".
        if (!config.enabled || !(await shouldViewStatus(msg, botJid, sock))) {
            // On mémorise la clé D'ORIGINE (pas juste l'id) dès que le contact
            // n'est PAS explicitement filtré, pour pouvoir accuser ce statut
            // précis plus tard avec SES PROPRES informations (voir plus haut).
            if (msg.key.participant && !(await isParticipantOptedOut(msg, botJid, sock))) {
                await rememberPendingStatus(msg.key, sock);
            }
            console.log(
                !config.enabled ? '⏭️ Status skipped (AutoStatus désactivé, mémorisé pour rattrapage)' :
                '⏭️ Status skipped (filtré : contact exclu/self)'
            );
            return;
        }

        // Anti-doublon : ne jamais retraiter le même statut deux fois.
        if (isDuplicateStatus(msg.key.id)) {
            console.log(`⏭️ Status déjà vu, doublon ignoré : ${msg.key.id}`);
            return;
        }

        console.log(`👁️ Viewing status: ${msg.key.id} from ${msg.key.participant?.split('@')[0] || 'unknown'}`);

        // Marquer un statut comme "vu" = envoyer un accusé de lecture XML basé
        // sur la clé du message (remoteJid + id + participant). Ça ne nécessite
        // aucune session chiffrée ni contenu déchiffré, donc ça marche même
        // avec le participant EN L'ÉTAT (LID ou numéro réel) — contrairement à
        // une réaction, qui, elle, a vraiment besoin du vrai numéro pour avoir
        // une session chiffrée valide.
        //
        // PREUVE DE TERRAIN (bot BWM-XMD fourni par l'utilisateur) : sa version
        // qui marche se résume à `sock.readMessages([m.key])`, SANS aucune
        // résolution LID→numéro — la clé brute suffit. On revient donc à la
        // clé brute ici aussi : la tentative précédente de substituer le
        // numéro résolu n'était pas la bonne piste. On garde quand même la
        // résolution pour le LIKE (qui, lui, a réellement besoin d'une vraie
        // session chiffrée pour fonctionner), mais plus pour l'accusé de vue.
        const readKey = msg.key;
        const resolvedParticipant = await resolveRealParticipant(msg.key, sock);

        // 🔁 REPRISE du rattrapage des vieux statuts en attente (v2, voir le
        // commentaire détaillé plus haut) : on accuse chaque ancien statut
        // AVEC SA PROPRE clé d'origine (pas celle du nouveau), un par un,
        // du plus ancien au plus récent, avant d'accuser le statut qu'on
        // vient réellement de recevoir.
        const pendingKeys = takePendingStatusKeys(resolvedParticipant, msg.key.participant);

        try {
            // Se met "en ligne" juste avant de voir le statut, comme le ferait
            // une vraie personne en ouvrant l'app. Simule un visionnage réel
            // plutôt qu'une action silencieuse en arrière-plan.
            try {
                await sock.sendPresenceUpdate('available', 'status@broadcast');
            } catch (presenceErr) {
                console.error('⚠️ Presence update error (non bloquant) :', presenceErr.message);
            }

            for (const oldKey of pendingKeys) {
                try {
                    await forceReadReceipt(sock, oldKey);
                    console.log(`📎 Ancien statut rattrapé (sa propre clé) : ${oldKey.id}`);
                } catch (oldErr) {
                    console.log(`⚠️ Échec rattrapage ancien statut ${oldKey.id} :`, oldErr.message);
                }
            }

            // On force le type 'read' via forceReadReceipt() (voir plus haut)
            // plutôt que sock.readMessages() brut : ce dernier choisit lui-même
            // entre 'read' et 'read-self' selon le réglage de confidentialité
            // "Accusés de lecture" du compte lié au bot, et 'read-self' ne
            // remonte jamais dans la liste des vues de l'auteur du statut,
            // même si le log affiche "✅ Viewed" (aucune erreur n'est levée).
            await forceReadReceipt(sock, readKey);
            console.log(`✅ Viewed: ${msg.key.id}`);

            // Like if enabled — on réutilise la résolution déjà faite ci-dessus
            // au lieu de la refaire une deuxième fois dans likeStatus().
            if (config.likeOn) {
                await likeStatus(sock, msg.key, resolvedParticipant);
            }
        } catch (err) {
            if (err.message?.includes('rate-overlimit')) {
                console.log('⚠️ Rate limit, waiting...');
                await new Promise(r => setTimeout(r, 2000));
                await forceReadReceipt(sock, readKey);
            } else {
                console.error('❌ View error:', err.message);
            }
        }
    } catch (e) {
        console.error('❌ Status error:', e.message);
    }
}

async function handleBulkStatusUpdate(sock, statusMessages) {
    try {
        const config = readConfig();
        if (!config.enabled) return;

        const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;

        console.log(`\n📦 Processing ${statusMessages.length} status updates...`);

        for (const msg of statusMessages) {
            if (!(await shouldViewStatus(msg, botJid, sock))) continue;
            if (isDuplicateStatus(msg.key.id)) continue;

            try {
                // L'accusé "vu" part avec la clé BRUTE (participant tel quel,
                // LID ou numéro réel) — c'est ce qui fonctionnait avant.
                // Substituer un numéro "résolu" ici est ce qui cassait la
                // visibilité côté auteur du statut quand la résolution
                // LID→numéro se trompait (voir le commentaire détaillé dans
                // handleStatusUpdate). On garde la résolution uniquement pour
                // le like, qui a réellement besoin d'une session valide.
                const resolvedParticipant = await resolveRealParticipant(msg.key, sock);
                await forceReadReceipt(sock, msg.key);
                console.log('✅ Viewed:', msg.key.id);

                if (config.likeOn) {
                    await likeStatus(sock, msg.key, resolvedParticipant);
                }
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) { 
                    await new Promise(r => setTimeout(r, 2000)); 
                }
            }
        }
    } catch (e) {
        console.error('❌ Bulk status error:', e.message);
    }
}

// ═══════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════

async function autoStatusCommand(sock, chatId, message, args, senderNumber) {
    try {
        const isOwner = message.key.fromMe || senderNumber === OWNER_NUMBER;
        if (!isOwner) {
            await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!'});
            return;
        }

        const config = readConfig();

        if (!args || args.length === 0) {
            const status = config.enabled ? '✅ ON' : '❌ OFF';
            const statusIcon = config.enabled ? '🟢' : '🔴';
            const likeStatus = config.likeOn ? '✅ ON' : '❌ OFF';
            const selfStatus = config.selfOn ? '✅ ON' : '❌ OFF';
            const filterMode = config.numberList.length > 0 ? (config.includeMode ? '✅ Include Only' : '🚫 Exclude') : '🌍 All Numbers';

            await sock.sendMessage(chatId, {
                text: `┏━━◆ ⚜️ *AUTO-STATUS* ⚜️ ◆━━┓\n` +
                      `┃ ${statusIcon} Viewer : ${status}\n` +
                      `┃ 💚 Likes : ${likeStatus}\n` +
                      `┃ 🎭 Emojis : ${config.likeEmojis.join(' ')}\n` +
                      `┃ 👤 Self-view : ${selfStatus}\n` +
                      `┃ 🔢 Filtre : ${filterMode} (${config.numberList.length})\n` +
                      `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
                      `╭─⭓ 📖 *COMMANDES*\n` +
                      `│ • *.autostatus on* — voir les statuts à l'instant\n` +
                      `│ • *.autostatus off* — désactive tout\n` +
                      `│ • *.autostatuslike on* — active les likes\n` +
                      `│ • *.autostatuslike off* — désactive les likes\n` +
                      `│ • *.autostatus emoji add <emojis>* — ajouter des emojis de like\n` +
                      `│ • *.autostatus emoji remove <emojis>* — retirer des emojis de like\n` +
                      `│ • *.autostatus emoji set <emojis>* — remplacer toute la liste\n` +
                      `│ • *.autostatus emoji clear* — revenir à 💚 seul\n` +
                      `│ • *.autostatus self on* — voir aussi tes propres statuts\n` +
                      `│ • *.autostatus self off* — ignorer tes propres statuts\n` +
                      `│ • *.autostatus include add <numeros>* — ne voir que ces numéros\n` +
                      `│ • *.autostatus include remove <numeros>* — retirer de la liste incluse\n` +
                      `│ • *.autostatus exclude add <numeros>* — ignorer ces numéros\n` +
                      `│ • *.autostatus exclude remove <numeros>* — retirer de la liste exclue\n` +
                      `│ • *.autostatus includelist / excludelist* — afficher la liste\n` +
                      `│ • *.autostatus includeclear / excludeclear* — vider la liste\n` +
                      `╰────────\n\n` +
                      `💡 *Exemple :* .autostatus include add 2347012345678`
            }, { quoted: message });
            return;
        }


        const cmd = args[0].toLowerCase();
        
        if (cmd === 'on') {
            if (config.enabled) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *ALREADY ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👁️ Auto-Status Viewer is already *ON*.`
                }, { quoted: message });
                return;
            }
            config.enabled = true;
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { 
                    text: `✅ *AUTO-STATUS VIEWER ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👁️ Bot will now automatically view all status updates.`
                }, { quoted: message });
            }
        } 
        else if (cmd === 'off') {
            if (!config.enabled) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *ALREADY DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👁️ Auto-Status Viewer is already *OFF*.`
                }, { quoted: message });
                return;
            }
            config.enabled = false;
            config.likeOn = false;
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { 
                    text: `❌ *AUTO-STATUS VIEWER DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👁️ Bot will no longer view or like statuses.`
                }, { quoted: message });
            }
        } 
        else if (cmd === 'autostatuslike') {
            if (!args[1]) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatuslike <on/off>\n\n💡 *Example:* .autostatuslike on`
                }, { quoted: message });
                return;
            }
            const likeState = args[1].toLowerCase();
            if (likeState === 'on') {
                if (config.likeOn) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *ALREADY ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n💚 Likes are already *ON*.`
                    }, { quoted: message });
                    return;
                }
                config.likeOn = true;
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `💚 *LIKES ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n💚 Bot will like viewed statuses with 💚.`
                    }, { quoted: message });
                }
            } else if (likeState === 'off') {
                if (!config.likeOn) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *ALREADY DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n💚 Likes are already *OFF*.`
                    }, { quoted: message });
                    return;
                }
                config.likeOn = false;
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `❌ *LIKES DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n💚 Bot will view but not like statuses.`
                    }, { quoted: message });
                }
            }
        }
        else if (cmd === 'self') {
            if (!args[1]) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus self <on/off>\n\n💡 *Example:* .autostatus self on`
                }, { quoted: message });
                return;
            }
            const selfState = args[1].toLowerCase();
            if (selfState === 'on') {
                if (config.selfOn) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *ALREADY ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Self-View is already *ON*.`
                    }, { quoted: message });
                    return;
                }
                config.selfOn = true;
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `👤 *SELF-VIEW ENABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Bot will now view its own status updates.`
                    }, { quoted: message });
                }
            } else if (selfState === 'off') {
                if (!config.selfOn) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *ALREADY DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Self-View is already *OFF*.`
                    }, { quoted: message });
                    return;
                }
                config.selfOn = false;
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `❌ *SELF-VIEW DISABLED*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Bot will skip its own status updates.`
                    }, { quoted: message });
                }
            }
        }
        else if (cmd === 'emoji') {
            const sub = args[1]?.toLowerCase();

            if (sub === 'add') {
                const emojis = args.slice(2).filter(e => e.trim().length > 0);
                if (emojis.length === 0) {
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus emoji add <emoji1> <emoji2> ...\n\n💡 *Example:* .autostatus emoji add ❤️ 🔥 👍`
                    }, { quoted: message });
                    return;
                }
                for (const e of emojis) { if (!config.likeEmojis.includes(e)) config.likeEmojis.push(e); }
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, {
                        text: `✅ *EMOJI(S) AJOUTÉ(S)*\n\n━━━━━━━━━━━━━━━━━━━━\n${config.likeEmojis.join(' ')}\n\n💡 Un emoji est choisi au hasard dans cette liste à chaque like.`
                    }, { quoted: message });
                }
            }
            else if (sub === 'remove') {
                const emojis = args.slice(2).filter(e => e.trim().length > 0);
                if (emojis.length === 0) {
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus emoji remove <emoji1> <emoji2> ...`
                    }, { quoted: message });
                    return;
                }
                const before = config.likeEmojis.length;
                config.likeEmojis = config.likeEmojis.filter(e => !emojis.includes(e));
                const removed = before - config.likeEmojis.length;
                if (config.likeEmojis.length === 0) config.likeEmojis = ['💚']; // jamais vide
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, {
                        text: `✅ *EMOJI(S) RETIRÉ(S)*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 Retiré ${removed} emoji(s)\n📋 Liste actuelle : ${config.likeEmojis.join(' ')}`
                    }, { quoted: message });
                }
            }
            else if (sub === 'set') {
                const emojis = args.slice(2).filter(e => e.trim().length > 0);
                if (emojis.length === 0) {
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus emoji set <emoji1> <emoji2> ...\n\n💡 Remplace complètement la liste actuelle.`
                    }, { quoted: message });
                    return;
                }
                config.likeEmojis = [...new Set(emojis)];
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, {
                        text: `✅ *LISTE REMPLACÉE*\n\n━━━━━━━━━━━━━━━━━━━━\n📋 ${config.likeEmojis.join(' ')}`
                    }, { quoted: message });
                }
            }
            else if (sub === 'clear') {
                config.likeEmojis = ['💚'];
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, {
                        text: `✅ *RÉINITIALISÉ*\n\n━━━━━━━━━━━━━━━━━━━━\n📋 ${config.likeEmojis.join(' ')}`
                    }, { quoted: message });
                }
            }
            else {
                await sock.sendMessage(chatId, {
                    text: `📋 *EMOJIS DE LIKE*\n\n━━━━━━━━━━━━━━━━━━━━\n${config.likeEmojis.join(' ')}\n\n📖 *Commands:*\n└ .autostatus emoji add <emojis> - ajouter à la liste\n└ .autostatus emoji remove <emojis> - retirer de la liste\n└ .autostatus emoji set <emojis> - remplacer toute la liste\n└ .autostatus emoji clear - revenir à 💚 seul`
                }, { quoted: message });
            }
        }
        else if (cmd === 'include') {
            const sub = args[1]?.toLowerCase();
            if (sub === 'add') {
                const numbers = args.slice(2).join(' ').split(/[, ]+/).map(n => n.replace(/[^0-9]/g, '')).filter(n => n.length >= 7);
                if (numbers.length === 0) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus include add <numbers>`
                    }, { quoted: message });
                    return;
                }
                config.includeMode = true;
                for (const num of numbers) { if (!config.numberList.includes(num)) config.numberList.push(num); }
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `✅ *INCLUDE ADDED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 Mode: Include Only\n🔢 Added ${numbers.length} number(s)`
                    }, { quoted: message });
                }
            }
            else if (sub === 'remove') {
                const numbers = args.slice(2).join(' ').split(/[, ]+/).map(n => n.replace(/[^0-9]/g, '')).filter(n => n.length >= 7);
                if (numbers.length === 0) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus include remove <numbers>`
                    }, { quoted: message });
                    return;
                }
                const before = config.numberList.length;
                config.numberList = config.numberList.filter(n => !numbers.includes(n));
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `✅ *INCLUDE REMOVED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 Removed ${before - config.numberList.length} number(s)`
                    }, { quoted: message });
                }
            }
            else {
                await sock.sendMessage(chatId, { 
                    text: `📋 *INCLUDE MODE*\n\n━━━━━━━━━━━━━━━━━━━━\n🔢 Numbers: ${config.numberList.length}`
                }, { quoted: message });
            }
        }
        else if (cmd === 'exclude') {
            const sub = args[1]?.toLowerCase();
            if (sub === 'add') {
                const numbers = args.slice(2).join(' ').split(/[, ]+/).map(n => n.replace(/[^0-9]/g, '')).filter(n => n.length >= 7);
                if (numbers.length === 0) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus exclude add <numbers>`
                    }, { quoted: message });
                    return;
                }
                config.includeMode = false;
                for (const num of numbers) { if (!config.numberList.includes(num)) config.numberList.push(num); }
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `✅ *EXCLUDE ADDED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 Mode: Exclude\n🔢 Added ${numbers.length} number(s)`
                    }, { quoted: message });
                }
            }
            else if (sub === 'remove') {
                const numbers = args.slice(2).join(' ').split(/[, ]+/).map(n => n.replace(/[^0-9]/g, '')).filter(n => n.length >= 7);
                if (numbers.length === 0) {
                    await sock.sendMessage(chatId, { 
                        text: `⚠️ *USAGE*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 .autostatus exclude remove <numbers>`
                    }, { quoted: message });
                    return;
                }
                const before = config.numberList.length;
                config.numberList = config.numberList.filter(n => !numbers.includes(n));
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { 
                        text: `✅ *EXCLUDE REMOVED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 Removed ${before - config.numberList.length} number(s)`
                    }, { quoted: message });
                }
            }
            else {
                await sock.sendMessage(chatId, { 
                    text: `📋 *EXCLUDE MODE*\n\n━━━━━━━━━━━━━━━━━━━━\n🔢 Numbers: ${config.numberList.length}`
                }, { quoted: message });
            }
        }
        else if (cmd === 'includelist') {
            const nums = config.numberList;
            await sock.sendMessage(chatId, { 
                text: `📋 *INCLUDE LIST*\n\n━━━━━━━━━━━━━━━━━━━━\n🔢 Mode: Include Only\n📊 Total: ${nums.length}\n\n${nums.length > 0 ? nums.map((n, i) => `${i + 1}. +${n}`).join('\n') : '└ No numbers'}`
            }, { quoted: message });
        }
        else if (cmd === 'excludelist') {
            const nums = config.numberList;
            await sock.sendMessage(chatId, { 
                text: `📋 *EXCLUDE LIST*\n\n━━━━━━━━━━━━━━━━━━━━\n🔢 Mode: Exclude\n📊 Total: ${nums.length}\n\n${nums.length > 0 ? nums.map((n, i) => `${i + 1}. +${n}`).join('\n') : '└ No numbers'}`
            }, { quoted: message });
        }
        else if (cmd === 'includeclear') {
            if (config.numberList.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *ALREADY EMPTY*\n\n━━━━━━━━━━━━━━━━━━━━\n📋 Include list is already empty.`
                }, { quoted: message });
                return;
            }
            config.numberList = [];
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { 
                    text: `✅ *INCLUDE LIST CLEARED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 All numbers removed.\n🌍 Will view all statuses.`
                }, { quoted: message });
            }
        }
        else if (cmd === 'excludeclear') {
            if (config.numberList.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *ALREADY EMPTY*\n\n━━━━━━━━━━━━━━━━━━━━\n📋 Exclude list is already empty.`
                }, { quoted: message });
                return;
            }
            config.numberList = [];
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { 
                    text: `✅ *EXCLUDE LIST CLEARED*\n\n━━━━━━━━━━━━━━━━━━━━\n📌 All numbers removed.\n🌍 Will view all statuses.`
                }, { quoted: message });
            }
        }
        else {
            await sock.sendMessage(chatId, { 
                text: `⚠️ *INVALID COMMAND*\n\n━━━━━━━━━━━━━━━━━━━━\n📖 Use .autostatus to see all options.`
            }, { quoted: message });
        }
    } catch (e) {
        console.error('❌ Command error:', e.message);
    }
}

module.exports = {
    handleStatusUpdate,
    handleBulkStatusUpdate,
    autoStatusCommand,
    isAutoStatusEnabled,
    isStatusLikeEnabled,
    readConfig,
    writeConfig
};
