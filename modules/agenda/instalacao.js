import axios from "axios";
import dotenv from "dotenv";
import schedule from "node-schedule";
import { enviarWhatsApp } from "../whatsappClient.js";

dotenv.config();

const TOKEN_API = process.env.TOKEN_API;
const BASE_URL = process.env.URL_IXC;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_COMERCIAL;

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: TOKEN_API,
  ixcsoft: "listar",
};

const LIMITE_PF = 50;
const LIMITE_PJ = 4;

const ASSUNTOS_PF = [244, 612, 600, 541, 523, 318];
const ASSUNTOS_PJ = [4];

// =============================
// FUNÇÕES AUXILIARES
// =============================

async function buscarChamados(assuntoId) {
  const url = `${BASE_URL}/su_oss_chamado`;
  const payload = {
    qtype: "id_assunto",
    query: assuntoId,
    oper: "=",
    page: "1",
    rp: "9999",
  };

  try {
    const { data } = await axios.post(url, payload, { headers: HEADERS });
    return data.registros || [];
  } catch (err) {
    console.error(`❌ Erro ao buscar chamados (${assuntoId}):`, err.message);
    return [];
  }
}

async function buscarChamadosMulti(assuntos) {
  const todos = [];
  for (const id of assuntos) {
    const res = await buscarChamados(String(id));
    todos.push(...res);
  }
  return todos;
}

function gerarLinhasAgenda(chamados, limite, titulo, emoji) {
  const agendados = chamados.filter(
    (c) => c.data_agenda && ["AG", "EN"].includes(String(c.status).toUpperCase())
  );

  const contador = {};
  for (const c of agendados) {
    const data = c.data_agenda.split(" ")[0];
    contador[data] = (contador[data] || 0) + 1;
  }

  const hoje = new Date();
  const linhas = [`${emoji} *${titulo}*`, ""];

  for (let i = 1; i <= 9; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (d.getDay() === 0) continue; // ignora domingo

    const dataKey = d.toISOString().split("T")[0];
    const qtd = contador[dataKey] || 0;
    const limiteDia = d.getDay() === 6 && titulo.includes("PF") ? 20 : limite; // sábado PF tem limite menor
    const dataFmt = d.toLocaleDateString("pt-BR");

    const status =
      qtd >= limiteDia
        ? `🔴 Agenda Excedida: ${qtd}`
        : `🟢 Agendamentos do Dia: ${qtd}`;
    linhas.push(`- ${dataFmt}: ${status}`);
  }

  linhas.push("");
  return linhas;
}

// =============================
// GERAÇÃO UNIFICADA DA AGENDA
// =============================

export async function gerarAgendaInstalacoesUnificada() {
  try {
    console.log("📆 Gerando agenda unificada de instalações...");

    // Buscar chamados PF e PJ em paralelo
    const [pfChamados, pjChamados] = await Promise.all([
      buscarChamadosMulti(ASSUNTOS_PF),
      buscarChamadosMulti(ASSUNTOS_PJ),
    ]);

    // Se nenhum dado encontrado, não envia nada
    if (pfChamados.length === 0 && pjChamados.length === 0) {
      console.log("⚠️ Nenhum agendamento encontrado, nada será enviado.");
      return;
    }

    // Montar mensagem completa
    let mensagem = `🗓️✨ *Agenda de Instalações Atualizada:* ✨🗓️\n\n`;

    mensagem += gerarLinhasAgenda(
      pfChamados,
      LIMITE_PF,
      "🏠 Instalações PF + Rede MESH:",
      ""
    ).join("\n");

    mensagem += gerarLinhasAgenda(
      pjChamados,
      LIMITE_PJ,
      "🏢 Instalações PJ:",
      ""
    ).join("\n");

    mensagem += "\nInstalações retiradas por base do sistema IXC.";

    // Enviar mensagem via WhatsApp
    await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
    console.log("✅ Agenda Unificada enviada no WhatsApp.");
  } catch (err) {
    console.error("❌ Erro ao gerar agenda unificada:", err.message);
  }
}