// ============ TEXTE ÉLÉGANT (.style / .forme) ============
// .style <texte>  : renvoie le texte dans plusieurs polices Unicode
//                   stylées (gras, italique, cursif, gothique, bulle...).
// .forme <forme> <texte> : dessine le mot en forme de cœur, fleur,
//                   étoile, arbre ou losange, en répétant ses lettres.
//
// Tout est calculé (pas d'API externe), donc instantané et sans limite
// d'utilisation.

const MAX_LEN = 18; // au-delà, la forme devient illisible sur mobile

// ------------------- Polices Unicode stylées -------------------

const STYLES = {
  gras: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italique: { upper: 0x1d434, lower: 0x1d44e },
  cursif: {
    upper: 0x1d49c,
    lower: 0x1d4b6,
    upperExceptions: { B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b },
    lowerExceptions: { e: 0x212f, g: 0x210a, o: 0x2134 },
  },
  gothique: {
    upper: 0x1d504,
    lower: 0x1d51e,
    upperExceptions: { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 },
  },
  bulle: {
    upper: 0x24b6,
    lower: 0x24d0,
    digitFn: (d) => (d === "0" ? 0x24ea : 0x2460 + (Number(d) - 1)),
  },
  large: { upper: 0xff21, lower: 0xff41, digit: 0xff10, spaceChar: "\u3000" },
};

const STYLE_LABELS = {
  gras: "Gras",
  italique: "Italique",
  cursif: "Cursif",
  gothique: "Gothique",
  bulle: "Bulle",
  large: "Pleine largeur",
};

function applyStyle(text, styleName) {
  const s = STYLES[styleName];
  if (!s) return text;
  let out = "";
  for (const ch of text) {
    if (ch >= "A" && ch <= "Z") {
      if (s.upperExceptions && s.upperExceptions[ch] !== undefined) out += String.fromCodePoint(s.upperExceptions[ch]);
      else if (s.upper !== undefined) out += String.fromCodePoint(s.upper + (ch.charCodeAt(0) - 65));
      else out += ch;
    } else if (ch >= "a" && ch <= "z") {
      if (s.lowerExceptions && s.lowerExceptions[ch] !== undefined) out += String.fromCodePoint(s.lowerExceptions[ch]);
      else if (s.lower !== undefined) out += String.fromCodePoint(s.lower + (ch.charCodeAt(0) - 97));
      else out += ch;
    } else if (ch >= "0" && ch <= "9") {
      if (s.digitFn) out += String.fromCodePoint(s.digitFn(ch));
      else if (s.digit !== undefined) out += String.fromCodePoint(s.digit + (ch.charCodeAt(0) - 48));
      else out += ch;
    } else if (ch === " " && s.spaceChar) {
      out += s.spaceChar;
    } else {
      out += ch;
    }
  }
  return out;
}

// ------------------- Formes ASCII (cœur, fleur, étoile...) -------------------

// Construit une grille rows x cols de booléens à partir d'un test
// mathématique predicate(x, y), avec x,y dans [xmin,xmax] x [ymin,ymax].
function buildGrid(rows, cols, xmin, xmax, ymin, ymax, predicate) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const y = ymax - ((ymax - ymin) * r) / (rows - 1);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const x = xmin + ((xmax - xmin) * c) / (cols - 1);
      row.push(predicate(x, y));
    }
    grid.push(row);
  }
  return grid;
}

// Remplit les cases "pleines" de la grille avec les lettres du mot
// (répétées en boucle), en ignorant les espaces/ponctuation pour le
// cycle. Rogne les lignes vides en haut/bas pour un rendu compact.
function fillGridWithWord(grid, word) {
  const letters = (word.match(/[A-Za-z0-9À-ÖØ-öø-ÿ]/g) || []).filter(Boolean);
  const chars = letters.length ? letters : word.split("").filter(Boolean);
  const fallback = chars.length ? chars : ["✦"];
  let idx = 0;
  const rows = [];
  for (const gridRow of grid) {
    let line = "";
    let any = false;
    for (const filled of gridRow) {
      if (filled) {
        line += fallback[idx % fallback.length];
        idx++;
        any = true;
      } else {
        line += " ";
      }
    }
    rows.push({ line: line.replace(/\s+$/, ""), any });
  }
  while (rows.length && !rows[0].any) rows.shift();
  while (rows.length && !rows[rows.length - 1].any) rows.pop();
  return rows.map((r) => r.line).join("\n");
}

function heartPredicate(x, y) {
  return Math.pow(x * x + y * y - 1, 3) - x * x * Math.pow(y, 3) <= 0;
}

function starVertices(points, outerR, innerR) {
  const verts = [];
  const step = Math.PI / points;
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = Math.PI / 2 + i * step;
    verts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  return verts;
}
function pointInPolygon(x, y, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i][0],
      yi = verts[i][1];
    const xj = verts[j][0],
      yj = verts[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
const STAR_VERTICES = starVertices(5, 1, 0.42);

function flowerPredicate(x, y) {
  const rc = 0.28,
    d = 0.62,
    rp = 0.3,
    n = 5;
  if (Math.hypot(x, y) <= rc) return true;
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n + Math.PI / 2;
    if (Math.hypot(x - d * Math.cos(angle), y - d * Math.sin(angle)) <= rp) return true;
  }
  return false;
}

function treePredicate(x, y) {
  if (y >= -0.3) return Math.abs(x) <= (1 - y) * 0.5;
  return Math.abs(x) <= 0.15 && y >= -1;
}

function diamondPredicate(x, y) {
  return Math.abs(x) + Math.abs(y) <= 1;
}

function circlePredicate(x, y) {
  return x * x + y * y <= 1;
}

function trianglePredicate(x, y) {
  return Math.abs(x) <= (1 - y) / 2;
}

function squarePredicate(x, y) {
  return Math.abs(x) <= 0.95 && Math.abs(y) <= 0.95;
}

function crossPredicate(x, y) {
  return Math.abs(x) <= 0.28 || Math.abs(y) <= 0.28;
}

function moonPredicate(x, y) {
  const outer = x * x + y * y <= 1;
  const bite = Math.pow(x - 0.45, 2) + y * y <= 0.85 * 0.85;
  return outer && !bite;
}

// Sommets du symbole ⚡ (dérivés du tracé SVG classique d'un éclair)
const BOLT_VERTICES = [
  [0.09, 0.91],
  [-0.82, -0.18],
  [0, -0.18],
  [-0.09, -0.91],
  [0.82, 0.18],
  [0, 0.18],
];

function butterflyPredicate(x, y) {
  const ax = Math.abs(x);
  if (ax <= 0.05 && y > -0.9) return true; // corps
  if (ax < 0.15) return false; // séparation nette entre les deux ailes
  const topDx = (ax - 0.55) / 0.42,
    topDy = (y - 0.45) / 0.5;
  if (topDx * topDx + topDy * topDy <= 1) return true; // aile du haut
  const botDx = (ax - 0.42) / 0.32,
    botDy = (y + 0.45) / 0.38;
  if (botDx * botDx + botDy * botDy <= 1) return true; // aile du bas
  return false;
}

// ------------------- Police bitmap 5x7 (pour l'initiale géante) -------------------

const FONT5X7 = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
};

function scaleGrid(bitmap, sx, sy) {
  const grid = [];
  for (const row of bitmap) {
    const scaledRow = [];
    for (const ch of row) {
      const filled = ch === "#";
      for (let i = 0; i < sx; i++) scaledRow.push(filled);
    }
    for (let j = 0; j < sy; j++) grid.push(scaledRow);
  }
  return grid;
}

function initialLetterGrid(word) {
  const normalized = (word || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const firstChar = (normalized.match(/[A-Z0-9]/) || ["?"])[0];
  const bitmap = FONT5X7[firstChar] || FONT5X7["?"];
  return scaleGrid(bitmap, 3, 2);
}

// Chaque forme : sa grille (dimensions + domaine + test) et ses alias
// de nom pour que l'utilisateur tape ce qu'il veut.
const SHAPES = {
  coeur: {
    aliases: ["coeur", "cœur", "heart"],
    label: "Cœur",
    emoji: "❤️",
    build: () => buildGrid(12, 28, -1.3, 1.3, -1.15, 1.2, heartPredicate),
  },
  fleur: {
    aliases: ["fleur", "flower"],
    label: "Fleur",
    emoji: "🌸",
    build: () => buildGrid(16, 32, -1.1, 1.1, -1.1, 1.1, flowerPredicate),
  },
  etoile: {
    aliases: ["etoile", "étoile", "star"],
    label: "Étoile",
    emoji: "⭐",
    build: () => buildGrid(15, 30, -1.1, 1.1, -1.1, 1.1, (x, y) => pointInPolygon(x, y, STAR_VERTICES)),
  },
  arbre: {
    aliases: ["arbre", "sapin", "tree"],
    label: "Arbre",
    emoji: "🌲",
    build: () => buildGrid(15, 26, -1, 1, -1, 1, treePredicate),
  },
  losange: {
    aliases: ["losange", "diamant", "diamond"],
    label: "Losange",
    emoji: "💎",
    build: () => buildGrid(13, 26, -1, 1, -1, 1, diamondPredicate),
  },
  cercle: {
    aliases: ["cercle", "rond", "circle"],
    label: "Cercle",
    emoji: "🔵",
    build: () => buildGrid(14, 28, -1.1, 1.1, -1.1, 1.1, circlePredicate),
  },
  triangle: {
    aliases: ["triangle"],
    label: "Triangle",
    emoji: "🔺",
    build: () => buildGrid(13, 26, -1, 1, -1, 1, trianglePredicate),
  },
  carre: {
    aliases: ["carre", "carré", "square"],
    label: "Carré",
    emoji: "⬛",
    build: () => buildGrid(12, 26, -1.1, 1.1, -1.1, 1.1, squarePredicate),
  },
  croix: {
    aliases: ["croix", "cross", "plus"],
    label: "Croix",
    emoji: "➕",
    build: () => buildGrid(13, 26, -1, 1, -1, 1, crossPredicate),
  },
  lune: {
    aliases: ["lune", "croissant", "moon"],
    label: "Lune",
    emoji: "🌙",
    build: () => buildGrid(14, 28, -1.1, 1.1, -1.1, 1.1, moonPredicate),
  },
  papillon: {
    aliases: ["papillon", "butterfly"],
    label: "Papillon",
    emoji: "🦋",
    build: () => buildGrid(17, 34, -1.1, 1.1, -1.1, 1.1, butterflyPredicate),
  },
  eclair: {
    aliases: ["eclair", "éclair", "lightning", "bolt"],
    label: "Éclair",
    emoji: "⚡",
    build: () => buildGrid(18, 26, -0.95, 0.95, -1, 1, (x, y) => pointInPolygon(x, y, BOLT_VERTICES)),
  },
  initiale: {
    aliases: ["initiale", "lettre", "letter"],
    label: "Initiale géante",
    emoji: "🔠",
    build: (word) => initialLetterGrid(word),
  },
};

function findShape(name) {
  const n = (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const key of Object.keys(SHAPES)) {
    const shape = SHAPES[key];
    if (shape.aliases.some((a) => a.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === n)) {
      return shape;
    }
  }
  return null;
}

const SHAPE_LIST = Object.values(SHAPES)
  .map((s) => `${s.emoji} ${s.aliases[0]}`)
  .join(", ");

// ------------------- Commandes -------------------

const commands = [
  {
    name: "style",
    desc: "Texte élégant dans plusieurs polices : .style <texte> (alias : .joli)",
    category: "Fun",
    run: async (sock, msg, { from, args }) => {
      const text = args.join(" ").trim();
      if (!text) {
        return sock.sendMessage(from, {
          text: "Utilisation : .style <texte>\nExemple : .style amour",
        });
      }
      if (text.length > 60) {
        return sock.sendMessage(from, { text: "❌ Texte trop long (60 caractères max)." });
      }
      let out = `✨ *Texte stylé* ✨\n\n`;
      for (const key of Object.keys(STYLES)) {
        out += `🔹 ${STYLE_LABELS[key]} : ${applyStyle(text, key)}\n`;
      }
      out += `\n💡 Astuce : *.forme ${Object.keys(SHAPES)[0]} ${text}* pour le dessiner en forme !`;
      await sock.sendMessage(from, { text: out.trim() });
    },
  },
  {
    name: "forme",
    desc: `Dessine un mot en forme : .forme <forme> <texte> — formes : ${SHAPE_LIST} (alias : .shape)`,
    category: "Fun",
    run: async (sock, msg, { from, args }) => {
      const shapeName = args[0];
      const text = args.slice(1).join(" ").trim();
      const shape = findShape(shapeName);

      if (!shape || !text) {
        return sock.sendMessage(from, {
          text:
            `Utilisation : .forme <forme> <texte>\n` +
            `Formes disponibles : ${SHAPE_LIST}\n` +
            `Exemple : .forme coeur amour`,
        });
      }
      if (text.length > MAX_LEN) {
        return sock.sendMessage(from, {
          text: `❌ Texte trop long pour une forme (${MAX_LEN} caractères max). Essaie un mot plus court.`,
        });
      }

      const art = fillGridWithWord(shape.build(text), text);
      const labelLower = shape.label.toLowerCase();
      const article = /^[aeiouéèê]/.test(labelLower) ? "d'" : "de ";
      await sock.sendMessage(from, {
        text: `${shape.emoji} *${text}* en forme ${article}${labelLower} :\n\`\`\`\n${art}\n\`\`\``,
      });
    },
  },
];

// Alias pratiques : .joli -> .style, .shape -> .forme
commands.push({ ...commands[0], name: "joli" });
commands.push({ ...commands[1], name: "shape" });

module.exports = commands;
