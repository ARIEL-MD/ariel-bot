// ============ STATS DE BLOCAGE (.blockstats) ============
// .blockstats : qui a été bloqué/débloqué au fil du temps, et combien de
// contacts sont actuellement bloqués.
//
// L'historique se remplit tout seul (voir blocklist-store.js, branché sur
// les événements Baileys blocklist.set / blocklist.update) : aucune action
// manuelle nécessaire, il suffit de laisser le bot tourner.
//
// Réservée au propriétaire : la liste de blocage est une information
// personnelle du compte connecté.

const { OWNER_NUMBER } = require("../config");
const { getBlocklistData } = require("../blocklist-store");

const isOwner = (senderNumber) => senderNumber === OWNER_NUMBER;

const MAX_SHOWN = 20;

function formatDateFR(ts) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Abidjan",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

const commands = [
  {
    name: "blockstats",
    desc: "Voir qui a été bloqué/débloqué au fil du temps (propriétaire uniquement)",
    category: "Owner",
    run: async (sock, msg, { from, senderNumber }) => {
      if (!isOwner(senderNumber)) {
        return sock.sendMessage(from, {
          text: "❌ Commande réservée au propriétaire du bot.",
        });
      }

      // Tente de rafraîchir la liste actuelle directement depuis WhatsApp
      // (utile juste après un redémarrage, avant que "blocklist.set" ne
      // soit re-livré) ; si indisponible, on retombe sans planter sur les
      // données déjà mémorisées.
      let liveList = null;
      try {
        if (typeof sock.fetchBlocklist === "function") {
          liveList = await sock.fetchBlocklist();
        }
      } catch (e) {
        // Ignoré volontairement : pas bloquant pour la commande.
      }

      const { current, history } = getBlocklistData();
      const currentList = Array.isArray(liveList) ? liveList : current;

      let text = `🚫 *Statistiques de blocage*\n\n`;
      text += `👤 Actuellement bloqués : *${currentList.length}*\n`;

      if (currentList.length) {
        text += currentList
          .slice(0, MAX_SHOWN)
          .map((jid) => `   • @${jid.split("@")[0]}`)
          .join("\n");
        if (currentList.length > MAX_SHOWN) {
          text += `\n   … et ${currentList.length - MAX_SHOWN} de plus`;
        }
        text += "\n";
      }

      const totalBlocks = history.filter((h) => h.action === "block").length;
      const totalUnblocks = history.filter((h) => h.action === "unblock").length;
      text += `\n📊 Depuis que le bot observe : ${totalBlocks} blocage(s), ${totalUnblocks} déblocage(s)\n`;

      if (history.length) {
        text += `\n🕒 *Derniers événements :*\n`;
        const recent = history.slice(-MAX_SHOWN).reverse();
        for (const h of recent) {
          const icon = h.action === "block" ? "🔴" : "🟢";
          const label = h.action === "block" ? "Bloqué" : "Débloqué";
          text += `${icon} ${label} : @${h.jid.split("@")[0]} — ${formatDateFR(h.at)}\n`;
        }
      } else {
        text +=
          "\nAucun événement observé pour l'instant. L'historique se remplit automatiquement dès qu'un blocage/déblocage a lieu pendant que le bot est en ligne.";
      }

      const mentions = [...new Set([...currentList, ...history.map((h) => h.jid)])].slice(0, 50);

      await sock.sendMessage(from, { text: text.trim(), mentions });
    },
  },
];

module.exports = commands;
