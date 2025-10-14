import { fetchTicketsDetalhado } from "./helpers.js";
import { IDS_TECNICOS, FUNCIONARIOS_MAP, WHATSAPP_GROUP_ID } from "./constants.js";
import { enviarWhatsApp } from "./whatsappClient.js";

export async function upgrade(token) {
  console.log("📊 Coletando Upgrades...");
  const upgrades = await fetchTicketsDetalhado(82, "id_responsavel_tecnico", IDS_TECNICOS, token);

  let msg = "🚨 *Troca de Plano - Mês Atual* 🚨\n\n";
  let total = 0;

  IDS_TECNICOS.sort((a, b) => upgrades[b].total - upgrades[a].total).forEach((tec, i) => {
    if (upgrades[tec].total > 0) {
      msg += `${i + 1}° - ${FUNCIONARIOS_MAP[tec]}: ${upgrades[tec].total} upgrades\n`;
      total += upgrades[tec].total;
    }
  });

  msg += `\n📈 *Total Geral:* ${total} Upgrades Suporte`;
  if (total > 0) await enviarWhatsApp(WHATSAPP_GROUP_ID, msg);
}
