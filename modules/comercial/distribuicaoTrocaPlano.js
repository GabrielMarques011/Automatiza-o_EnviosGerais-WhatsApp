// modules/distribuicaoVendaAvulsa.js
import dotenv from "dotenv";
import axios from "axios";
import { enviarWhatsApp } from "../whatsappClient.js";

dotenv.config();

const BASE_URL = process.env.URL_IXC;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_COMERCIAL;
const TIMEOUT = 15000;

/**
 * Distribuição automatizada - Assunto 82 (Venda Avulsa)
 * - Pega tickets su_ticket (id_assunto=82) com su_status EP / N / S
 * - Pega su_oss_chamado (id_assunto=82) com status = "A"
 * - Se os.id_ticket === ticket.id -> busca detalhado da OS e faz PUT atualizando:
 *    - id_tecnico (number)
 *    - status: "EN"
 *    - setor: "32" (se não existir)
 * - NOTIFICAÇÃO: envia UMA única mensagem resumo no grupo com contagem por técnico + total
 */
export async function distribuicaoTrocaPlano(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) {
    console.error("❌ TOKEN_API não fornecido");
    return;
  }
  const headersList = { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" };

  try {
    // helper de paginação
    async function paginarPost(endpoint, payloadBase = {}) {
      const url = `${BASE_URL}${endpoint}`;
      let page = 1;
      const todos = [];
      while (true) {
        const payload = { ...payloadBase, page: String(page), rp: "1000" };
        const resp = await axios.post(url, payload, { headers: headersList, timeout: TIMEOUT });
        const regs = resp.data?.registros || [];
        if (!regs.length) break;
        todos.push(...regs);
        page++;
      }
      return todos;
    }

    // 1) listar tickets (su_ticket) assunto 82
    const ticketsRaw = await paginarPost("/su_ticket", { qtype: "id_assunto", query: "82", oper: "=" });

    // 2) filtrar por su_status EP / N ou S e montar mapa ticketId -> id_responsavel_tecnico
    const ticketsMap = {};
    for (const t of ticketsRaw) {
      const ss = String(t.su_status || "").trim();
      if (ss === "EP" || ss === "N" || ss === "S") {
        if (t.id && t.id_responsavel_tecnico && String(t.id_responsavel_tecnico) !== "0") {
          ticketsMap[String(t.id)] = { id_responsavel_tecnico: t.id_responsavel_tecnico, ticketObj: t };
        } else {
          console.warn(`⚠️ Ignorando ticket (faltam dados) id=${t.id} resp=${t.id_responsavel_tecnico}`);
        }
      }
    }
    console.log(`📌 Tickets (assunto 82) com su_status EP/N/S: ${Object.keys(ticketsMap).length}`);
    if (!Object.keys(ticketsMap).length) return;

    // 3) listar OSS (su_oss_chamado) assunto 82 e filtrar status = "A"
    const ossRaw = await paginarPost("/su_oss_chamado", { qtype: "id_assunto", query: "82", oper: "=" });
    const ossAtivas = ossRaw.filter(o => String(o.status) === "A");
    console.log(`📌 OS recebidas: ${ossRaw.length} / ativas(status=A): ${ossAtivas.length}`);
    if (!ossAtivas.length) return;

    // 4) para cada OS ativa, checar id_ticket -> fazer PUT atualizando técnico + status + setor
    const distribuicoes = {}; // id_tecnico (string) -> [ { cliente, id_chamado, id_ticket } ]

    for (const os of ossAtivas) {
      const idTicketDaOs = String(os.id_ticket || "");
      if (!ticketsMap[idTicketDaOs]) continue;

      const responsavelRaw = ticketsMap[idTicketDaOs].id_responsavel_tecnico;
      const responsavel = Number(responsavelRaw);
      if (!responsavel || responsavel === 0) {
        console.warn(`⚠️ Ticket ${idTicketDaOs} com responsável inválido: ${responsavelRaw}`);
        continue;
      }

      const idChamado = String(os.id);
      try {
        // buscar detalhado da OS
        const respDetal = await axios.post(`${BASE_URL}/su_oss_chamado`, { qtype: "id", query: idChamado, oper: "=", page: "1", rp: "1" }, {
          headers: headersList, timeout: TIMEOUT
        });
        const regs = respDetal.data?.registros || [];
        if (!regs.length) {
          console.warn(`❌ OS detalhada ${idChamado} não encontrada.`);
          continue;
        }
        const detalhado = { ...regs[0] };

        // alterar campos essenciais para forçar atribuição
        detalhado.id_tecnico = responsavel;
        detalhado.status = "EN";
        detalhado.setor = "32";

        // função de PUT com retry simples
        async function putAtualizarOs(retries = 1) {
          try {
            const respPut = await axios.put(`${BASE_URL}/su_oss_chamado/${idChamado}`, detalhado, {
              headers: { Authorization: token, "Content-Type": "application/json" }, timeout: TIMEOUT
            });
            console.log(`PUT OS ${idChamado} status HTTP: ${respPut.status}`);
            if (respPut.data) console.log("PUT response data:", JSON.stringify(respPut.data).slice(0, 1000));
            return respPut;
          } catch (err) {
            if (retries > 0) {
              console.warn(`⚠️ PUT OS ${idChamado} falhou, tentando novamente... (${retries} left)`, err.message || err.response?.status);
              await new Promise(r => setTimeout(r, 800));
              return putAtualizarOs(retries - 1);
            }
            throw err;
          }
        }

        // executar PUT
        try {
          const respPut = await putAtualizarOs(1);
          if (!(respPut.status >= 200 && respPut.status < 300)) {
            console.error(`❌ PUT OS ${idChamado} retornou HTTP ${respPut.status}`);
            continue;
          }
        } catch (err) {
          console.error(`❌ Erro definitivo no PUT OS ${idChamado}:`, err.response?.status || err.message);
          continue;
        }

        // registrar distribuição para notificação
        if (!distribuicoes[String(responsavel)]) distribuicoes[String(responsavel)] = [];
        const nomeCliente = detalhado.id_cliente ? `Cliente ${detalhado.id_cliente}` : `Cliente ${os.id_cliente || "?"}`;
        distribuicoes[String(responsavel)].push({ cliente: nomeCliente, id_chamado: idChamado, id_ticket: idTicketDaOs });

        console.log(`✅ OS ${idChamado} (ticket ${idTicketDaOs}) atribuída ao técnico ${responsavel}`);
      } catch (err) {
        console.error("❌ Erro ao processar OS:", err.response?.status || err.message || err);
        continue;
      }
    }

    if (!Object.keys(distribuicoes).length) {
      console.log("ℹ️ Nenhuma OS casou com tickets EP/N/S para distribuição.");
      return;
    }

    // 5) obter lista de funcionários (nomes)
    let funcionariosMap = {};
    try {
      const respFunc = await axios.post(`${BASE_URL}/funcionarios`, { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" }, {
        headers: headersList, timeout: TIMEOUT
      });
      (respFunc.data?.registros || []).forEach(f => { funcionariosMap[String(f.id)] = f.funcionario; });
    } catch (err) {
      console.warn("⚠️ Não foi possível obter lista de funcionários:", err.message || err.response?.status);
    }

    // 6) MONTAR UMA ÚNICA MENSAGEM RESUMO e enviar
    const linhas = [];
    let total = 0;
    // ordenar por nome (opcional) — vamos construir um array de { nome, qtd }
    const resumoArray = Object.entries(distribuicoes).map(([tecId, tarefas]) => {
      const nome = funcionariosMap[tecId] || `Técnico ${tecId}`;
      const qtd = tarefas.length;
      total += qtd;
      return { tecId, nome, qtd };
    });

    // opcional: ordenar por nome alfabeticamente
    resumoArray.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

    for (const item of resumoArray) {
      const plural = item.qtd === 1 ? "chamado" : "chamados";
      linhas.push(`👤 ${item.nome.split(" ")[0]}: ${item.qtd} ${plural}`);
    }

    let mensagem = `⚠️ Distribuição Automática - OS Troca de Plano  (Assunto 82) ⚠️\n\n`;
    mensagem += linhas.join("\n") + `\n\n`;
    mensagem += `📦 Total geral: ${total} chamados encaminhados`;

    try {
      await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
      console.log(`✅ Mensagem resumo enviada ao grupo. Total: ${total}`);
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem resumo WhatsApp:", err.message || err);
    }

    console.log("⏱️ Rotina distribuicaoVendaAvulsa concluída.");
  } catch (err) {
    console.error("❌ Erro geral em distribuicaoVendaAvulsa:", err.response?.status || err.message || err);
  }
}

export default distribuicaoTrocaPlano;
