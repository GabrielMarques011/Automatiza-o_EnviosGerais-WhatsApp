// modules/envioPPPoE.js
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { enviarWhatsApp } from "../whatsappClient.js";
//import { WHATSAPP_GROUP_ID } from "./constants.js";
export const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_DEMANDAS;

const BASE_URL = process.env.URL_IXC;
const IDS_ROTACAO = [345, 359, 337, 313, 367, 377, 307, 381, 306, 386, 387];

// expediente (mesma lógica que envioTer)
const expedienteColaboradores = {
  307: { inicio: "06:00", fim: "16:00" },
  337: { inicio: "06:00", fim: "16:00" },
  367: { inicio: "11:00", fim: "21:00" },
  345: { inicio: "06:00", fim: "16:00" },
  359: { inicio: "06:00", fim: "13:00" },
  377: { inicio: "10:00", fim: "16:00" },
  313: { inicio: "11:00", fim: "21:00" },
  381: { inicio: "06:00", fim: "11:00" },
  306: { inicio: "17:00", fim: "21:00" },
  386: { inicio: "16:00", fim: "21:00" },
  387: { inicio: "06:00", fim: "13:00" }
};
const estagiariosSabado = {
  377: { inicio: "06:00", fim: "13:00" },
  381: { inicio: "06:00", fim: "11:00" }
};
const grupoSabado1 = [313, 307];
const grupoSabado2 = [381, 337];

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
  const day = now.getDay(); // 0=domingo
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (day === 0) return false;
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
  const horario = expedienteColaboradores[tecnicoId];
  if (!horario) return false;
  return minutesNow >= timeToMinutes(horario.inicio) && minutesNow <= timeToMinutes(horario.fim);
}

async function carregarIndiceAtual() {
  const file = path.resolve(process.cwd(), "rodizio_index.txt");
  try {
    const txt = await fs.readFile(file, "utf8");
    const n = parseInt(txt, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}
async function salvarIndiceAtual(indice) {
  const file = path.resolve(process.cwd(), "rodizio_index.txt");
  await fs.writeFile(file, String(indice), "utf8");
}

function maskToken(t) {
  if (!t) return "<undefined>";
  return t.length > 10 ? `${t.slice(0,6)}...${t.slice(-4)}` : t;
}

async function tryListWithToken(url, body, token) {
  const headers = (v) => ({ Authorization: v, "Content-Type": "application/json", ixcsoft: "listar" });
  // try raw token first, then Bearer <token>
  try {
    return await axios.post(url, body, { headers: headers(token) });
  } catch (err) {
    const status = err.response?.status;
    // if 401, try with Bearer prefix
    if (status === 401) {
      try {
        return await axios.post(url, body, { headers: headers(`Bearer ${token}`) });
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
}

export async function envioPPPoE(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!BASE_URL) {
    console.error("❌ BASE_URL (process.env.URL_IXC) não configurado.");
    return;
  }
  if (!token) {
    console.error("❌ TOKEN_API não fornecido (env ou parâmetro).");
    return;
  }

  try {
    // 1) listar OSS abertos
    const urlOss = `${BASE_URL}/su_oss_chamado`;
    const bodyOss = { qtype: "status", query: "A", oper: "=", page: "1", rp: "1000" };

    let resOss;
    try {
      resOss = await tryListWithToken(urlOss, bodyOss, token);
    } catch (err) {
      console.error("❌ Erro ao listar OSS:", err.response?.status || err.message);
      return;
    }
    const registrosOss = resOss.data?.registros || [];

    // 2) assuntos map
    const urlAssuntos = `${BASE_URL}/su_oss_assunto`;
    let respAsc;
    try {
      respAsc = await tryListWithToken(urlAssuntos, { page: "1", rp: "1000" }, token);
    } catch (err) {
      console.warn("⚠️ Não foi possível obter assuntos:", err.response?.status || err.message);
      respAsc = { data: { registros: [] } };
    }
    const assuntosMap = {};
    (respAsc.data?.registros || []).forEach(a => { assuntosMap[String(a.id)] = a.assunto; });

    // 3) filtrar assunto 497 (PPPoE)
    const idAssuntoDesejado = "497";
    const filtrados = registrosOss.filter(o => String(o.id_assunto) === idAssuntoDesejado && String(o.status) === "A");
    console.log(`📌 Total chamados abertos com assunto ${idAssuntoDesejado}: ${filtrados.length}`);
    if (!filtrados.length) return;

    // 4) buscar funcionarios (nomes)
    const urlFunc = `${BASE_URL}/funcionarios`;
    const bodyFunc = { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" };
    let funcionariosMap = {};
    try {
      const respFunc = await tryListWithToken(urlFunc, bodyFunc, token);
      (respFunc.data?.registros || []).forEach(f => { funcionariosMap[parseInt(f.id,10)] = f.funcionario; });
    } catch (err) {
      console.warn("⚠️ Não foi possível obter lista de funcionarios:", err.response?.status || err.message);
    }

    // 5) rodízio e encaminhamento
    let indice = await carregarIndiceAtual();
    const num = IDS_ROTACAO.length;
    const distribuicoes = {}; // { tecId: [ { cliente, assunto_id } ] }

    for (const chamado of filtrados) {
      // encontrar técnico disponível
      let tentativas = 0;
      let escolhido = null;
      while (tentativas < num) {
        const candidato = IDS_ROTACAO[indice];
        if (dentroDoExpediente(candidato)) {
          escolhido = candidato;
          break;
        }
        indice = (indice + 1) % num;
        tentativas++;
      }
      if (!escolhido) {
        console.warn("⚠️ Nenhum técnico disponível — interrompendo rotina.");
        break;
      }

      const idChamado = chamado.id;
      // pegar detalhado
      const busca = { qtype: "id", query: String(idChamado), oper: "=", page: "1", rp: "1" };
      let regsDetalhado;
      try {
        const respBusca = await tryListWithToken(urlOss, busca, token);
        regsDetalhado = respBusca.data?.registros || [];
      } catch (err) {
        console.error("❌ erro ao buscar chamado detalhado:", err.response?.status || err.message);
        indice = (indice + 1) % num; await salvarIndiceAtual(indice);
        continue;
      }
      if (!regsDetalhado.length) { indice = (indice + 1) % num; await salvarIndiceAtual(indice); continue; }

      const detalhado = { ...regsDetalhado[0], id_tecnico: escolhido, status: "EN", setor: "5" };
      // PUT update (use token raw; alguns endpoints aceitam, se falhar, tenta com Bearer)
      try {
        const respPut = await axios.put(`${BASE_URL}/su_oss_chamado/${idChamado}`, detalhado, {
          headers: { Authorization: token, "Content-Type": "application/json" }
        });
        // se 2xx ok
        if (!(respPut.status >= 200 && respPut.status < 300)) {
          console.error("❌ PUT retornou:", respPut.status);
          indice = (indice + 1) % num; await salvarIndiceAtual(indice);
          continue;
        }
      } catch (err) {
        // tentar com Bearer se 401
        if (err.response?.status === 401) {
          try {
            const respPut2 = await axios.put(`${BASE_URL}/su_oss_chamado/${idChamado}`, detalhado, {
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
            });
            if (!(respPut2.status >= 200 && respPut2.status < 300)) {
              console.error("❌ PUT com Bearer retornou:", respPut2.status);
              indice = (indice + 1) % num; await salvarIndiceAtual(indice);
              continue;
            }
          } catch (err2) {
            console.error("❌ Erro no PUT (tentativa Bearer):", err2.response?.status || err2.message);
            indice = (indice + 1) % num; await salvarIndiceAtual(indice);
            continue;
          }
        } else {
          console.error("❌ Erro no PUT:", err.response?.status || err.message);
          indice = (indice + 1) % num; await salvarIndiceAtual(indice);
          continue;
        }
      }

      console.log(`✅ Chamado ${idChamado} encaminhado para técnico ${escolhido}`);

      // buscar cliente para montar mensagem
      let nomeCliente = `Cliente ${detalhado.id_cliente}`;
      try {
        const respCli = await tryListWithToken(`${BASE_URL}/cliente`, { qtype: "id", query: String(detalhado.id_cliente), oper: "=", page: "1", rp: "1" }, token);
        const recs = respCli.data?.registros || [];
        if (recs.length) nomeCliente = recs[0].razao || nomeCliente;
      } catch (err) {
        console.warn("⚠️ Não foi possível obter cliente:", err.response?.status || err.message);
      }

      if (!distribuicoes[escolhido]) distribuicoes[escolhido] = [];
      distribuicoes[escolhido].push({ cliente: nomeCliente, assunto_id: detalhado.id_assunto });

      // avança índice e salva
      indice = (indice + 1) % num;
      await salvarIndiceAtual(indice);
    } // end for chamados

    // 6) enviar notificações no WhatsApp (grupo) — FORMATO SOLICITADO
    for (const [tecIdStr, chamados] of Object.entries(distribuicoes)) {
      const tecId = parseInt(tecIdStr, 10);
      const nomeTec = funcionariosMap[tecId] || `Técnico ${tecId}`;
      let mensagem = `⚠️ *Envio de Demandas (PPPoE)* ⚠️\n\n👤 *${nomeTec}*\n\n`;

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

  } catch (err) {
    console.error("❌ Erro geral no envioPPPoE:", err.response?.status || err.message || err);
  }
}
