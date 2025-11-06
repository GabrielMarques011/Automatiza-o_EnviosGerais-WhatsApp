// modules/alertaChamados.js
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { enviarWhatsApp } from "../whatsappClient.js";

export const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_TESTE;
const BASE_URL = process.env.URL_IXC;
const TOKEN_API = process.env.TOKEN_API;
const IDS_ASSUNTOS = [167, 172, 166, 169, 168];

// Caminho do arquivo que guarda protocolos já notificados
const FILE_PATH = path.resolve(process.cwd(), "chamados_notificados.json");

function saoPauloNow() {
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(str);
}

function formatDate(dt) {
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

async function tryListWithToken(url, body, token) {
  const headers = v => ({ Authorization: v, "Content-Type": "application/json", ixcsoft: "listar" });
  try {
    return await axios.post(url, body, { headers: headers(token) });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      return await axios.post(url, body, { headers: headers(`Bearer ${token}`) });
    }
    throw err;
  }
}

async function carregarChamadosNotificados() {
  try {
    const data = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function salvarChamadosNotificados(protocolos) {
  await fs.writeFile(FILE_PATH, JSON.stringify(protocolos, null, 2), "utf8");
}

async function buscarNomeResponsavel(idResponsavel) {
  if (!idResponsavel) return "Não definido";
  try {
    const resp = await tryListWithToken(`${BASE_URL}/funcionarios`, {
      qtype: "id",
      query: String(idResponsavel),
      oper: "=",
      page: "1",
      rp: "1"
    }, TOKEN_API);

    const registros = resp.data?.registros || [];
    return registros.length ? registros[0].funcionario || "Não definido" : "Não definido";
  } catch (err) {
    console.error(`❌ Erro ao buscar responsável ${idResponsavel}:`, err.message);
    return "Não definido";
  }
}

export async function alertaChamadosRecentes() {
  const token = TOKEN_API;
  if (!BASE_URL || !token) {
    console.error("❌ Configurações inválidas: verifique URL_IXC e TOKEN_API.");
    return;
  }

  const hoje = saoPauloNow();

  // Limpar histórico se for outro dia
  const dataArquivo = await fs.stat(FILE_PATH).catch(() => null);
  if (dataArquivo) {
    const modificado = new Date(dataArquivo.mtime);
    if (modificado.toDateString() !== hoje.toDateString()) {
      await salvarChamadosNotificados([]);
      console.log("🧹 Limpando histórico de protocolos de dias anteriores.");
    }
  }

  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
  const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);

  console.log(`🔍 Filtrando chamados de hoje: ${formatDate(inicioDoDia)} até ${formatDate(fimDoDia)}`);

  const urlTickets = `${BASE_URL}/su_ticket`;

  const jaNotificados = await carregarChamadosNotificados();
  let novosProtocolos = [];

  for (const idAssunto of IDS_ASSUNTOS) {
    const body = {
      qtype: "id_assunto",
      query: String(idAssunto),
      oper: "=",
      page: "1",
      rp: "1000",
      grid_param: JSON.stringify([
        { TB: "data_criacao", OP: ">=", P: formatDate(inicioDoDia), C: "AND", G: "data_criacao" },
        { TB: "data_criacao", OP: "<=", P: formatDate(fimDoDia), C: "AND", G: "data_criacao" }
      ])
    };

    let resp;
    try {
      resp = await tryListWithToken(urlTickets, body, token);
    } catch (err) {
      console.error(`❌ Erro ao buscar chamados do assunto ${idAssunto}:`, err.message);
      continue;
    }

    const registros = resp.data?.registros || [];
    if (!registros.length) {
      console.log(`ℹ️ Nenhum chamado aberto hoje para o assunto ${idAssunto}`);
      continue;
    }

    registros.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));

    const novos = registros.filter(ch => !jaNotificados.includes(ch.protocolo) && ch.titulo !== "O.S. - Sinal fora do padrão");

    if (!novos.length) {
      console.log(`✅ Nenhum novo chamado válido para o assunto ${idAssunto} hoje.`);
      continue;
    }

    // Envio individual por chamado
    for (const ch of novos) {
      const nomeResponsavel = await buscarNomeResponsavel(ch.id_responsavel_tecnico);

      const mensagem = 
        `📢 *OS Lógica Abertos Hoje*\n\n` + //(Assunto ${idAssunto})
        `*Protocolo:* ${ch.protocolo}\n` +
        `*Título:* ${ch.titulo}\n` +
        `*Data de Abertura:* ${ch.data_criacao}\n` +
        `*Nome Responsável:* ${nomeResponsavel}\n` +
        `---------------------------------------`;

      try {
        await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
        console.log(`✅ Alerta enviado no WhatsApp (Protocolo ${ch.protocolo})`);
      } catch (err) {
        console.error("❌ Erro ao enviar alerta via WhatsApp:", err.message);
      }

      novosProtocolos.push(ch.protocolo);
    }
  }

  if (novosProtocolos.length > 0) {
    const atualizados = Array.from(new Set([...jaNotificados, ...novosProtocolos]));
    await salvarChamadosNotificados(atualizados);
    console.log(`💾 ${novosProtocolos.length} novos chamados registrados no histórico de hoje.`);
  } else {
    console.log("📭 Nenhum novo chamado para registrar hoje.");
  }
}
