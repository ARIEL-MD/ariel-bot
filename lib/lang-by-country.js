// ============ DÉTECTION AUTOMATIQUE DE LA LANGUE PAR INDICATIF PAYS ============
// But : éviter d'avoir à maintenir à la main une liste "numéro -> langue"
// (type .setlang). On déduit la langue probable d'un contact directement à
// partir de l'indicatif téléphonique international de son JID WhatsApp
// (ex : 225... -> Côte d'Ivoire -> français, 234... -> Nigeria -> anglais).
//
// C'est une heuristique (un numéro ne garantit pas la langue parlée), mais
// ça couvre correctement l'immense majorité des cas pour une diffusion, sans
// aucune configuration manuelle contact par contact.
//
// Les indicatifs sont triés du plus long au plus court avant le test, pour
// que par exemple "1809" (République Dominicaine, espagnol) soit reconnu
// avant le simple "1" (zone NANP, anglais).

// Indicatif -> code langue ISO (fr, en, ...)
const DIAL_CODE_LANG = {
  // ----- Francophonie -----
  "33": "fr", // France
  "32": "fr", // Belgique
  "41": "fr", // Suisse
  "225": "fr", // Côte d'Ivoire
  "221": "fr", // Sénégal
  "223": "fr", // Mali
  "224": "fr", // Guinée
  "226": "fr", // Burkina Faso
  "227": "fr", // Niger
  "228": "fr", // Togo
  "229": "fr", // Bénin
  "235": "fr", // Tchad
  "236": "fr", // République Centrafricaine
  "237": "fr", // Cameroun
  "241": "fr", // Gabon
  "242": "fr", // Congo-Brazzaville
  "243": "fr", // RD Congo
  "253": "fr", // Djibouti
  "261": "fr", // Madagascar
  "262": "fr", // Réunion / Mayotte
  "269": "fr", // Comores
  "590": "fr", // Guadeloupe
  "594": "fr", // Guyane
  "596": "fr", // Martinique
  "687": "fr", // Nouvelle-Calédonie
  "689": "fr", // Polynésie française
  "212": "fr", // Maroc
  "213": "fr", // Algérie
  "216": "fr", // Tunisie
  "222": "fr", // Mauritanie

  // ----- Anglophonie -----
  "1": "en", // États-Unis / Canada
  "44": "en", // Royaume-Uni
  "234": "en", // Nigeria
  "233": "en", // Ghana
  "254": "en", // Kenya
  "255": "en", // Tanzanie
  "256": "en", // Ouganda
  "260": "en", // Zambie
  "263": "en", // Zimbabwe
  "27": "en", // Afrique du Sud
  "232": "en", // Sierra Leone
  "220": "en", // Gambie
  "231": "en", // Liberia
  "265": "en", // Malawi
  "267": "en", // Botswana
  "268": "en", // Eswatini
  "61": "en", // Australie
  "64": "en", // Nouvelle-Zélande
  "353": "en", // Irlande
  "91": "en", // Inde

  // ----- Autres langues courantes (bonus, faciles à étendre) -----
  "34": "es", // Espagne
  "351": "pt", // Portugal
  "244": "pt", // Angola
  "258": "pt", // Mozambique
  "49": "de", // Allemagne
};

// Liste des indicatifs, du plus long au plus court, pour tester les préfixes
// les plus spécifiques en premier (ex: éviter qu'un indicatif à 3 chiffres
// soit masqué par un indicatif à 1 chiffre qui le préfixe).
const SORTED_CODES = Object.keys(DIAL_CODE_LANG).sort((a, b) => b.length - a.length);

// Langue à utiliser quand l'indicatif n'est pas reconnu : on ne traduit pas
// (le message part tel quel), plutôt que de deviner au hasard.
const DEFAULT_LANG = null;

// jid : "2250700000000@s.whatsapp.net" -> "fr" | "en" | ... | null
function detectLangFromJid(jid) {
  if (typeof jid !== "string") return DEFAULT_LANG;
  const digits = jid.replace(/@.*/, "").replace(/[^0-9]/g, "");
  if (!digits) return DEFAULT_LANG;
  for (const code of SORTED_CODES) {
    if (digits.startsWith(code)) return DIAL_CODE_LANG[code];
  }
  return DEFAULT_LANG;
}

module.exports = { detectLangFromJid, DIAL_CODE_LANG };
