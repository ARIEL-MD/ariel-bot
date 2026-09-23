<div align="center">

# 🤖 ARIEL-MD

<img src="https://i.ibb.co/vvTf52cf/ARIEL-MD.jpg" alt="ARIEL-MD" width="500"/>

**Bot WhatsApp multifonction basé sur [Baileys](https://github.com/WhiskeySockets/Baileys)**

Connexion par code d'appairage · Code 100% lisible · Aucun SESSION_ID externe à récupérer

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-%5E6.7.23-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#licence)
[![Made with](https://img.shields.io/badge/made%20with-%E2%9D%A4-red)]()

[Installation](#-installation) · [Configuration](#%EF%B8%8F-configuration) · [Commandes](#-commandes-disponibles) · [Déploiement](#%EF%B8%8F-déploiement) · [FAQ](#-questions-fréquentes)

</div>

---

## 📖 Sommaire

- [Présentation](#-présentation)
- [Fonctionnalités](#-fonctionnalités)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#%EF%B8%8F-configuration)
- [Démarrage](#%EF%B8%8F-démarrage)
- [Appairer depuis Telegram](#-appairer-un-bot-whatsapp-depuis-telegram-multi-utilisateurs)
- [Commandes disponibles](#-commandes-disponibles)
- [Déploiement](#%EF%B8%8F-déploiement)
- [Questions fréquentes](#-questions-fréquentes)
- [Avertissement](#%EF%B8%8F-avertissement)
- [Licence](#-licence)

---

## 📌 Présentation

**ARIEL-MD** est un bot WhatsApp personnel construit sur [Baileys](https://github.com/WhiskeySockets/Baileys), la librairie open-source de référence pour se connecter à WhatsApp Web sans navigateur. Il se connecte à ton propre numéro via un **code d'appairage à 8 caractères**, directement dans la console — pas de QR code à scanner en boucle, pas de service tiers, pas de clé de session à copier depuis un site externe.

Le projet est pensé pour être :
- **Transparent** : tout le code est lisible et commenté en français.
- **Autonome** : `yt-dlp` et `ffmpeg` sont téléchargés/gérés automatiquement, sans Python ni droits admin.
- **Portable** : fonctionne aussi bien en local, sur un VPS, que sur des panels d'hébergement type Pterodactyl (OptikLink, Katabump, bot-hosting.net...).

## ✨ Fonctionnalités

| | |
|---|---|
| 📥 **Téléchargements** | YouTube, TikTok, Facebook, Instagram, Spotify, packs de stickers Telegram |
| 🎨 **Images & Stickers** | Création de stickers, amélioration de photos, texte stylisé, fonds d'écran |
| 🤖 **IA** | Chat avec Llama 3.3 70B (Groq), chatbot DM automatique, génération d'images (Pollinations) |
| 🌍 **Traduction** | Traduction multi-API avec repli automatique en cascade |
| 👥 **Modération de groupe** | Kick/promote/demote, anti-lien, anti-fake, tagall, bienvenue/au revoir personnalisés |
| 👑 **Outils propriétaire** | Anti-suppression, anti-vue-unique, mode absent, réponse auto, visionneur de statuts, mise à jour à distance |
| 🧰 **Utilitaires** | QR code, raccourcisseur de lien, convertisseur de devises, base64, compression média, texte→vocal, transcription audio |

➡️ Voir la liste complète et détaillée dans [Commandes disponibles](#-commandes-disponibles).

## 🧾 Prérequis

- [Node.js](https://nodejs.org) **18 ou supérieur**
- Un accès internet sortant (au minimum au moment du `npm install`)
- Un numéro WhatsApp dédié au bot (recommandé de ne pas utiliser ton numéro principal)

## 🚀 Installation

1. **Fork ce dépôt** sur ton propre compte GitHub (bouton **Fork** en haut à droite de la page du projet) — c'est nécessaire avant de pouvoir cloner/télécharger et déployer ta propre copie du bot.
2. Clone (ou télécharge le ZIP de) **ton fork**, puis installe les dépendances :

```bash
git clone https://github.com/TON-COMPTE/ARIEL-BOT-MD.git
cd ARIEL-BOT-MD
npm install
```

Le `npm install` télécharge automatiquement, en plus des dépendances npm classiques :
- un binaire **ffmpeg** portable (`ffmpeg-static`), utilisé pour les stickers et les conversions audio/vidéo ;
- un binaire **yt-dlp** autonome (`scripts/download-ytdlp.js`), utilisé par `.song`/`.video` en repli.

Aucun des deux ne nécessite Python ni un accès root : ça fonctionne tel quel sur la plupart des panels d'hébergement sans droits administrateur.

## 📱 Ton numéro WhatsApp (à faire en premier)

Ouvre le fichier **`METS-TON-NUMERO-ICI.txt`**, à la racine du projet
(visible dès que tu décompresses le zip), et écris ton numéro WhatsApp
dedans, seul sur sa propre ligne (indicatif pays, sans `+` ni espaces —
ex : `2250700000000`). C'est la seule chose à changer pour déployer le bot
avec ton propre numéro ; les instructions complètes sont dans le fichier
lui-même.

## ⚙️ Configuration

Copie le fichier d'exemple puis remplis tes propres valeurs :

```bash
cp config.example.js config.js
```

Ouvre ensuite `config.js` : chaque option y est décrite par un commentaire (clés API optionnelles pour certaines commandes, mode public/privé, etc.). Le numéro WhatsApp, lui, ne se règle plus ici mais dans `METS-TON-NUMERO-ICI.txt` (voir ci-dessus).

> ⚠️ `config.js` contient des données sensibles et est listé dans `.gitignore` : il ne sera **jamais** publié via Git. Ne le partage jamais publiquement, et ne le colle pas dans un message, une issue ou un README.

## ▶️ Démarrage

```bash
npm start
```

Au premier lancement (ou si la session est perdue) :

1. Le bot lit ton numéro WhatsApp dans `METS-TON-NUMERO-ICI.txt` (ou te le demande directement dans la console si ce fichier est vide).
2. Il affiche un **code d'appairage** à 8 caractères.
3. Sur ton téléphone : **WhatsApp → Paramètres → Appareils liés → Lier un appareil → Lier avec un numéro de téléphone** → entre le code affiché.
4. Une fois connecté, un dossier `session/` est créé automatiquement.

> 🔒 Le dossier `session/` contient les clés de connexion à ton compte WhatsApp — ne le partage **jamais**, avec personne. Les démarrages suivants n'auront plus besoin du code d'appairage.

## 🤝 Appairer un bot WhatsApp depuis Telegram (multi-utilisateurs)

Deux modes existent, à ne pas confondre :

| Mode | Pour qui | Fichier |
|---|---|---|
| **Personnel** : le code d'appairage arrive dans TON Telegram | Toi seul | `telegram-pair.js` (`TELEGRAM_PAIRING_BOT_TOKEN` + `TELEGRAM_OWNER_CHAT_ID` dans `config.js`) |
| **Public** : chacun obtient SON propre bot WhatsApp via `/pair` | Tout le monde ayant le code d'invitation | `orchestrator/` |

### Mettre en place le mode public

1. Sur Telegram, crée un bot avec **@BotFather** et copie son token (un bot **différent** de ceux de `config.js`).
2. Récupère ton ID Telegram avec **@userinfobot**.
3. Remplis `orchestrator/config.js` : `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID`, `INVITE_CODE` (et, si tu veux, `MAX_INSTANCES` ; `0` = pas de limite).
4. Lance : `npm install` puis `npm run orchestrator`.

### Utilisation (côté utilisateur)

1. Ouvrir ton bot Telegram **en message privé** et envoyer : `/pair <code_invitation> <numéro avec indicatif>` (ex : `/pair MONCODE 2250700000000`).
2. Le bot répond avec un **code d'appairage**. Sur le téléphone : **WhatsApp → Paramètres → Appareils liés → Lier un appareil → Lier avec un numéro de téléphone**, puis entrer le code (il expire vite).
3. Un message « ✅ connecté » confirme que le bot est actif. Les autres commandes : `/status`, `/stop`.

Commandes admin : `/stats` (vue d'ensemble) et `/setcode <nouveau_code>` (change le code d'invitation sans redémarrer).

### Ce qui est isolé, ce qui est partagé

- **Par utilisateur** (`orchestrator/instances/<id>/`) : session WhatsApp, réglages, contacts, statuts programmés, journal `bot.log`.
- **Partagé** : le code du bot, `config.js` (dont la clé Groq de l'IA) et les outils (`yt-dlp`, `ffmpeg`).
- Sur une instance publique, `.update` et `.grok_clé_api=` sont désactivées : seul l'administrateur du serveur gère le code et les clés.

> 🔒 Ne partage jamais `orchestrator/config.js` ni `orchestrator/registry.json` (token, code d'invitation, liste des utilisateurs).

## 📋 Commandes disponibles

> Le préfixe par défaut est `.` (configurable dans `config.js` via `PREFIX`/`PREFIXES`). Tape `.menu` à tout moment pour voir la liste à jour directement depuis WhatsApp.

### 📋 Général
| Commande | Description |
|---|---|
| `.menu` | Affiche la liste des commandes par catégorie |
| `.ping` | Teste la réactivité du bot (vitesse, uptime, RAM) |
| `.alive` | Vérifie que le bot est en ligne |
| `.runtime` | Depuis combien de temps le bot tourne |
| `.owner` | Affiche le contact du propriétaire |
| `.jid` | Affiche le JID du chat et le tien |
| `.indispo [message]` | Active le mode absent (réponse auto en DM) — propriétaire |
| `.dispo` | Désactive le mode absent — propriétaire |
| `.absent on <message>` / `off` | Réponse automatique persistante en DM — propriétaire |
| `.chatbot on\|off` | L'IA répond à ta place à qui t'écrit en DM, message par message — propriétaire |

### 👑 Owner (réservées au propriétaire)
| Commande | Description |
|---|---|
| `.settings` | Affiche l'état de tous les réglages activables |
| `.toggle <nom> on\|off` | Réglage générique (voir `.settings` pour la liste) |
| `.online on\|off` | Toujours apparaître en ligne |
| `.anti_delete on\|off` | Renvoie les messages supprimés au propriétaire |
| `.anticall on\|off` | Rejette automatiquement les appels entrants |
| `.antivv on\|off` | Anti-vue-unique automatique (capture les médias vue unique) |
| `.autoread on\|off` | Lecture automatique des messages |
| `.reactcmd on\|off\|<emoji>` | Réaction automatique sur les commandes reçues |
| `.ok` | Répondre à un média vue unique pour le révéler, ou `.ok on\|off` pour l'automatiser |
| `.autosticker on\|off` | Enregistre automatiquement tous les stickers reçus (DM et groupes) |
| `.autostatus` | Menu du visionneur/like automatique de statuts (voir ci-dessous) |
| `.statusreply on\|off\|words` | Renvoie automatiquement un statut en DM à qui le commente avec un mot déclencheur |
| `.pp` | Change la photo de profil du bot (répondre à une image) |
| `.setstatus` | Publie le média/texte cité en story |
| `.scstatus` | Programme l'envoi d'une story |
| `.update` | Vérifie et applique les mises à jour du bot |
| `.restart` | Redémarre le bot |
| `.blockstats` | Historique de qui a été bloqué/débloqué au fil du temps |

<details>
<summary><strong>📡 Visionneur de statuts automatique (<code>.autostatus</code>)</strong></summary>

Persistance propre (`data/autostatus.json`) : survit à un redémarrage sans configuration supplémentaire.

| Commande | Description |
|---|---|
| `.autostatus on` / `off` | Active / désactive le visionnage automatique des statuts |
| `.autostatuslike on` / `off` | Active / désactive le like 💚 des statuts vus |
| `.autostatus self on` / `off` | Voir (ou ignorer) ses propres statuts |
| `.autostatus include add/remove <numéros>` | Gère la liste des numéros à voir exclusivement |
| `.autostatus exclude add/remove <numéros>` | Gère la liste des numéros à ignorer |
| `.autostatus includelist` / `excludelist` | Affiche la liste active |
| `.autostatus includeclear` / `excludeclear` | Vide la liste |
| `.autostatus emoji add\|remove\|set\|clear <emojis>` | Gère la liste des emojis utilisés pour le like automatique (`.autostatuslike`) |

</details>

### 🤖 IA
| Commande | Description |
|---|---|
| `.gpt <question>` | Pose une question à l'IA (Llama 3.3 70B via Groq) |
| `.dall <description>` | Génère une image à partir d'une description (Pollinations AI) |
| `.transcrire` | Transcrit un audio/note vocale en texte (répondre à un audio) |

### 📥 Téléchargements
| Commande | Description |
|---|---|
| `.video <titre ou lien>` | Télécharge une vidéo YouTube (recherche ou lien direct) |
| `.song <titre ou lien>` | Télécharge une musique YouTube, conversion MP3 automatique |
| `.tiktok <lien>` | Télécharge une vidéo TikTok |
| `.insta <lien>` | Télécharge un post/reel Instagram public |
| `.fb <lien>` | Télécharge une vidéo Facebook |
| `.spotify <titre/artiste>` | Recherche et télécharge une musique depuis Spotify |
| `.tg <lien du pack>` | Télécharge un pack complet de stickers Telegram |
| `.dl <lien>` | Téléchargeur générique via une API RapidAPI *(template à personnaliser, voir ci-dessous)* |

> ⚠️ **`.dl` (`commands/dl.js`) est un squelette prêt à brancher sur une API de téléchargement de ton choix.** Regarde les commentaires `TODO` dans ce fichier avant de l'utiliser : il contient une clé RapidAPI placeholder à remplacer, et le chemin du JSON (`data.result.media.video`, etc.) doit être adapté au format réel renvoyé par l'API que tu choisis. Renomme-le ou supprime-le si tu n'en as pas l'usage.

### 🎨 Images & Stickers
| Commande | Description |
|---|---|
| `.sticker` | Transforme une image/vidéo en sticker (répondre à un média) |
| `.toimg` | Reconvertit un sticker en image |
| `.remini` | Améliore la netteté/qualité d'une image (zoom x2) |
| `.text <style> <texte>` | Génère un texte stylisé (metallic, ice, neon, fire, matrix...) |
| `.hacker <texte>` | Génère un avatar "hacker" stylisé |
| `.wall <recherche>` | Cherche des fonds d'écran (alias `.wallpaper`) |

### 🌍 Traduction
| Commande | Description |
|---|---|
| `.traduire <langue> <texte>` | Traduit un texte (ou en réponse à un message) |
| `.trt <langue> <texte>` | Alias de `.traduire` |

### ℹ️ Infos & Recherche
| Commande | Description |
|---|---|
| `.meteo <ville>` | Météo actuelle d'une ville |
| `.lyrics <artiste> - <titre>` | Paroles d'une chanson |
| `.currency <montant> <de> <vers>` | Convertisseur de devises |

### 🧰 Utilitaires
| Commande | Description |
|---|---|
| `.qrcode <texte/lien>` | Génère un QR code |
| `.shorturl <lien>` | Raccourcit un lien |
| `.base64 encode\|decode <texte>` | Encode/décode en base64 |
| `.tovoice [code langue] <texte>` | Convertit un texte en note vocale (ex : `.tovoice en Hello everyone`) |
| `.compress [qualité 1-100]` | Compresse une image/vidéo trop lourde (répondre au média) |
| `.save` | Sauvegarde un statut (le tien ou celui d'un contact) — répondre au statut avec `.save` |
| `.poll Question \| Option1 \| Option2...` | Crée un sondage WhatsApp |
| `.clear` | Efface les messages connus pour tout le monde — propriétaire |
| `.clearforme` | Efface la discussion connue, uniquement de ton côté — propriétaire |

### 👥 Groupe & Modération (admins du groupe)
| Commande | Description |
|---|---|
| `.tagall [texte]` | Mentionne tous les membres |
| `.hidetag [texte]` | Notifie tout le monde discrètement |
| `.kick` | Exclut un membre (mention, réponse ou numéro) |
| `.add <numéro>` | Ajoute un numéro au groupe |
| `.promote` / `.demote` | Promeut/rétrograde un membre admin |
| `.group open\|close` | Ouvre ou ferme le groupe |
| `.antilink on\|off` | Supprime automatiquement les liens des non-admins |
| `.welcome on\|off` | Active/désactive les messages de bienvenue et d'au revoir |
| `.setwelcome <message>` / `.setbye <message>` | Personnalise ces messages (`{user}`, `{group}`) |
| `.antifake on\|off` | Exclut les membres dont l'indicatif n'est pas autorisé |
| `.listadmins` | Liste les admins du groupe |

> `.kick`, `.promote`, `.demote` acceptent une mention, une réponse au message, ou un numéro en argument. Le bot doit lui-même être admin du groupe pour ces actions.

### 📂 Autres
| Commande | Description |
|---|---|
| `.bible <référence>` | Affiche un verset biblique, version Louis Segond (alias `.verset`, `.lsg`) |

## ☁️ Déploiement

### OptikLink
1. Crée un serveur type **"Bot Hosting" / egg Node.js** sur [optiklink.net](https://optiklink.net)
2. Upload ce dossier (ZIP ou Git)
3. Fichier de démarrage : `index.js`
4. Démarre le serveur, puis suis les instructions affichées en console pour entrer ton numéro et récupérer ton code d'appairage.

### Autres panels / VPS / local
Le bot est conçu pour tourner de façon identique sur OptikLink, Katabump, un panel Pterodactyl générique, un VPS ou en local, **sans rien changer dans le code** :

| Besoin | Solution automatique |
|---|---|
| Numéro de téléphone | `node index.js <numéro>`, variable d'env. `PHONE_NUMBER`, ou `METS-TON-NUMERO-ICI.txt` |
| Ping HTTP (Render, Railway, Replit...) | Petit serveur intégré qui répond `OK` sur le port fourni par `PORT` (3000 par défaut) |
| Console non interactive | Le bot saute la saisie manuelle du numéro au lieu de planter |
| `yt-dlp` / `ffmpeg` | Téléchargés/vérifiés automatiquement au démarrage, même sans `postinstall` |

## ❓ Questions fréquentes

**Le bot peut-il tourner sur plusieurs numéros en même temps ?**
Non, une instance = un numéro WhatsApp lié via `session/`.

**Puis-je changer le préfixe `.` ?**
Oui, via `PREFIX` et `PREFIXES` dans `config.js`.

**Comment mettre à jour le bot ?**
Via `.update` (Git ou ZIP selon comment il a été installé), ou manuellement en remplaçant les fichiers sauf `config.js` et `session/`.

## ⚠️ Avertissement

Ce bot utilise **Baileys**, une librairie non-officielle qui reproduit le protocole WhatsApp Web. Son usage n'est pas garanti ni approuvé par WhatsApp/Meta et comporte un risque, même faible, de limitation ou de bannissement du numéro utilisé. Utilise de préférence un numéro secondaire, dédié au bot, et reste raisonnable sur le volume et la fréquence des actions automatisées (envois en masse, ajouts de membres, etc.).

## 📄 Licence

Distribué sous licence [MIT](LICENSE). Utilisation libre, modification et redistribution autorisées, à condition de conserver le crédit original.

---

<div align="center">

Développé avec ❤️ par **ARIEL**
Un bug, une idée ? Ouvre une [issue](https://github.com/ARIEL-MD/ARIEL-BOT-MD/issues).

</div>
