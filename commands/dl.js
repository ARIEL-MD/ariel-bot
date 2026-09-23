// ============ TÉLÉCHARGEMENT VIDÉO VIA API RAPIDAPI (ariel-api) ============
// .dl <lien>
//
// ⚠️ À PERSONNALISER : remplace RAPIDAPI_KEY par ta vraie clé RapidAPI,
// et vérifie le format exact de la réponse JSON (voir TODO plus bas).
// =============================================================================
const axios = require("axios");

// TODO 1 : mets ici ta clé RapidAPI (onglet "Endpoints" de ton API sur
// rapidapi.com, elle apparaît dans le code exemple sous "X-RapidAPI-Key").
const RAPIDAPI_KEY = "TA_CLE_RAPIDAPI_ICI";
const RAPIDAPI_HOST = "ariel-api.p.rapidapi.com";

const commands = [
  {
    name: "dl", // change le nom si tu veux (.video2, .save, etc.)
    desc: "Télécharge une vidéo via l'API Ariel : .dl <lien>",
    category: "Téléchargements",
    run: async (sock, msg, { from, args }) => {
      const link = args.join(" ").trim();

      if (!link) {
        return sock.sendMessage(from, {
          text: "Utilisation : .dl <lien>\nExemple : .dl https://ariel/video-1egioz10/xxxx",
        });
      }

      if (!/^https?:\/\//i.test(link)) {
        return sock.sendMessage(from, {
          text: "❌ Merci d'envoyer un lien valide (commençant par http:// ou https://).",
        });
      }

      try {
        await sock.sendMessage(from, { text: "⏳ Téléchargement en cours..." });

        // ----- Étape 1 : appel à l'API (POST, comme dans ton exemple) -----
        const { data } = await axios.request({
          method: "POST",
          url: "https://ariel-api.p.rapidapi.com/batch-download",
          headers: {
            "x-rapidapi-host": RAPIDAPI_HOST,
            "x-rapidapi-key": RAPIDAPI_KEY,
            "Content-Type": "application/json",
          },
          data: {
            video_links: [link], // l'API accepte une liste, on envoie juste ton lien
          },
          timeout: 30000,
        });

        // ----- Étape 2 : extraire l'URL de la vidéo dans le JSON -----
        // TODO 2 — IMPORTANT : je ne connais pas le format exact renvoyé par
        // "batch-download" (l'exemple que tu as donné n'affiche que
        // console.log(response.data) sans montrer le résultat).
        // Fais UNE fois un test isolé (node test.js avec juste ce code + un
        // console.log(JSON.stringify(data, null, 2))) pour voir la vraie
        // structure, puis ajuste la ligne ci-dessous. Comme c'est un batch,
        // la réponse est probablement un TABLEAU (un résultat par lien) :
        //   [{ url: "https://...", status: "ok" }, ...]  -> data[0].url
        //   { results: [{ download_url: "..." }] }        -> data.results[0].download_url
        const videoUrl = data?.[0]?.url || data?.results?.[0]?.download_url; // <-- AJUSTE ICI

        if (!videoUrl) {
          console.error("Réponse API inattendue :", JSON.stringify(data).slice(0, 500));
          return sock.sendMessage(from, {
            text: "❌ L'API n'a pas renvoyé de lien vidéo exploitable (vérifie le format du JSON dans le code, voir console).",
          });
        }

        // ----- Étape 3 : télécharger le fichier vidéo lui-même -----
        const { data: videoBuffer } = await axios.get(videoUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
        });

        // ----- Étape 4 : envoyer la vidéo sur WhatsApp -----
        await sock.sendMessage(from, {
          video: Buffer.from(videoBuffer),
          caption: "✅ Voici ta vidéo !",
        });
      } catch (err) {
        console.error("Erreur .dl :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Impossible de télécharger cette vidéo (clé API invalide, lien incorrect, ou API indisponible).",
        });
      }
    },
  },
];

module.exports = commands;
