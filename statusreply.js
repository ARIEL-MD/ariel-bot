// ═══════════════════════════════════════════════════════════════════════
// AUTO-ENVOI DU STATUT SUR COMMENTAIRE
// ═══════════════════════════════════════════════════════════════════════
// Quand quelqu'un répond/commente un de TES statuts en écrivant un mot
// déclencheur (par défaut "envoi"), le bot lui renvoie automatiquement le
// contenu original du statut (image, vidéo, texte...) en message privé.
//
// Fonctionnement technique : sur WhatsApp, répondre à un statut envoie un
// message NORMAL (pas vers status@broadcast) dans la conversation avec la
// personne qui répond, mais ce message embarque un `contextInfo` qui
// pointe vers le statut d'origine :
//   - contextInfo.remoteJid === 'status@broadcast'   → signale que c'est
//     bien une réponse à un statut (et pas une simple citation de message)
//   - contextInfo.participant                        → l'auteur du statut
//   - contextInfo.stanzaId                            → l'ID du statut
//   - contextInfo.quotedMessage                       → le contenu brut du
//     statut original (imageMessage / videoMessage / extendedTextMessage...)
// ═══════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./lib/paths');
const { OWNER_NUMBER, PREFIX, PREFIXES } = require('./config');

const configPath = path.join(DATA_DIR, 'data', 'statusreply.json');

const defaultConfig = {
    enabled: true,
    triggerWords: ['envoi', 'envoie', 'envoyer']
};

function initConfig() {
    try {
        const dataDir = path.join(DATA_DIR, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        }

        const config = JSON.parse(fs.readFileSync(configPath));
        let needsUpdate = false;
        for (const [key, value] of Object.entries(defaultConfig)) {
            if (config[key] === undefined) { config[key] = value; needsUpdate = true; }
        }
        if (needsUpdate) fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        return config;
    } catch (e) {
        console.error('❌ Error reading statusreply config:', e.message);
        return { ...defaultConfig };
    }
}

// Cache en mémoire : initConfig() fait plusieurs accès disque synchrones
// (existsSync, readFileSync, parfois writeFileSync), et readConfig() était
// appelée à CHAQUE message reçu par le bot (voir handlePossibleStatusReplySend
// dans index.js), donc avant même l'exécution d'une commande — ça ralentissait
// TOUTES les réponses, pas seulement celles liées aux statuts. On ne va donc
// sur le disque qu'une fois, au premier appel, puis on garde le résultat en
// mémoire ; toute écriture (writeConfig) met aussi à jour le cache.
let cachedConfig = null;

function readConfig() {
    if (cachedConfig === null) {
        cachedConfig = initConfig();
    }
    return cachedConfig;
}

function writeConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        cachedConfig = config;
        return true;
    } catch (e) {
        console.error('❌ Failed to write statusreply config:', e.message);
        return false;
    }
}

// Récupère le contextInfo, peu importe le type du message (texte, image,
// vidéo, sticker...) — chaque type de message WhatsApp porte son propre
// champ contextInfo au même niveau que son contenu.
function extractContextInfo(message) {
    if (!message) return null;
    for (const type of Object.keys(message)) {
        const content = message[type];
        if (content && typeof content === 'object' && content.contextInfo) {
            return content.contextInfo;
        }
    }
    return null;
}

// Récupère le texte libre du message (là où l'utilisateur a pu taper
// "envoi"), peu importe si c'est un texte simple ou la légende d'un média.
function extractBodyText(message) {
    if (!message) return '';
    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        ''
    ).trim();
}

// Anti-doublon : évite de renvoyer deux fois le même statut si WhatsApp
// redélivre le même message de réponse (retry réseau, reconnexion...).
const processedReplyIds = new Set();
const MAX_PROCESSED_CACHE = 2000;

function isDuplicateReply(id) {
    if (!id) return false;
    if (processedReplyIds.has(id)) return true;
    processedReplyIds.add(id);
    if (processedReplyIds.size > MAX_PROCESSED_CACHE) {
        processedReplyIds.delete(processedReplyIds.values().next().value);
    }
    return false;
}

// Détecte une réponse à statut avec un mot déclencheur, et renvoie le
// contenu original du statut à l'expéditeur si tout correspond.
// Retourne true si un envoi a eu lieu (pour permettre à l'appelant de
// stopper le reste du traitement du message, comme les autres features).
async function handlePossibleStatusReplySend(sock, msg) {
    try {
        const config = readConfig();
        if (!config.enabled) return false;
        if (msg.key.fromMe) return false; // on ne réagit qu'aux messages des AUTRES
        if (!msg.message) return false;

        const contextInfo = extractContextInfo(msg.message);
        if (!contextInfo) return false;
        if (contextInfo.remoteJid !== 'status@broadcast') return false;
        if (!contextInfo.quotedMessage) return false;

        // Ne réagit qu'aux commentaires sur TES PROPRES statuts (pas ceux
        // d'un tiers que le bot aurait pu voir passer autrement).
        const myNumber = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null;
        const statusAuthorNumber = (contextInfo.participant || '').split('@')[0].split(':')[0];
        if (!myNumber || statusAuthorNumber !== myNumber) return false;

        const bodyText = extractBodyText(msg.message).toLowerCase();
        if (!bodyText) return false;

        const triggers = (config.triggerWords || defaultConfig.triggerWords).map(w => w.toLowerCase());
        // Correspondance sur le mot complet (pas juste "contains"), pour
        // éviter un faux déclenchement sur une phrase qui contient le mot
        // sans le vouloir dire ("je t'envoie pas ça" ne doit pas déclencher).
        const words = bodyText.split(/\s+/);
        const matched = triggers.some(t => words.includes(t)) || triggers.includes(bodyText);
        if (!matched) return false;

        if (isDuplicateReply(msg.key.id)) return false;

        const from = msg.key.remoteJid; // conversation avec la personne qui a commenté

        // Reconstruit un WAMessage complet à partir du contextInfo pour
        // pouvoir le transmettre avec `forward` (Baileys a besoin de la
        // clé ET du contenu, pas juste du contenu brut du contextInfo).
        const originalStatusMessage = {
            key: {
                remoteJid: 'status@broadcast',
                id: contextInfo.stanzaId,
                participant: contextInfo.participant,
                fromMe: true
            },
            message: contextInfo.quotedMessage
        };

        await sock.sendMessage(from, { forward: originalStatusMessage }, { quoted: msg });
        console.log(`📤 Statut renvoyé à ${from.split('@')[0]} (déclencheur: "${bodyText}")`);
        return true;
    } catch (e) {
        console.error('❌ Erreur envoi statut sur commentaire :', e.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// SAUVEGARDE D'UN STATUT AVEC .save
// ═══════════════════════════════════════════════════════════════════════
// Quand TOI (le propriétaire du bot) commentes N'IMPORTE QUEL statut — le
// tien ou celui d'un contact — en écrivant ".save" (ou "!save"), le bot
// t'envoie une copie du contenu original du statut (image, vidéo, texte...)
// directement dans TA PROPRE conversation (message à toi-même), sans rien
// renvoyer dans la conversation avec la personne dont c'est le statut.
//
// NB : contrairement à .statusreply (qui ne réagit qu'aux commentaires sur
// TES statuts, écrits par d'AUTRES personnes), .save fonctionne sur le
// statut de n'importe qui, mais uniquement quand c'est TOI qui commentes
// (le bot tourne sur ton propre compte, donc msg.key.fromMe === true).
//
// Limite technique connue : sur WhatsApp, commenter un statut envoie
// réellement le message ".save" à la personne concernée AVANT que le bot
// ne puisse intervenir — impossible à éviter, c'est le fonctionnement de
// WhatsApp lui-même. Le bot se contente ensuite de te renvoyer une copie
// du contenu, en plus, dans ta propre conversation.
async function handlePossibleStatusSaveCommand(sock, msg) {
    try {
        if (!msg.key.fromMe) return false; // seul le propriétaire peut sauvegarder
        if (!msg.message) return false;

        const contextInfo = extractContextInfo(msg.message);
        if (!contextInfo) return false;
        if (contextInfo.remoteJid !== 'status@broadcast') return false;
        if (!contextInfo.quotedMessage) return false;

        const bodyText = extractBodyText(msg.message).trim().toLowerCase();
        if (!bodyText) return false;

        const prefixes = (PREFIXES && PREFIXES.length ? PREFIXES : [PREFIX || '.']).map(p => p.toLowerCase());
        const isSaveCommand = prefixes.some(p => bodyText === `${p}save`);
        if (!isSaveCommand) return false;

        if (isDuplicateReply(`save:${msg.key.id}`)) return false;

        const selfJid = sock.user?.id
            ? sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net'
            : null;
        if (!selfJid) return false;

        // Reconstruit un WAMessage complet à partir du contextInfo, comme
        // pour .statusreply, pour pouvoir le transmettre avec `forward`.
        const originalStatusMessage = {
            key: {
                remoteJid: 'status@broadcast',
                id: contextInfo.stanzaId,
                participant: contextInfo.participant,
                fromMe: false
            },
            message: contextInfo.quotedMessage
        };

        const authorNumber = (contextInfo.participant || '').split('@')[0].split(':')[0];

        await sock.sendMessage(selfJid, { forward: originalStatusMessage });
        await sock.sendMessage(selfJid, {
            text: `💾 Statut sauvegardé (de wa.me/${authorNumber}).`
        });

        console.log(`💾 Statut de ${authorNumber} sauvegardé sur demande (.save)`);
        return true;
    } catch (e) {
        console.error('❌ Erreur sauvegarde statut (.save):', e.message);
        return false;
    }
}

// ═══════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════

async function statusReplyCommand(sock, chatId, message, args, senderNumber) {
    try {
        const isOwner = message.key.fromMe || senderNumber === OWNER_NUMBER;
        if (!isOwner) {
            await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner!' });
            return;
        }

        const config = readConfig();

        if (!args || args.length === 0) {
            const status = config.enabled ? '✅ ON' : '❌ OFF';
            await sock.sendMessage(chatId, {
                text: `┏━━◆ ⚜️ *AUTO-ENVOI STATUT* ⚜️ ◆━━┓\n` +
                      `┃ ${config.enabled ? '🟢' : '🔴'} Statut : ${status}\n` +
                      `┃ 🔑 Mots déclencheurs : ${config.triggerWords.join(', ')}\n` +
                      `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
                      `╭─⭓ 📖 *COMMANDES*\n` +
                      `│ • *.statusreply on* — active l'auto-envoi\n` +
                      `│ • *.statusreply off* — désactive l'auto-envoi\n` +
                      `│ • *.statusreply words add <mots>* — ajoute des mots déclencheurs\n` +
                      `│ • *.statusreply words remove <mots>* — retire des mots déclencheurs\n` +
                      `│ • *.statusreply words set <mots>* — remplace toute la liste\n` +
                      `╰────────\n\n` +
                      `💡 Quand quelqu'un répond à un de tes statuts en écrivant un de\n` +
                      `ces mots (rien d'autre), le bot lui renvoie automatiquement\n` +
                      `le statut d'origine (image, vidéo, texte...) en message privé.`
            }, { quoted: message });
            return;
        }

        const cmd = args[0].toLowerCase();

        if (cmd === 'on') {
            if (config.enabled) {
                await sock.sendMessage(chatId, { text: `⚠️ Déjà activé.` }, { quoted: message });
                return;
            }
            config.enabled = true;
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { text: `✅ Auto-envoi du statut sur commentaire activé.` }, { quoted: message });
            }
        }
        else if (cmd === 'off') {
            if (!config.enabled) {
                await sock.sendMessage(chatId, { text: `⚠️ Déjà désactivé.` }, { quoted: message });
                return;
            }
            config.enabled = false;
            if (writeConfig(config)) {
                await sock.sendMessage(chatId, { text: `❌ Auto-envoi du statut sur commentaire désactivé.` }, { quoted: message });
            }
        }
        else if (cmd === 'words') {
            const sub = args[1]?.toLowerCase();
            const words = args.slice(2).map(w => w.toLowerCase().trim()).filter(Boolean);

            if (sub === 'add') {
                if (words.length === 0) {
                    await sock.sendMessage(chatId, { text: `⚠️ Usage : .statusreply words add <mots>` }, { quoted: message });
                    return;
                }
                for (const w of words) { if (!config.triggerWords.includes(w)) config.triggerWords.push(w); }
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { text: `✅ Mots ajoutés.\n📋 Liste : ${config.triggerWords.join(', ')}` }, { quoted: message });
                }
            }
            else if (sub === 'remove') {
                if (words.length === 0) {
                    await sock.sendMessage(chatId, { text: `⚠️ Usage : .statusreply words remove <mots>` }, { quoted: message });
                    return;
                }
                config.triggerWords = config.triggerWords.filter(w => !words.includes(w));
                if (config.triggerWords.length === 0) config.triggerWords = ['envoi'];
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { text: `✅ Mots retirés.\n📋 Liste : ${config.triggerWords.join(', ')}` }, { quoted: message });
                }
            }
            else if (sub === 'set') {
                if (words.length === 0) {
                    await sock.sendMessage(chatId, { text: `⚠️ Usage : .statusreply words set <mots>` }, { quoted: message });
                    return;
                }
                config.triggerWords = [...new Set(words)];
                if (writeConfig(config)) {
                    await sock.sendMessage(chatId, { text: `✅ Liste remplacée.\n📋 Liste : ${config.triggerWords.join(', ')}` }, { quoted: message });
                }
            }
            else {
                await sock.sendMessage(chatId, { text: `📋 Mots déclencheurs : ${config.triggerWords.join(', ')}` }, { quoted: message });
            }
        }
        else {
            await sock.sendMessage(chatId, { text: `⚠️ Commande invalide. Utilise .statusreply pour voir les options.` }, { quoted: message });
        }
    } catch (e) {
        console.error('❌ statusReplyCommand error:', e.message);
    }
}

module.exports = {
    handlePossibleStatusReplySend,
    handlePossibleStatusSaveCommand,
    statusReplyCommand,
    readConfig,
    writeConfig
};
