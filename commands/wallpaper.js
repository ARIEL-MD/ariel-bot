// ============ WALLPAPER (recherche d'images en fond d'écran, via Pexels) ============
const axios = require("axios");

// TODO : mets ta clé Pexels ici (gratuite sur https://www.pexels.com/api/)
const PEXELS_API_KEY = "TA_CLE_PEXELS_ICI";

// Génère `count` index aléatoires uniques entre 0 et max (exclu)
function getRandomIndexes(max, count) {
  const indexes = [];
  while (indexes.length < count && indexes.length < max) {
    const randomIndex = Math.floor(Math.random() * max);
    if (!indexes.includes(randomIndex)) {
      indexes.push(randomIndex);
    }
  }
  return indexes;
}

const commands = [
  {
    name: "wall",
    desc: "Cherche des fonds d'écran : .wall <recherche> (alias : .wallpaper)",
    category: "Images & Stickers",
    run: async (sock, msg, { from, args }) => {
      const text = args.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .wall <texte>\nExemple : .wall Messi",
        });
      }

      try {
        const { data } = await axios.get("https://api.pexels.com/v1/search", {
          params: { query: text, per_page: 15, orientation: "portrait" },
          headers: { Authorization: PEXELS_API_KEY },
          timeout: 15000,
        });

        const photos = Array.isArray(data && data.photos) ? data.photos : [];
        const imageUrls = photos.map((p) => p.src && p.src.portrait).filter(Boolean);

        if (!imageUrls.length) {
          return sock.sendMessage(from, { text: `❌ Aucun fond d'écran trouvé pour : ${text}` });
        }

        const randomIndexes = getRandomIndexes(imageUrls.length, 2);
        const randomImages = randomIndexes.map((i) => imageUrls[i]);

        for (const imageUrl of randomImages) {
          const { data: imgBuffer } = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
          await sock.sendMessage(from, {
            image: Buffer.from(imgBuffer),
            caption: `*${text}*`,
          });
        }
      } catch (err) {
        console.error("Erreur .wall :", err.message);
        await sock.sendMessage(from, { text: "❌ Impossible de récupérer les fonds d'écran." });
      }
    },
  },
];

// Alias .wallpaper -> même commande que .wall
commands.push({ ...commands[0], name: "wallpaper" });

module.exports = commands;
