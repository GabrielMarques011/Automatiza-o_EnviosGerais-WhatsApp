// modules/distribuicaoVendaAvulsa.js
import dotenv from "dotenv";
import axios from "axios";
import { enviarWhatsApp } from "../whatsappClient.js";

dotenv.config();

const BASE_URL = process.env.URL_IXC;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_COMERCIAL;
const TIMEOUT = 15000;

/**
 * Distribuição automatizada - Assunto 540 (Venda Avulsa)
 * - Pega tickets su_ticket (id_assunto=540) com su_status EP ou N
 * - Pega su_oss_chamado (id_assunto=540) com status = "A"
 * - Se os.id_ticket === ticket.id -> altera setor/status/técnico via POST /su_oss_chamado_alterar_setor
 * - NOTIFICAÇÃO: envia UMA única mensagem resumo no grupo com contagem por técnico + total
 */
export async function distribuicaoVendaAvulsa(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) {
    console.error("❌ TOKEN_API não fornecido");
    return;
  }

  const headersList = {
    Authorization: token,
    "Content-Type": "application/json",
    ixcsoft: "listar",
  };

  try {
    async function paginarPost(endpoint, payloadBase = {}) {
      const url = `${BASE_URL}${endpoint}`;
      let page = 1;
      const todos = [];
      while (true) {
        const payload = { ...payloadBase, page: String(page), rp: "1000" };
        const resp = await axios.post(url, payload, {
          headers: headersList,
          timeout: TIMEOUT,
        });
        const regs = resp.data?.registros || [];
        if (!regs.length) break;
        todos.push(...regs);
        page++;
      }
      return todos;
    }

    const ticketsRaw = await paginarPost("/su_ticket", {
      qtype: "id_assunto",
      query: "540",
      oper: "=",
    });

    const ticketsMap = {};
    for (const t of ticketsRaw) {
      const ss = String(t.su_status || "").trim();
      if (ss === "EP" || ss === "N") {
        if (
          t.id &&
          t.id_responsavel_tecnico &&
          String(t.id_responsavel_tecnico) !== "0"
        ) {
          ticketsMap[String(t.id)] = {
            id_responsavel_tecnico: t.id_responsavel_tecnico,
            ticketObj: t,
          };
        } else {
          console.warn(
            `⚠️ Ignorando ticket (faltam dados) id=${t.id} resp=${t.id_responsavel_tecnico}`
          );
        }
      }
    }

    console.log(
      `📌 Tickets (assunto 540) com su_status EP/N: ${Object.keys(ticketsMap).length}`
    );
    if (!Object.keys(ticketsMap).length) return;

    const ossRaw = await paginarPost("/su_oss_chamado", {
      qtype: "id_assunto",
      query: "540",
      oper: "=",
    });

    const ossAtivas = ossRaw.filter((o) => String(o.status) === "A");
    console.log(
      `📌 OS recebidas: ${ossRaw.length} / ativas(status=A): ${ossAtivas.length}`
    );
    if (!ossAtivas.length) return;

    const distribuicoes = {};

    for (const os of ossAtivas) {
      const idTicketDaOs = String(os.id_ticket || "");
      if (!ticketsMap[idTicketDaOs]) continue;

      const responsavelRaw = ticketsMap[idTicketDaOs].id_responsavel_tecnico;
      const responsavel = Number(responsavelRaw);
      if (!responsavel || responsavel === 0) {
        console.warn(
          `⚠️ Ticket ${idTicketDaOs} com responsável inválido: ${responsavelRaw}`
        );
        continue;
      }

      const idChamado = String(os.id);
      try {
        // NOVA REQUISIÇÃO (POST /su_oss_chamado_alterar_setor)
        const payload = {
          id: idChamado,
          id_filial: "1",
          id_assunto: "540",
          prioridade: os.prioridade || "N",
          origem_os_aberta: os.origem_os_aberta || "P",
          id_tecnico: responsavel,
          status: "EN",
          setor: "32",
          id_wfl_tarefa: os.id_wfl_tarefa || "0",
          data_hora_encaminhado: new Date()
            .toISOString()
            .replace("T", " ")
            .slice(0, 19),
        };

        try {
          const resp = await axios.post(
            `${BASE_URL}/su_oss_chamado_alterar_setor`,
            payload,
            {
              headers: {
                Authorization: token,
                "Content-Type": "application/json",
              },
              timeout: TIMEOUT,
            }
          );

          if (resp.data?.type === "success") {
            console.log(
              `✅ OS ${idChamado} encaminhada com sucesso para técnico ${responsavel}`
            );
          } else {
            console.warn(
              `⚠️ Falha no POST /alterar_setor para OS ${idChamado}:`,
              resp.data
            );
            continue;
          }
        } catch (err) {
          console.error(
            `❌ Erro ao alterar setor/status da OS ${idChamado}:`,
            err.response?.status || err.message
          );
          continue;
        }

        if (!distribuicoes[String(responsavel)])
          distribuicoes[String(responsavel)] = [];
        const nomeCliente = os.id_cliente
          ? `Cliente ${os.id_cliente}`
          : `Cliente ?`;
        distribuicoes[String(responsavel)].push({
          cliente: nomeCliente,
          id_chamado: idChamado,
          id_ticket: idTicketDaOs,
        });
      } catch (err) {
        console.error(
          "❌ Erro ao processar OS:",
          err.response?.status || err.message || err
        );
        continue;
      }
    }

    if (!Object.keys(distribuicoes).length) {
      console.log("ℹ️ Nenhuma OS casou com tickets EP/N para distribuição.");
      return;
    }

    let funcionariosMap = {};
    try {
      const respFunc = await axios.post(
        `${BASE_URL}/funcionarios`,
        { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" },
        {
          headers: headersList,
          timeout: TIMEOUT,
        }
      );
      (respFunc.data?.registros || []).forEach((f) => {
        funcionariosMap[String(f.id)] = f.funcionario;
      });
    } catch (err) {
      console.warn(
        "⚠️ Não foi possível obter lista de funcionários:",
        err.message || err.response?.status
      );
    }

    const linhas = [];
    let total = 0;

    const resumoArray = Object.entries(distribuicoes).map(
      ([tecId, tarefas]) => {
        const nome = funcionariosMap[tecId] || `Técnico ${tecId}`;
        const qtd = tarefas.length;
        total += qtd;
        return { tecId, nome, qtd };
      }
    );

    resumoArray.sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
    );

    for (const item of resumoArray) {
      const plural = item.qtd === 1 ? "chamado" : "chamados";
      linhas.push(`👤 ${item.nome.split(" ")[0]}: ${item.qtd} ${plural}`);
    }

    let mensagem = `⚠️ Distribuição Automática - Venda Avulsa (Assunto 540) ⚠️\n\n`;
    mensagem += linhas.join("\n") + `\n\n`;
    mensagem += `📦 Total geral: ${total} chamados encaminhados`;

    try {
      await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
      console.log(`✅ Mensagem resumo enviada ao grupo. Total: ${total}`);
    } catch (err) {
      console.error(
        "❌ Erro ao enviar mensagem resumo WhatsApp:",
        err.message || err
      );
    }

    console.log("⏱️ Rotina distribuicaoVendaAvulsa concluída.");
  } catch (err) {
    console.error(
      "❌ Erro geral em distribuicaoVendaAvulsa:",
      err.response?.status || err.message || err
    );
  }
}

export default distribuicaoVendaAvulsa;
