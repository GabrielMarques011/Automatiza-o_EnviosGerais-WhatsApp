import { fetchTicketsDetalhado, fetchOSSSolucionados } from "./helpers.js";
import { contarFinalizados } from "./suporte/contarFinalizados.js";
import { IDS_TECNICOS, FUNCIONARIOS_MAP, ASSUNTOS_MAP, WHATSAPP_GROUP_ID } from "./constants.js";
import { enviarWhatsApp } from "./whatsappClient.js";

// IDs de tickets “normais” que entram na contagem de solucionados
const IDS_TICKETS = [9, 100, 345, 246, 101, 11, 201, 331, 103, 10];

export async function solucionados(token) {
  try {
    console.log("📊 Coletando Chamados Solucionados...");

    // Inicializa contagem normal
    const ticketsNormais = {};
    IDS_TECNICOS.forEach(id => ticketsNormais[id] = { total: 0, assuntos: {} });

    // Busca todos os tickets normais
    for (const assuntoId of IDS_TICKETS) {
      console.log(`📎 Buscando tickets detalhados para assunto ${assuntoId}...`);
      const dados = await fetchTicketsDetalhado(assuntoId, "id_responsavel_tecnico", IDS_TECNICOS, token);

      /* console.log("✅ DEBUG FETCH DETALHADO:", {
        assuntoId,
        keys: Object.keys(dados || {}),
        sample: dados ? Object.values(dados)[0] : null
      }); */

      IDS_TECNICOS.forEach(tec => {
        const dadosTec = dados?.[tec] || { total: 0, assuntos: {} };

        ticketsNormais[tec].total += dadosTec.total;

        Object.entries(dadosTec.assuntos).forEach(([assuntoId, qtd]) => {
          const nomeAssunto = ASSUNTOS_MAP[assuntoId] || `Assunto ${assuntoId}`;
          if (!ticketsNormais[tec].assuntos[nomeAssunto]) ticketsNormais[tec].assuntos[nomeAssunto] = 0;
          ticketsNormais[tec].assuntos[nomeAssunto] += qtd;
        });
      });
    }

    // Busca OSS específicos (já com label)
    console.log("📎 Buscando OSS solucionadas...");
    const oss497 = await fetchOSSSolucionados(497, "PPPoE OS", token);
    const oss664 = await fetchOSSSolucionados(664, "Suporte Contato Ativo", token);

    /* console.log("✅ DEBUG OSS:", {
      oss497Keys: Object.keys(oss497 || {}),
      oss664Keys: Object.keys(oss664 || {}),
      sample497: oss497 ? Object.values(oss497)[0] : null,
      sample664: oss664 ? Object.values(oss664)[0] : null
    }); */

    // Busca finalizações de OS (novo módulo)
    console.log("📎 Contando OS finalizadas...");
    const finalizados = await contarFinalizados(token);

    /* console.log("✅ DEBUG FINALIZADOS:", {
      total: finalizados?.total || 0,
      keys: finalizados?.porTecnico ? Object.keys(finalizados.porTecnico) : [],
      sample: finalizados?.porTecnico ? Object.values(finalizados.porTecnico)[0] : null
    }); */

    // Soma tudo
    const solucionadosTotal = {};
    IDS_TECNICOS.forEach(tec => {
      const nome = FUNCIONARIOS_MAP[tec];
      const dadosFinalizados = finalizados?.porTecnico?.[tec]?.count || 0;

      const oss497Tec = oss497?.[tec] || { total: 0, assuntos: {} };
      const oss664Tec = oss664?.[tec] || { total: 0, assuntos: {} };

      solucionadosTotal[tec] = {
        total:
          ticketsNormais[tec].total +
          oss497Tec.total +
          oss664Tec.total +
          dadosFinalizados,
        assuntos: {
          ...ticketsNormais[tec].assuntos,
          ...oss497Tec.assuntos,
          ...oss664Tec.assuntos,
        },
      };

      // Adiciona a categoria “Finalização de OS (Demanda)”
      if (dadosFinalizados > 0) {
        solucionadosTotal[tec].assuntos["Finalização de OS (Demanda)"] = dadosFinalizados;
      }
    });

    // Monta mensagem
    let msg = "✅ *Chamados Solucionados - Mês Atual:* ✅\n\n";
    const ranking = IDS_TECNICOS.slice().sort(
      (a, b) => solucionadosTotal[b].total - solucionadosTotal[a].total
    );

    let totalSol = 0;
    ranking.forEach((tec, i) => {
      const dados = solucionadosTotal[tec];
      if (dados.total > 0) {
        msg += `${i + 1}° - ${FUNCIONARIOS_MAP[tec]}: ${dados.total} solucionados\n`;
        Object.entries(dados.assuntos)
          .sort((a, b) => b[1] - a[1])
          .forEach(([assunto, qtd]) => {
            msg += `       - ${assunto}: ${qtd}\n`;
          });
        msg += "\n";
        totalSol += dados.total;
      }
    });

    msg += `📊 *Total Geral:* ${totalSol} solucionados`;

    // Envia para WhatsApp
    if (totalSol > 0) {
      console.log("📤 Enviando mensagem para WhatsApp...");
      await enviarWhatsApp(WHATSAPP_GROUP_ID, msg);
      console.log("✅ Relatório de solucionados enviado com sucesso!");
    } else {
      console.log("⚠️ Nenhum chamado solucionado encontrado para o mês atual.");
    }

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err);
  }
}
