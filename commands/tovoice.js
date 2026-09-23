// ============ TEXTE VERS AUDIO (.tovoice) ============
// .tovoice <texte>                -> note vocale en français (voix neurale)
// .tovoice homme <texte>          -> voix française masculine (Henri)
// .tovoice femme <texte>          -> voix française féminine (Denise)
// .tovoice <code langue> <texte>  -> ex : .tovoice en Hello everyone
//
// Utilise les voix neurales "Microsoft Edge Read Aloud" (via le module
// edge-tts-node), gratuites et sans clé API, exactement les mêmes voix que
// la fonction "Lire à voix haute" de Microsoft Edge. Elles sonnent
// nettement plus humaines et naturelles que l'ancien moteur (l'API
// translate_tts non-officielle de Google Traduction, robotique et
// hachée car synthétisée par petits morceaux de ~200 caractères recollés).
// Ici, tout le texte est envoyé en une seule requête (prosodie continue,
// pas de coupures audibles entre segments).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");
const { EdgeTTS } = require("edge-tts-universal");

const execFileAsync = promisify(execFile);
const MAX_TEXT_LENGTH = 2000;

// Une voix neurale par défaut par langue (choisies parmi les voix "Neural"
// les plus naturelles disponibles sur le service Edge Read Aloud).
const LANG_VOICES = {
  fr: "fr-FR-DeniseNeural",
  en: "en-US-AriaNeural",
  es: "es-ES-ElviraNeural",
  pt: "pt-BR-FranciscaNeural",
  de: "de-DE-KatjaNeural",
  it: "it-IT-ElsaNeural",
  ar: "ar-SA-ZariyahNeural",
  nl: "nl-NL-ColetteNeural",
  tr: "tr-TR-EmelNeural",
  ru: "ru-RU-SvetlanaNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ja: "ja-JP-NanamiNeural",
  hi: "hi-IN-SwaraNeural",
};

// Raccourcis "homme"/"femme" pour changer juste le genre de la voix
// française par défaut, sans avoir à retenir un nom de voix précis.
const GENDER_VOICES_FR = {
  homme: "fr-FR-HenriNeural",
  h: "fr-FR-HenriNeural",
  femme: "fr-FR-DeniseNeural",
  f: "fr-FR-DeniseNeural",
};

const DEFAULT_VOICE = LANG_VOICES.fr;

// Synthétise le texte en un seul appel et renvoie directement un buffer MP3.
// edge-tts-universal gère lui-même l'échappement XML/SSML du texte fourni
// (comme la lib Python d'origine dont il est un portage), donc on lui passe
// le texte brut sans l'échapper nous-mêmes.
async function textToSpeech(text, voice) {
  const tts = new EdgeTTS(text, voice);
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

// Convertit un buffer MP3 en OGG/Opus (format attendu par WhatsApp pour
// que les notes vocales soient lisibles avec ptt: true). Sans cette étape,
// certains clients WhatsApp reçoivent un fichier illisible.
async function convertMp3ToOggOpus(mp3Buffer) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputFile = path.join(os.tmpdir(), `ariel_tts_in_${id}.mp3`);
  const outputFile = path.join(os.tmpdir(), `ariel_tts_out_${id}.ogg`);
  try {
    fs.writeFileSync(inputFile, mp3Buffer);
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputFile,
      "-c:a", "libopus",
      "-ar", "48000",
      "-ac", "1",
      "-b:a", "64k",
      "-vn",
      "-f", "ogg",
      outputFile,
    ]);
    return fs.readFileSync(outputFile);
  } finally {
    fs.promises.unlink(inputFile).catch(() => {});
    fs.promises.unlink(outputFile).catch(() => {});
  }
}

const commands = [
  {
    name: "tovoice",
    desc:
      "Convertit un texte en note vocale (voix neurale, naturelle) :\n" +
      ".tovoice <texte>\n" +
      ".tovoice homme <texte> / .tovoice femme <texte>\n" +
      ".tovoice <code langue> <texte>\n" +
      "Ex : .tovoice Bonjour tout le monde\n" +
      "Ex : .tovoice homme Bonjour tout le monde\n" +
      "Ex : .tovoice en Hello everyone\n" +
      `Langues dispo : ${Object.keys(LANG_VOICES).join(", ")}`,
    category: "Utilitaires",
    run: async (sock, msg, { from, args }) => {
      if (!args.length) {
        return sock.sendMessage(from, {
          text:
            "Utilisation : .tovoice [homme|femme|code langue] <texte>\n" +
            "Ex : .tovoice Bonjour tout le monde\n" +
            "Ex : .tovoice homme Bonjour tout le monde\n" +
            "Ex : .tovoice en Hello everyone\n" +
            `Langues dispo : ${Object.keys(LANG_VOICES).join(", ")}`,
        });
      }

      // Détecte un préfixe "homme"/"femme" ou un code langue reconnu en
      // premier mot (uniquement s'il reste du texte après). Sinon, tout le
      // message est le texte, voix française par défaut.
      let voice = DEFAULT_VOICE;
      let words = args;
      const first = args[0].toLowerCase();

      if (args.length > 1 && GENDER_VOICES_FR[first]) {
        voice = GENDER_VOICES_FR[first];
        words = args.slice(1);
      } else if (args.length > 1 && LANG_VOICES[first]) {
        voice = LANG_VOICES[first];
        words = args.slice(1);
      }

      const text = words.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, { text: "❌ Merci de préciser un texte à convertir." });
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return sock.sendMessage(from, {
          text: `❌ Texte trop long (max ${MAX_TEXT_LENGTH} caractères).`,
        });
      }

      try {
        const mp3 = await textToSpeech(text, voice);
        const ogg = await convertMp3ToOggOpus(mp3);
        await sock.sendMessage(from, { audio: ogg, mimetype: "audio/ogg; codecs=opus", ptt: true });
      } catch (err) {
        console.error("Erreur .tovoice :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Impossible de générer l'audio. Vérifie le code langue (ex : fr, en, es) et réessaie.",
        });
      }
    },
  },
];

module.exports = commands;
