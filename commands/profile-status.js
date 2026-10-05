// ============ PROFIL & STATUT (pp, block, unblock, setstatus, scstatus) ============
// Ce module ajoute des commandes de gestion du profil WhatsApp du bot et de
// diffusion de statuts (stories), adaptées à l'architecture de ce projet
// (tableau `commands`, run(sock, msg, { from, args, quoted, senderNumber })).
//
// Ajouté à la volée dans commands/index.js : `commands.push(...require("./profile-status"))`.

const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../lib/paths");
const crypto = require("crypto");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { OWNER_NUMBER } = require("../config");
const { getKnownContacts } = require("../contacts-store");

const isOwner = (senderNumber) => senderNumber === OWNER_NUMBER;

// "24101234567,+225 07 xx,jid@s.whatsapp.net" -> ["24101234567@s.whatsapp.net", ...]
function parseJidList(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s.includes("@")) return s;
      const digits = s.replace(/[^0-9]/g, "");
      return digits ? `${digits}@s.whatsapp.net` : null;
    })
    .filter(Boolean);
}

// ------------------------------------------------------------------
// Médias cités (image / vidéo / texte) — pour setstatus & scstatus
// ------------------------------------------------------------------

function getQuotedMediaType(quoted) {
  if (!quoted) return null;
  if (quoted.imageMessage) return "image";
  if (quoted.videoMessage) return "video";
  if (quoted.conversation || quoted.extendedTextMessage) return "text";
  return null;
}

async function buildStatusContent(sock, quoted, mediaType) {
  if (mediaType === "text") {
    const text = quoted.conversation || quoted.extendedTextMessage?.text || "";
    return { text, backgroundColor: "#000000" };
  }
  const buffer = await downloadMediaMessage(
    { message: quoted },
    "buffer",
    {},
    { reuploadRequest: sock.updateMediaMessage }
  );
  if (mediaType === "image") {
    return { image: buffer, caption: quoted.imageMessage?.caption || "" };
  }
  return { video: buffer, caption: quoted.videoMessage?.caption || "" };
}

// Redimensionne/complète une image en carré (fond noir) sans rien couper,
// pour .fullpp — contrairement à .pp qui laisse Baileys recadrer au centre.
async function padToSquare(buffer) {
  const { Jimp } = require("jimp");
  const img = await Jimp.read(buffer);
  const size = Math.max(img.width, img.height);
  const canvas = new Jimp({ width: size, height: size, color: 0x000000ff });
  const x = Math.floor((size - img.width) / 2);
  const y = Math.floor((size - img.height) / 2);
  canvas.composite(img, x, y);
  return canvas.getBuffer("image/jpeg");
}

// ------------------------------------------------------------------
// Programmation de statuts (.scstatus) — persistance sur disque + setTimeout,
// rechargée au démarrage via initScheduledStatuses(sock).
// ------------------------------------------------------------------

const SCHEDULE_FILE = path.join(DATA_DIR, "status-schedules.json");
const SCHEDULE_MEDIA_DIR = path.join(DATA_DIR, "tmp", "scheduled-status");
const activeTimers = new Map();

function loadSchedules() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveSchedules(list) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(list, null, 2), "utf8");
}

// "min-hour[-day[-month]]" -> { minute, hour, day, month }
function parseScheduleTime(str) {
  if (!str) return null;
  const parts = String(str)
    .split("-")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length < 2) return null;
  const [minStr, hourStr, dayStr, monthStr] = parts;
  const minute = Number(minStr);
  const hour = Number(hourStr);
  const day = dayStr !== undefined ? Number(dayStr) : null;
  const month = monthStr !== undefined ? Number(monthStr) : null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return null;
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) return null;
  return { minute, hour, day, month };
}

function computeNextRun({ minute, hour, day, month }) {
  const now = new Date();
  const next = new Date(now);
  if (month !== null) next.setMonth(month - 1);
  if (day !== null) next.setDate(day);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    if (day !== null && month !== null) next.setFullYear(next.getFullYear() + 1);
    else if (day !== null) next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
  }
  return next;
}

async function contentFromSchedule(entry) {
  if (entry.mediaType === "text") {
    return { text: entry.text || "", backgroundColor: "#000000" };
  }
  const buffer = fs.readFileSync(entry.mediaPath);
  if (entry.mediaType === "image") return { image: buffer, caption: entry.caption || "" };
  return { video: buffer, caption: entry.caption || "" };
}

function removeSchedule(id) {
  const list = loadSchedules().filter((e) => e.id !== id);
  saveSchedules(list);
  const t = activeTimers.get(id);
  if (t) {
    clearTimeout(t);
    activeTimers.delete(id);
  }
  try {
    const mediaPath = path.join(SCHEDULE_MEDIA_DIR, id);
    if (fs.existsSync(mediaPath)) fs.rmSync(mediaPath);
  } catch {}
}

function scheduleEntry(sock, entry) {
  // Si un minuteur existe déjà pour cette entrée (ex: reprogrammé après une
  // reconnexion WhatsApp via initScheduledStatuses), on le supprime d'abord.
  // Sinon, chaque reconnexion ajoute un minuteur en plus sans jamais annuler
  // les précédents : ils s'accumulent en mémoire et le statut programmé finit
  // même par partir plusieurs fois en double.
  const existing = activeTimers.get(entry.id);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, new Date(entry.runAt).getTime() - Date.now());
  const timer = setTimeout(async () => {
    try {
      const content = await contentFromSchedule(entry);
      await sock.sendMessage("status@broadcast", content, {
        statusJidList: entry.jids,
        broadcast: true,
      });
    } catch (err) {
      console.error("Erreur envoi statut programmé :", err);
    } finally {
      removeSchedule(entry.id);
    }
  }, delay);
  activeTimers.set(entry.id, timer);
}

// À appeler une fois la connexion établie (voir index.js) pour reprogrammer
// les statuts déjà en attente lors d'un redémarrage du bot.
function initScheduledStatuses(sock) {
  for (const entry of loadSchedules()) {
    scheduleEntry(sock, entry);
  }
}


// ------------------------------------------------------------------
// Blocage / déblocage de contacts (.block / .unblock)
// ------------------------------------------------------------------

// Détermine le JID visé : mention > message cité > numéro en argument >
// interlocuteur du chat privé en cours.
function resolveBlockTarget(msg, args, from) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  if (args[0]) {
    if (args[0].includes("@")) return args[0];
    const digits = args[0].replace(/[^0-9]/g, "");
    if (digits) return `${digits}@s.whatsapp.net`;
  }
  if (from && !from.endsWith("@g.us") && from !== "status@broadcast" && !from.endsWith("@broadcast")) {
    return from;
  }
  return null;
}

function makeBlockCommand(name, action, doneText, desc) {
  return {
    name,
    desc,
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const target = resolveBlockTarget(msg, args, from);
      if (!target) {
        return sock.sendMessage(from, {
          text:
            `Indique qui ${action === "block" ? "bloquer" : "débloquer"} :\n` +
            `- .${name} 22501234567\n` +
            `- .${name} @mention\n` +
            `- réponds à un de ses messages avec *.${name}*\n` +
            `- ou tape *.${name}* directement dans sa discussion privée.`,
        });
      }
      const targetNumber = target.split("@")[0].split(":")[0];
      const selfNumber = (sock.user?.id || "").split("@")[0].split(":")[0];
      if (targetNumber === OWNER_NUMBER || (selfNumber && targetNumber === selfNumber)) {
        return sock.sendMessage(from, { text: "❌ Tu ne peux pas te bloquer toi-même." });
      }
      try {
        await sock.updateBlockStatus(target, action);
        await sock.sendMessage(from, { text: `${doneText} (+${targetNumber})` });
      } catch (err) {
        console.error(`Erreur .${name} :`, err);
        await sock.sendMessage(from, {
          text: `❌ Impossible de ${action === "block" ? "bloquer" : "débloquer"} ce contact.`,
        });
      }
    },
  };
}

// ------------------------------------------------------------------

const commands = [
  {
    name: "pp",
    desc: "Change la photo de profil du bot (réponds à une image) - propriétaire",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, quoted }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      if (!quoted || !quoted.imageMessage) {
        return sock.sendMessage(from, { text: "*Réponds à une image.*" });
      }
      try {
        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        await sock.updateProfilePicture(sock.user.id, buffer);
        await sock.sendMessage(from, { text: "_Photo de profil mise à jour._" });
      } catch (err) {
        console.error("Erreur .pp :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible de mettre à jour la photo de profil.",
        });
      }
    },
  },
  {
    name: "setstatus",
    desc: "Envoie le média/texte cité en story - à tous les contacts connus par défaut, ou à des numéros précis - propriétaire",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args, quoted }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const jids = parseJidList(args.join(" ")).length
        ? parseJidList(args.join(" "))
        : getKnownContacts();
      if (jids.length === 0) {
        return sock.sendMessage(from, {
          text:
            "Réponds à une image, une vidéo ou un texte avec *.setstatus* pour l'envoyer en story " +
            "à tous les contacts que le bot connaît déjà.\n\n" +
            "Tu peux aussi viser des numéros précis : .setstatus 22501234567,22507654321\n\n" +
            "⚠️ Le bot ne connaît encore aucun contact (il les apprend au fil des messages reçus). " +
            "Attends qu'il ait reçu quelques messages, ou donne des numéros directement.",
        });
      }
      if (!quoted) return sock.sendMessage(from, { text: "> Réponds à un message (image, vidéo ou texte)." });
      const mediaType = getQuotedMediaType(quoted);
      if (!mediaType) {
        return sock.sendMessage(from, { text: "> Réponds à une image, une vidéo, ou un texte." });
      }
      try {
        const content = await buildStatusContent(sock, quoted, mediaType);
        await sock.sendMessage("status@broadcast", content, { statusJidList: jids, broadcast: true });
        await sock.sendMessage(from, { text: `✅ Statut envoyé à ${jids.length} contact(s).` });
      } catch (err) {
        console.error("Erreur .setstatus :", err);
        await sock.sendMessage(from, { text: "❌ Impossible d'envoyer le statut." });
      }
    },
  },
  {
    name: "scstatus",
    desc: "Programme l'envoi d'une story (statut) - propriétaire",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber, args, quoted }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, { text: "❌ Réservé au propriétaire du bot." });
      }
      const raw = args.join(" ");
      const trimmed = raw.trim();

      if (trimmed === "list") {
        const list = loadSchedules();
        if (list.length === 0) return sock.sendMessage(from, { text: "Aucun statut programmé." });
        const text = list
          .map(
            (e) =>
              `🆔 ${e.id}\n⏰ ${new Date(e.runAt).toLocaleString("fr-FR")}\n👥 ${e.jids.length} destinataire(s)`
          )
          .join("\n\n");
        return sock.sendMessage(from, { text: `📋 Statuts programmés :\n\n${text}` });
      }

      if (trimmed.startsWith("delete")) {
        const target = trimmed.replace(/^delete/i, "").trim();
        if (target === "all") {
          loadSchedules().forEach((e) => removeSchedule(e.id));
          return sock.sendMessage(from, { text: "🗑️ Tous les statuts programmés ont été supprimés." });
        }
        const found = loadSchedules().find((e) => e.id === target);
        if (!found) {
          return sock.sendMessage(from, { text: "Identifiant introuvable. Utilise .scstatus list pour voir les IDs." });
        }
        removeSchedule(target);
        return sock.sendMessage(from, { text: "🗑️ Statut programmé supprimé." });
      }

      const [jidsPart, timePart] = raw.split("|").map((s) => (s || "").trim());
      const schedule = parseScheduleTime(timePart);
      const jids = parseJidList(jidsPart).length ? parseJidList(jidsPart) : getKnownContacts();
      if (jids.length === 0 || !schedule) {
        return sock.sendMessage(from, {
          text:
            "Exemple :\n" +
            "- .scstatus |30-22 (envoie à tous les contacts connus, tous les jours à 22h30)\n" +
            "- .scstatus 22501234567,22507654321|30-22 (numéros précis)\n" +
            "- .scstatus |0-22-15 (le 15 du mois à 22h00, tous les contacts connus)\n" +
            "- .scstatus |0-22-15-12 (le 15 décembre à 22h00)\n" +
            "- .scstatus list\n" +
            "- .scstatus delete <id>  ou  .scstatus delete all\n\n" +
            (jids.length === 0
              ? "⚠️ Le bot ne connaît encore aucun contact (il les apprend au fil des messages reçus)."
              : ""),
        });
      }
      if (!quoted) return sock.sendMessage(from, { text: "> Réponds à un message (image, vidéo ou texte)." });
      const mediaType = getQuotedMediaType(quoted);
      if (!mediaType) {
        return sock.sendMessage(from, { text: "> Réponds à une image, une vidéo, ou un texte." });
      }

      try {
        const id = crypto.randomBytes(4).toString("hex");
        const runAt = computeNextRun(schedule).toISOString();
        const entry = { id, runAt, jids, mediaType };

        if (mediaType === "text") {
          entry.text = quoted.conversation || quoted.extendedTextMessage?.text || "";
        } else {
          const buffer = await downloadMediaMessage(
            { message: quoted },
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
          fs.mkdirSync(SCHEDULE_MEDIA_DIR, { recursive: true });
          const mediaPath = path.join(SCHEDULE_MEDIA_DIR, id);
          fs.writeFileSync(mediaPath, buffer);
          entry.mediaPath = mediaPath;
          entry.caption =
            (mediaType === "image" ? quoted.imageMessage?.caption : quoted.videoMessage?.caption) || "";
        }

        const list = loadSchedules();
        list.push(entry);
        saveSchedules(list);
        scheduleEntry(sock, entry);

        await sock.sendMessage(from, {
          text: `✅ Statut programmé pour le ${new Date(entry.runAt).toLocaleString(
            "fr-FR"
          )} (id: ${id}), ${jids.length} destinataire(s).`,
        });
      } catch (err) {
        console.error("Erreur .scstatus :", err);
        await sock.sendMessage(from, { text: "❌ Impossible de programmer ce statut." });
      }
    },
  },
  makeBlockCommand(
    "block",
    "block",
    "🔴 Contact bloqué.",
    "Bloque un contact (numéro, mention, message cité, ou chat privé en cours) - propriétaire"
  ),
  makeBlockCommand(
    "unblock",
    "unblock",
    "🟢 Contact débloqué.",
    "Débloque un contact (numéro, mention, message cité, ou chat privé en cours) - propriétaire"
  ),
];

module.exports = commands;
module.exports.initScheduledStatuses = initScheduledStatuses;
