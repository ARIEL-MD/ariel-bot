# Cookies YouTube (optionnel, mais recommandé si "Sign in to confirm you're not a bot" persiste)

Ce dossier peut contenir un fichier `youtube.txt` (format **Netscape**) avec
les cookies d'un vrai compte YouTube connecté. `.yt` et `.play` l'utiliseront
automatiquement dès qu'il existe — aucune autre config nécessaire.

⚠️ Utilise de préférence un compte Google "jetable" (pas ton compte
principal), car ce fichier donne un accès équivalent à être connecté sur ce
compte. Ne partage jamais ce fichier avec personne.

## Comment récupérer le fichier

1. Sur ton **navigateur** (Chrome, Firefox, Edge...), connecte-toi à
   https://www.youtube.com avec le compte que tu veux utiliser.
2. Installe une extension qui exporte les cookies au format Netscape, par
   exemple :
   - Chrome/Edge : "Get cookies.txt LOCALLY"
   - Firefox : "cookies.txt"
3. Sur la page YouTube (onglet ouvert sur youtube.com), clique sur l'icône
   de l'extension et exporte les cookies pour **youtube.com** uniquement.
4. Renomme le fichier téléchargé en exactement : `youtube.txt`
5. Mets ce fichier dans **ce dossier** (`cookies/youtube.txt`), à côté de ce
   README, sur ton hébergeur (via le gestionnaire de fichiers du panel, ou
   FTP/SFTP selon ton hébergeur).
6. Redémarre le bot. Pas besoin de modifier `config.js` : le bot détecte le
   fichier automatiquement.

## Durée de vie

Les cookies expirent au bout d'un certain temps (souvent plusieurs
semaines/mois selon YouTube). Si `.yt`/`.play` se remettent à échouer avec
"Sign in to confirm you're not a bot" après un moment, refais simplement les
étapes ci-dessus pour régénérer un fichier `youtube.txt` à jour.

## Sécurité

- Ce fichier `cookies/youtube.txt` est ignoré par git (voir `.gitignore` à
  la racine du projet) : il ne sera jamais publié si tu partages ton code.
- Si tu soupçonnes une fuite de ce fichier, déconnecte simplement le compte
  Google utilisé de toutes les sessions (Google > Sécurité > Appareils
  connectés), ce qui invalide les cookies immédiatement.
