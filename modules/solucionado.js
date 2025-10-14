import { fetchTicketsDetalhado, fetchOSSSolucionados } from "./helpers.js";
import { contarFinalizados } from "./suporte/contarFinalizados.js";
import { IDS_TECNICOS, FUNCIONARIOS_MAP, ASSUNTOS_MAP, WHATSAPP_GROUP_ID } from "./constants.js";
import { enviarWhatsApp } from "./whatsappClient.js";

// IDs de tickets “normais” que entram na contagem de solucionados
const IDS_TICKETS = [9, 100, 345, 246, 101, 11, 201, 331, 103, 10];

export async function solucionados(token) {
  console.log("📊 Coletando Chamados Solucionados...");

  // Inicializa contagem normal
  const ticketsNormais = {};
  IDS_TECNICOS.forEach(id => ticketsNormais[id] = { total: 0, assuntos: {} });

  // Busca todos os tickets normais
  for (const assuntoId of IDS_TICKETS) {
    const dados = await fetchTicketsDetalhado(assuntoId, "id_responsavel_tecnico", IDS_TECNICOS, token);
    IDS_TECNICOS.forEach(tec => {
      ticketsNormais[tec].total += dados[tec].total;

      // Mapear IDs para nomes
      Object.entries(dados[tec].assuntos).forEach(([assuntoId, qtd]) => {
        const nomeAssunto = ASSUNTOS_MAP[assuntoId] || `Assunto ${assuntoId}`;
        if (!ticketsNormais[tec].assuntos[nomeAssunto]) ticketsNormais[tec].assuntos[nomeAssunto] = 0;
        ticketsNormais[tec].assuntos[nomeAssunto] += qtd;
      });
    });
  }

  // Busca OSS específicos (já com label)
  const oss497 = await fetchOSSSolucionados(497, "PPPoE OS", token);
  const oss664 = await fetchOSSSolucionados(664, "Suporte Contato Ativo", token);

  // Busca finalizações de OS (novo módulo)
  const finalizados = await contarFinalizados(token);

  // Soma tudo
  const solucionadosTotal = {};
  IDS_TECNICOS.forEach(tec => {
    const nome = FUNCIONARIOS_MAP[tec];
    const dadosFinalizados = finalizados.porTecnico[tec]?.count || 0;

    solucionadosTotal[tec] = {
      total:
        ticketsNormais[tec].total +
        oss497[tec].total +
        oss664[tec].total +
        dadosFinalizados,
      assuntos: {
        ...ticketsNormais[tec].assuntos,
        ...oss497[tec].assuntos,
        ...oss664[tec].assuntos,
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
    await enviarWhatsApp(WHATSAPP_GROUP_ID, msg);
  }

  console.log("✅ Relatório de solucionados enviado com sucesso!");
}
