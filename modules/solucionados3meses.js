// modules/solucionados3meses.js
import { fetchTicketsDetalhadoPorMeses, fetchOSSSolucionadosPorMeses } from "./helpers3Meses.js";
import { contarFinalizadosUltimos3Meses } from "./suporte/contarFinalizados3meses.js";
import { IDS_TECNICOS, FUNCIONARIOS_MAP, ASSUNTOS_MAP, WHATSAPP_GROUP_ID } from "./constants.js";
import { enviarWhatsApp } from "./whatsappClient.js";

// IDs de tickets "normais" que entram na contagem de solucionados
const IDS_TICKETS = [9, 100, 345, 246, 101, 11, 201, 331, 103, 10];

export async function solucionados3Meses(token) {
  try {
    console.log("📊 Coletando Chamados Solucionados dos últimos 3 meses...");

    // Inicializa contagem normal
    const ticketsNormais = {};
    IDS_TECNICOS.forEach(id => ticketsNormais[id] = { total: 0, assuntos: {} });

    // Busca todos os tickets normais - AGORA PARA 3 MESES
    for (const assuntoId of IDS_TICKETS) {
      console.log(`📎 Buscando tickets detalhados para assunto ${assuntoId}...`);
      const dados = await fetchTicketsDetalhadoPorMeses(assuntoId, "id_responsavel_tecnico", IDS_TECNICOS, token, 3);

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

    // Busca OSS específicos - AGORA PARA 3 MESES
    console.log("📎 Buscando OSS solucionadas...");
    const oss497 = await fetchOSSSolucionadosPorMeses(497, "PPPoE OS", token, 3);
    const oss664 = await fetchOSSSolucionadosPorMeses(664, "Suporte Contato Ativo", token, 3);

    // Busca finalizações de OS para 3 meses
    console.log("📎 Contando OS finalizadas...");
    const finalizados = await contarFinalizadosUltimos3Meses(token);

    // Soma tudo
    const solucionadosTotal = {};
    IDS_TECNICOS.forEach(tec => {
      const nome = FUNCIONARIOS_MAP[tec];
      const dadosFinalizados = finalizados?.porTecnico?.[tec]?.count || 0;
      const dadosFinalizadosPorMes = finalizados?.porTecnico?.[tec]?.countPorMes || [];

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
        porMes: dadosFinalizadosPorMes
      };

      if (dadosFinalizados > 0) {
        solucionadosTotal[tec].assuntos["Finalização de OS (Demanda)"] = dadosFinalizados;
      }
    });

    // Monta mensagem ESPECÍFICA para 3 meses
    let msg = `✅ *Chamados Solucionados - Últimos 3 Meses:* ✅\n\n`;
    
    // Adiciona informações dos meses analisados
    if (finalizados?.meses) {
      msg += `📅 *Período Analisado:*\n`;
      finalizados.meses.forEach(mes => {
        msg += `📍 ${mes.nome}: ${mes.total} finalizados\n`;
      });
      msg += `\n`;
    }

    const ranking = IDS_TECNICOS.slice().sort(
      (a, b) => solucionadosTotal[b].total - solucionadosTotal[a].total
    );

    let totalSol = 0;
    
    // PRIMEIRO: Resumo por técnico com detalhes por mês
    msg += `👨‍🔧 *RESUMO POR TÉCNICO:*\n\n`;
    ranking.forEach((tec, i) => {
      const dados = solucionadosTotal[tec];
      const nome = FUNCIONARIOS_MAP[tec] || `Técnico ${tec}`;
      
      if (dados.total > 0) {
        msg += `${i + 1}° - *${nome}:* ${dados.total} solucionados\n`;
        
        // Adiciona detalhes por mês
        if (finalizados?.meses && dados.porMes) {
          dados.porMes.forEach((count, index) => {
            if (count > 0) {
              const mes = finalizados.meses[index];
              const mesAbreviado = mes.nome.split(' de ')[0].substring(0, 3); // "outubro" → "out"
              msg += `   📍 ${mesAbreviado}: ${count}\n`;
            }
          });
        }
        
        // Adiciona os 3 principais assuntos
        const topAssuntos = Object.entries(dados.assuntos)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        if (topAssuntos.length > 0) {
          msg += `   🎯 `;
          topAssuntos.forEach(([assunto, qtd], idx) => {
            msg += `${assunto}: ${qtd}`;
            if (idx < topAssuntos.length - 1) msg += ` • `;
          });
          msg += `\n`;
        }
        
        msg += `\n`;
        totalSol += dados.total;
      }
    });

    msg += `📊 *Total Geral dos 3 Meses:* ${totalSol} solucionados`;

    // Envia para WhatsApp
    if (totalSol > 0) {
      console.log("📤 Enviando mensagem para WhatsApp...");
      await enviarWhatsApp(WHATSAPP_GROUP_ID, msg);
      console.log("✅ Relatório de solucionados (3 MESES) enviado com sucesso!");
    } else {
      console.log("⚠️ Nenhum chamado solucionado encontrado para os últimos 3 meses.");
    }

    return solucionadosTotal;

  } catch (err) {
    console.error("❌ Erro na rotina de 3 meses:", err);
    throw err;
  }
}