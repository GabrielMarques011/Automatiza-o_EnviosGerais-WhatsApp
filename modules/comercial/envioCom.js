// modules/envioCom.js
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { enviarWhatsApp } from "../whatsappClient.js"; // ajuste se necessário

dotenv.config();

export const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_COMERCIAL;
const BASE_URL = process.env.URL_IXC;

const expedienteColaboradores = {
  342: { inicio: "06:00", fim: "20:00" },
  343: { inicio: "06:00", fim: "20:00" },
  304: { inicio: "06:00", fim: "20:00" },
  305: { inicio: "06:00", fim: "20:00" }
};

const grupoSabado1 = [342, 343];
const grupoSabado2 = [305, 304];
const estagiariosSabado = {
  // deixe vazio ou preencha caso existam estagiários com horário fixo de sábado
};

function saoPauloNow() {
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(str);
}
function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function dentroDoExpediente(tecnicoId) {
  const now = saoPauloNow();
  const day = now.getDay(); // 0 = domingo, 6 = sábado
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  if (day === 0) return false; // domingo => não trabalha

  // sábado
  if (day === 6) {
    if (estagiariosSabado[tecnicoId]) {
      const hi = timeToMinutes(estagiariosSabado[tecnicoId].inicio);
      const hf = timeToMinutes(estagiariosSabado[tecnicoId].fim);
      return minutesNow >= hi && minutesNow <= hf;
    }
    const ano = now.getFullYear();
    const primeiro = new Date(`${ano}-01-01T00:00:00`);
    const dias = Math.floor((now - primeiro) / (24 * 60 * 60 * 1000));
    const semana = Math.floor((dias + primeiro.getDay()) / 7) + 1;
    const grupo = (semana % 2 === 0) ? grupoSabado2 : grupoSabado1;
    if (grupo.includes(tecnicoId)) {
      return minutesNow >= timeToMinutes("06:00") && minutesNow <= timeToMinutes("16:00");
    }
    return false;
  }

  // dias úteis
  const horario = expedienteColaboradores[tecnicoId];
  if (!horario) return false;
  return minutesNow >= timeToMinutes(horario.inicio) && minutesNow <= timeToMinutes(horario.fim);
}

const rodizioFile = path.resolve(process.cwd(), "rodizio_index.txt");
async function carregarIndiceAtual() {
  try {
    const txt = await fs.readFile(rodizioFile, "utf8");
    const n = parseInt(txt, 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}
async function salvarIndiceAtual(indice) {
  try {
    await fs.writeFile(rodizioFile, String(indice), "utf8");
  } catch (err) {
    console.warn("⚠️ Erro ao salvar índice de rodízio:", err.message || err);
  }
}

async function listarTodosChamados(token) {
  const headers = { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" };
  const url = `${BASE_URL}/su_oss_chamado`;
  let page = 1;
  const todos = [];

  while (true) {
    const body = { qtype: "status", query: "A", oper: "=", page: String(page), rp: "1000" };
    const resp = await axios.post(url, body, { headers, timeout: 15000 });
    const regs = resp.data?.registros || [];
    if (!regs.length) break;
    todos.push(...regs);
    page++;
  }
  console.log(`📌 Total chamados recebidos: ${todos.length}`);
  return todos;
}

// ===============================
// Distribuição (id_assunto = 499)
// ===============================
export async function distribuicaoComercial(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) {
    console.error("❌ TOKEN_API não fornecido");
    return;
  }

  try {
    const registros = await listarTodosChamados(token);

    // map assuntos
    const respAssuntos = await axios.post(`${BASE_URL}/su_oss_assunto`, { page: "1", rp: "1000" }, {
      headers: { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" }
    });
    const assuntosMap = {};
    (respAssuntos.data?.registros || []).forEach(a => { assuntosMap[String(a.id)] = a.assunto; });

    // filtrar por id_assunto = 499 e status A
    const filtrados = registros.filter(r => String(r.id_assunto) === "499" && String(r.status) === "A");
    console.log(`📌 Total chamados abertos com assunto 499: ${filtrados.length}`);

    if (!filtrados.length) return;

    // obter funcionarios (nomes)
    const respFunc = await axios.post(`${BASE_URL}/funcionarios`, { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" }, {
      headers: { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" }
    });
    const funcionariosMap = {};
    (respFunc.data?.registros || []).forEach(f => { funcionariosMap[parseInt(f.id,10)] = f.funcionario; });

    const idsTecnicos = [342, 343, 304, 305];
    const distribuicoes = {}; // { tecnicoId: [ { cliente, assunto_id } ] }
    let indice = await carregarIndiceAtual();
    const num = idsTecnicos.length;

    for (const chamado of filtrados) {
      let tentativas = 0;
      let escolhido = null;
      while (tentativas < num) {
        const cand = idsTecnicos[indice];
        if (dentroDoExpediente(cand)) {
          escolhido = cand;
          break;
        }
        indice = (indice + 1) % num;
        tentativas++;
      }
      if (!escolhido) {
        console.warn("⚠️ Nenhum técnico disponível — interrompendo distribuição.");
        break;
      }

      const idChamado = chamado.id;
      // buscar detalhado para garantir dados e atualizar
      try {
        const respDetal = await axios.post(`${BASE_URL}/su_oss_chamado`, { qtype: "id", query: String(idChamado), oper: "=", page: "1", rp: "1" }, {
          headers: { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" },
          timeout: 10000
        });
        const regs = respDetal.data?.registros || [];
        if (!regs.length) {
          console.warn(`❌ Chamado ${idChamado} não encontrado no detalhado.`);
          indice = (indice + 1) % num; await salvarIndiceAtual(indice);
          continue;
        }
        const detalhado = { ...regs[0], id_tecnico: escolhido, status: "EN", setor: "32" };

        // atualizar via PUT
        try {
          const respPut = await axios.put(`${BASE_URL}/su_oss_chamado/${idChamado}`, detalhado, {
            headers: { Authorization: token, "Content-Type": "application/json" }, timeout: 10000
          });
          if (!(respPut.status >= 200 && respPut.status < 300)) {
            console.error("❌ PUT retornou:", respPut.status);
            indice = (indice + 1) % num; await salvarIndiceAtual(indice);
            continue;
          }
        } catch (err) {
          console.error("❌ Erro no PUT:", err.response?.status || err.message);
          indice = (indice + 1) % num; await salvarIndiceAtual(indice);
          continue;
        }

        // buscar nome do cliente
        let nomeCliente = `Cliente ${detalhado.id_cliente}`;
        try {
          const respCli = await axios.post(`${BASE_URL}/cliente`, { qtype: "id", query: String(detalhado.id_cliente), oper: "=", page: "1", rp: "1" }, {
            headers: { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" }, timeout: 10000
          });
          const recs = respCli.data?.registros || [];
          if (recs.length) nomeCliente = recs[0].razao || nomeCliente;
        } catch (err) {
          console.warn("⚠️ Não foi possível obter cliente:", err.message || err.response?.status);
        }

        if (!distribuicoes[escolhido]) distribuicoes[escolhido] = [];
        distribuicoes[escolhido].push({ cliente: nomeCliente, assunto_id: chamado.id_assunto });

        // avança índice e salva
        indice = (indice + 1) % num;
        await salvarIndiceAtual(indice);

        console.log(`✅ Chamado ${idChamado} encaminhado para técnico ${escolhido}`);
      } catch (err) {
        console.error("❌ Erro ao processar chamado:", err.response?.status || err.message || err);
        indice = (indice + 1) % num; await salvarIndiceAtual(indice);
        continue;
      }
    }

    // 6) enviar notificações no WhatsApp (grupo) — FORMATO SOLICITADO
    for (const [tecIdStr, chamados] of Object.entries(distribuicoes)) {
      const tecId = parseInt(tecIdStr, 10);
      const nomeTec = funcionariosMap[tecId] || `Técnico ${tecId}`;
      let mensagem = `⚠️ *Distribuição de Demandas Terceirizadas* ⚠️\n\n👤 *${nomeTec}*\n\n`;

      for (const info of chamados) {
        const nomeAssunto = assuntosMap[String(info.assunto_id)] || `Assunto ${info.assunto_id}`;
        mensagem += `- Cliente: ${info.cliente}\n`;
        mensagem += `- Assunto: ${nomeAssunto}\n\n`;
      }

      try {
        await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
        console.log("✅ Notificação enviada para", nomeTec);
      } catch (err) {
        console.error("❌ Erro ao enviar notificação WhatsApp:", err.message || err);
      }
    }

    console.log("⏱️ Rotina de encaminhar chamados concluída.");
  } catch (err) {
    console.error("❌ Erro geral no envioComercial:", err.response?.status || err.message || err);
  }
}

// ========================================
// Contador diário: id_assunto=499 com status EN
// ========================================
export async function contarChamadosTerceirizada(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) { console.error("❌ TOKEN_API não fornecido"); return; }

  try {
    const headers = { Authorization: token, "Content-Type": "application/json", ixcsoft: "listar" };
    const url = `${BASE_URL}/su_oss_chamado`;
    let page = 1;
    const todos = [];

    while (true) {
      const payload = { qtype: "id_assunto", query: "499", oper: "=", page: String(page), rp: "1000" };
      const resp = await axios.post(url, payload, { headers, timeout: 15000 });
      const regs = resp.data?.registros || [];
      if (!regs.length) break;
      todos.push(...regs);
      page++;
    }

    // mapa técnicoId -> nome (use os nomes que você informou)
    const tecnicos = {
      342: "Aline Lourenço de Araujo Oliveira",
      304: "Gustavo Leonidas da Silva Almeida",
      305: "Luccas de Andrade Pires",
      343: "Rennan Sampaio Taioqui"
    };

    const contagem = {};
    Object.values(tecnicos).forEach(n => contagem[n] = 0);

    for (const chamado of todos) {
      const idTec = chamado.id_tecnico;
      const status = chamado.status;
      // id_tecnico pode vir como string ou number — normalize
      const idTecNum = Number(idTec);
      if (tecnicos[idTecNum] && String(status) === "EN") {
        contagem[tecnicos[idTecNum]] += 1;
      }
    }

    // criar mensagem formatada
    let mensagem = "📊 *Relatório Diário - Terceirizada Comercial*\n━━━━━━━━━━━━━━━━━━━━━━\n";
    const total = Object.values(contagem).reduce((s,v)=>s+v,0);
    for (const [nome, qtd] of Object.entries(contagem)) {
      const emoji = nome.includes("Aline") ? "👩🏻‍💼" : "👨🏻‍💼";
      const plural = qtd === 1 ? "chamado" : "chamados";
      mensagem += `${emoji} *${nome.split(" ")[0]}*: ${qtd} ${plural}\n`;
    }
    mensagem += "━━━━━━━━━━━━━━━━━━━━━━\n";
    mensagem += `📦 *Total geral:* ${total} chamados encaminhados\n`;

    // enviar pro grupo
    try {
      await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
      console.log("✅ Relatório diário enviado.");
    } catch (err) {
      console.error("❌ Erro ao enviar relatório WhatsApp:", err.message || err);
    }
  } catch (err) {
    console.error("❌ Erro ao contar chamados terceirizada:", err.response?.status || err.message || err);
  }
}
