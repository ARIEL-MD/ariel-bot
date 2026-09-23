// ============ BIBLE (verset par référence, Louis Segond 1910) ============
// .bible <référence>  (alias : .verset, .lsg)
// Exemples :
//   .bible Jean 3:16
//   .bible Genèse 1:1-3
//   .bible 1 Corinthiens 13:4-7
const axios = require("axios");

const API_BASE = "https://query.getbible.net/v2/ls1910/";

// L'API getbible accepte en théorie les noms de livres propres à chaque
// traduction (donc les noms français pour ls1910), mais en pratique c'est
// peu fiable : beaucoup de requêtes avec "Jean", "Genèse", etc. renvoient
// "aucun verset trouvé" alors que la référence est correcte. Par contre,
// les noms anglais (KJV) fonctionnent de façon fiable avec TOUTES les
// traductions, y compris ls1910 (documenté par getbible.net lui-même). On
// convertit donc silencieusement le nom du livre français vers son
// équivalent anglais avant d'interroger l'API.
const FRENCH_TO_ENGLISH_BOOKS = {
  "genese": "Genesis",
  "exode": "Exodus",
  "levitique": "Leviticus",
  "nombres": "Numbers",
  "deuteronome": "Deuteronomy",
  "josue": "Joshua",
  "juges": "Judges",
  "ruth": "Ruth",
  "1 samuel": "1 Samuel",
  "2 samuel": "2 Samuel",
  "1 rois": "1 Kings",
  "2 rois": "2 Kings",
  "1 chroniques": "1 Chronicles",
  "2 chroniques": "2 Chronicles",
  "esdras": "Ezra",
  "nehemie": "Nehemiah",
  "esther": "Esther",
  "job": "Job",
  "psaumes": "Psalms",
  "psaume": "Psalms",
  "proverbes": "Proverbs",
  "ecclesiaste": "Ecclesiastes",
  "cantique des cantiques": "Song of Solomon",
  "esaie": "Isaiah",
  "jeremie": "Jeremiah",
  "lamentations": "Lamentations",
  "ezechiel": "Ezekiel",
  "daniel": "Daniel",
  "osee": "Hosea",
  "joel": "Joel",
  "amos": "Amos",
  "abdias": "Obadiah",
  "jonas": "Jonah",
  "michee": "Micah",
  "nahum": "Nahum",
  "habacuc": "Habakkuk",
  "sophonie": "Zephaniah",
  "aggee": "Haggai",
  "zacharie": "Zechariah",
  "malachie": "Malachi",
  "matthieu": "Matthew",
  "marc": "Mark",
  "luc": "Luke",
  "jean": "John",
  "actes": "Acts",
  "romains": "Romans",
  "1 corinthiens": "1 Corinthians",
  "2 corinthiens": "2 Corinthians",
  "galates": "Galatians",
  "ephesiens": "Ephesians",
  "philippiens": "Philippians",
  "colossiens": "Colossians",
  "1 thessaloniciens": "1 Thessalonians",
  "2 thessaloniciens": "2 Thessalonians",
  "1 timothee": "1 Timothy",
  "2 timothee": "2 Timothy",
  "tite": "Titus",
  "philemon": "Philemon",
  "hebreux": "Hebrews",
  "jacques": "James",
  "1 pierre": "1 Peter",
  "2 pierre": "2 Peter",
  "1 jean": "1 John",
  "2 jean": "2 John",
  "3 jean": "3 John",
  "jude": "Jude",
  "apocalypse": "Revelation",
};

// Enlève les accents et met en minuscule, pour comparer sans se soucier de
// la casse ni des accents (ex: "Ésaïe" et "esaie" doivent matcher).
function normalizeBookName(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Sépare une référence du type "Jean 3:16" ou "1 Corinthiens 13:4-7" en
// nom de livre + chapitre/verset, traduit le nom du livre en anglais s'il
// est reconnu, puis reconstruit la référence. Si le format n'est pas
// reconnu, on renvoie la référence telle quelle (sans planter).
function translateReference(reference) {
  const match = reference.match(/^(.+?)\s+(\d+(?::\d+(?:-\d+)?)?)$/);
  if (!match) return reference;

  const [, bookPart, versePart] = match;
  const normalized = normalizeBookName(bookPart);
  const english = FRENCH_TO_ENGLISH_BOOKS[normalized];

  return english ? `${english} ${versePart}` : reference;
}

const commands = [
  {
    name: "bible",
    desc: "Affiche un verset (Louis Segond) : .bible <référence>\nEx : .bible Jean 3:16",
    category: "Autre",
    run: async (sock, msg, { from, args }) => {
      const reference = args.join(" ").trim();

      if (!reference) {
        return sock.sendMessage(from, {
          text:
            "Utilisation : .bible <référence>\n" +
            "Exemples :\n" +
            "• .bible Jean 3:16\n" +
            "• .bible Genèse 1:1-3\n" +
            "• .bible 1 Corinthiens 13:4-7",
        });
      }

      try {
        const queryReference = translateReference(reference);
        const url = `${API_BASE}${encodeURIComponent(queryReference)}`;
        const { data } = await axios.get(url, { timeout: 15000 });

        // L'API getbible renvoie directement un objet {"ls1910_43_3": {...}, ...}
        // (une clé par groupe traduction_livre_chapitre), SANS enveloppe
        // "result" — contrairement à ce qu'on pensait ici avant. On garde
        // quand même une compat "au cas où" avec un éventuel futur format
        // { result: {...} }, mais on lit d'abord la racine de l'objet.
        const container = data && data.result ? data.result : data;
        const groups = container && typeof container === "object" ? Object.values(container) : [];

        if (!groups.length) {
          return sock.sendMessage(from, {
            text: `❌ Aucun verset trouvé pour : ${reference}`,
          });
        }

        let message = "";

        for (const group of groups) {
          const verses = group.verses || [];
          if (!verses.length) continue;

          message += `📖 *${group.book_name} ${group.chapter}* (Louis Segond)\n\n`;
          for (const v of verses) {
            message += `*${v.verse}.* ${v.text.trim()}\n`;
          }
          message += "\n";
        }

        if (!message.trim()) {
          return sock.sendMessage(from, {
            text: `❌ Aucun verset trouvé pour : ${reference}`,
          });
        }

        await sock.sendMessage(from, { text: message.trim() });
      } catch (err) {
        console.error("Erreur .bible :", err.message);
        await sock.sendMessage(from, {
          text: "❌ Impossible de récupérer ce verset. Vérifie la référence (ex : Jean 3:16).",
        });
      }
    },
  },
];

// Alias .verset et .lsg -> même commande que .bible
commands.push({ ...commands[0], name: "verset" });
commands.push({ ...commands[0], name: "lsg" });

module.exports = commands;
