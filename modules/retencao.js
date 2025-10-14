import { fetchTicketsDetalhado } from "./helpers.js";
import { IDS_USUARIOS_RETENCAO, FUNCIONARIOS_RETENCAO, WHATSAPP_GROUP_ID } from "./constants.js";
import { enviarWhatsApp } from "./whatsappClient.js";

export async function retencao(token) {
    console.log("📊 Coletando Retenções...");
    let retencoes = {};

    try {
        retencoes = await fetchTicketsDetalhado(358, "id_usuarios", IDS_USUARIOS_RETENCAO, token);
    } catch (err) {
        console.error("❌ Erro ao buscar tickets:", err.message);
    }

    // Garantir que todos os IDs existem mesmo que fetch falhe
    IDS_USUARIOS_RETENCAO.forEach(id => {
        if (!retencoes[id]) retencoes[id] = { total: 0, assuntos: {} };
    });

    let msgRetencao = "🚨 Retenções - Mês Atual 🚨\n";
    IDS_USUARIOS_RETENCAO
        .sort((a, b) => retencoes[b].total - retencoes[a].total)
        .forEach((tec, i) => {
            if (retencoes[tec].total > 0) {
                msgRetencao += `${i + 1}° - ${FUNCIONARIOS_RETENCAO[tec]}: ${retencoes[tec].total} retenções\n`;
            }
        });

    const totalRet = IDS_USUARIOS_RETENCAO.reduce((acc, tec) => acc + retencoes[tec].total, 0);
    msgRetencao += `\nTotal: ${totalRet} Retenções Suporte`;

    // ✅ Passar o chatId para enviarWhatsApp
    if (totalRet > 0) await enviarWhatsApp(WHATSAPP_GROUP_ID, msgRetencao);
}
