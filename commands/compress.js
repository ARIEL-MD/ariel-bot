// ============ COMPRESSION MEDIA (.compress) ============
// Réduit le poids d'une image ou d'une vidéo trop lourde.
// Utilisation : réponds à une image ou une vidéo avec .compress
//   .compress            -> qualité par défaut (image : 50, vidéo : réglages fixes)
//   .compress 30         -> qualité 1-100, pour une image uniquement

const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const ffmpegPath = require("ffmpeg-static");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { Jimp } = require("jimp");

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

async function compressImage(buffer, quality) {
  const image = await Jimp.fromBuffer(buffer);

  // Limite raisonnable : évite un traitement trop long/lourd sur une image
  // envoyée en "document" (donc potentiellement énorme, contrairement aux
  // photos classiques déjà redimensionnées par WhatsApp).
  const MAX_SIDE = 1920;
  if (image.width > MAX_SIDE || image.height > MAX_SIDE) {
    image.scaleToFit({ w: MAX_SIDE, h: MAX_SIDE });
  }

  return image.getBuffer("image/jpeg", { quality });
}

async function compressVideo(buffer) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputFile = path.join(os.tmpdir(), `ariel_cmp_in_${id}.mp4`);
  const outputFile = path.join(os.tmpdir(), `ariel_cmp_out_${id}.mp4`);
  try {
    fs.writeFileSync(inputFile, buffer);
    // CRF élevé + preset rapide + résolution plafonnée à 1280px de large :
    // réduit fortement le poids sans transcodage trop long. -movflags
    // faststart permet à WhatsApp de lire la vidéo sans devoir tout
    // télécharger d'abord.
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", inputFile,
      "-vf", "scale='min(1280,iw)':-2",
      "-c:v", "libx264",
      "-crf", "30",
      "-preset", "veryfast",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
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
    name: "compress",
    desc: "Compresse une image/vidéo trop lourde (répondre au média) : .compress [qualité 1-100, image uniquement]",
    category: "Utilitaires",
    run: async (sock, msg, { from, args, quoted }) => {
      if (!quoted || !(quoted.imageMessage || quoted.videoMessage)) {
        return sock.sendMessage(from, {
          text:
            "Réponds à une image ou une vidéo avec .compress\n" +
            "Ex : .compress\n" +
            "Ex (image) : .compress 30  → qualité plus basse = fichier plus léger",
        });
      }

      const isVideo = !!quoted.videoMessage;

      let quality = parseInt(args[0], 10);
      if (!Number.isFinite(quality) || quality < 1 || quality > 100) quality = 50;

      try {
        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        const originalSize = buffer.length;

        const outBuffer = isVideo
          ? await compressVideo(buffer)
          : await compressImage(buffer, quality);

        const savedPct = originalSize
          ? Math.max(0, Math.round((1 - outBuffer.length / originalSize) * 100))
          : 0;

        const caption =
          `✅ Compressé : ${humanSize(originalSize)} → ${humanSize(outBuffer.length)}` +
          (savedPct > 0 ? ` (-${savedPct}%)` : "");

        if (isVideo) {
          await sock.sendMessage(from, { video: outBuffer, caption, mimetype: "video/mp4" });
        } else {
          await sock.sendMessage(from, { image: outBuffer, caption, mimetype: "image/jpeg" });
        }
      } catch (err) {
        console.error("Erreur .compress :", err);
        await sock.sendMessage(from, {
          text: "❌ Impossible de compresser ce média. Réessaie avec un autre fichier.",
        });
      }
    },
  },
];

module.exports = commands;
