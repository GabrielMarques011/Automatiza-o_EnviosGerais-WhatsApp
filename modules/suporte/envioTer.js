// modules/envioTer.js
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { enviarWhatsApp } from "../whatsappClient.js";

const BASE_URL = process.env.URL_IXC;;
export const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_DEMANDAS;

const IDS_ROTACAO = [345, 359, 337, 313, 367, 307, 381, 386, 387, 389, 390];

const expedienteColaboradores = {
  307: { inicio: "06:00", fim: "16:00" },
  337: { inicio: "06:00", fim: "16:00" },
  367: { inicio: "11:00", fim: "21:00" },
  345: { inicio: "06:00", fim: "16:00" },
  359: { inicio: "06:00", fim: "13:00" },
  313: { inicio: "11:00", fim: "21:00" },
  381: { inicio: "06:00", fim: "11:00" },
  387: { inicio: "06:00", fim: "13:00" },
  386: { inicio: "16:00", fim: "21:00" },
  389: { inicio: "16:00", fim: "21:00" },
  390: { inicio: "15:00", fim: "19:00" }
};

const estagiariosSabado = {
  386: { inicio: "11:00", fim: "17:00" },
  389: { inicio: "11:00", fim: "17:00" },
  390: { inicio: "11:00", fim: "17:00" },
  387: { inicio: "06:00", fim: "13:00" },
  381: { inicio: "06:00", fim: "11:00" }
};
const grupoSabado1 = [313, 307];
const grupoSabado2 = [381, 337, 367];

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
  const day = now.getDay();
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

export async function envioTer(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) {
    console.error("❌ TOKEN_API não fornecido. Defina process.env.TOKEN_API ou passe token ao chamar envioTer.");
    return;
  }

  const headersBase = (authValue) => ({
    Authorization: authValue,
    "Content-Type": "application/json",
    ixcsoft: "listar"
  });

  try {
    const urlOss = `${BASE_URL}/su_oss_chamado`;
    const bodyOss = { qtype: "status", query: "A", oper: "=", page: "1", rp: "1000" };

    let resOss;
    try {
      resOss = await axios.post(urlOss, bodyOss, { headers: headersBase(token) });
    } catch (err) {
      const status = err.response?.status;
      console.warn("⚠ Listagem 1 falhou:", status, err.response?.data || err.message);
      if (status === 401) {
        console.log("🔄 Retentando listagem com 'Bearer ' prefix...");
        try {
          resOss = await axios.post(urlOss, bodyOss, { headers: headersBase(`Bearer ${token}`) });
        } catch (err2) {
          console.error("❌ Retentativa com Bearer também falhou:", err2.response?.status, err2.response?.data || err2.message);
          throw err2;
        }
      } else {
        throw err;
      }
    }

    const registrosOss = resOss.data?.registros || [];

    const urlAssuntos = `${BASE_URL}/su_oss_assunto`;
    const respAsc = await axios.post(urlAssuntos, { page: "1", rp: "1000" }, { headers: headersBase(token) });
    const assuntosMap = {};
    (respAsc.data?.registros || []).forEach(a => { assuntosMap[String(a.id)] = a.assunto; });

    const idAssuntoDesejado = "492";
    const filtrados = registrosOss.filter(o => String(o.id_assunto) === idAssuntoDesejado && String(o.status) === "A");
    console.log(`📌 Encontrados ${filtrados.length} chamados (assunto ${idAssuntoDesejado})`);

    if (filtrados.length === 0) return;

    const urlFunc = `${BASE_URL}/funcionarios`;
    const bodyFunc = { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" };
    let funcionariosMap = {};
    try {
      const respFunc = await axios.post(urlFunc, bodyFunc, { headers: headersBase(token) });
      (respFunc.data?.registros || []).forEach(f => { funcionariosMap[parseInt(f.id,10)] = f.funcionario; });
    } catch (err) {
      console.warn("⚠ Não foi possível obter lista de funcionarios:", err.response?.status || err.message);
    }

    let indice = await carregarIndiceAtual();
    const num = IDS_ROTACAO.length;
    const distribuicoes = {};

    for (const chamado of filtrados) {
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
        console.warn("⚠ Nenhum técnico disponível — interrompendo.");
        break;
      }

      const idChamado = chamado.id;
      const busca = { qtype: "id", query: String(idChamado), oper: "=", page: "1", rp: "1" };
      let regsDetalhado;
      try {
        const respBusca = await axios.post(`${BASE_URL}/su_oss_chamado`, busca, { headers: headersBase(token) });
        regsDetalhado = respBusca.data?.registros || [];
      } catch (err) {
        console.error("❌ erro busca detalhada:", err.response?.status || err.message);
        indice = (indice + 1) % num; await salvarIndiceAtual(indice);
        continue;
      }
      if (!regsDetalhado.length) { indice = (indice + 1) % num; await salvarIndiceAtual(indice); continue; }

      const detalhado = { ...regsDetalhado[0], id_tecnico: escolhido, status: "EN", setor: "5" };

      // Iniciando a distribuição
      try {
        const payload = {
          id_chamado: String(idChamado),
          id_setor: "5",
          id_tecnico: String(escolhido),
          id_assunto: String(detalhado.id_assunto || chamado.id_assunto),
          mensagem: "Encaminhado automaticamente pelo sistema de distribuição (Bot Marques).",
          status: "EN",
          data: new Date().toISOString().slice(0, 19).replace("T", " "),
          id_evento: "",
          latitude: "",
          longitude: "",
          gps_time: "",
          id_filial: String(detalhado.id_filial || chamado.id_filial || "1")
        };

        let authHeader = token;
        const ixUser = process.env.IXC_USER;
        const ixPass = process.env.IXC_PASS;
        if (ixUser && ixPass) {
          const b64 = Buffer.from(`${ixUser}:${ixPass}`).toString("base64");
          authHeader = `Basic ${b64}`;
        } else if (!token.startsWith("Basic ") && !token.startsWith("Bearer ")) {
          authHeader = `Basic ${token}`;
        }

        const headersSetor = {
          Authorization: authHeader,
          "Content-Type": "application/json"
        };

        const resp = await axios.post(`${BASE_URL}/su_oss_chamado_alterar_setor`, payload, { headers: headersSetor, timeout: 15000 });

        if (!(resp.status >= 200 && resp.status < 300) || resp.data?.type === "error") {
          console.error("❌ su_oss_chamado_alterar_setor retornou erro:", resp.status, resp.data);
          indice = (indice + 1) % num; await salvarIndiceAtual(indice);
          continue;
        }

        // re-fetch para confirmar alteração
        try {
          const check = await axios.post(`${BASE_URL}/su_oss_chamado`, { qtype: "id", query: String(idChamado), oper: "=", page: "1", rp: "1" }, { headers: headersBase(token) });
          const recsCheck = check.data?.registros || [];
          const novo = recsCheck[0];
          console.log(`Status após alterar_setor (re-fetch) para ${idChamado}:`, novo?.status, "id_tecnico:", novo?.id_tecnico);
          if (String(novo?.status) !== "EN" && Number(novo?.id_tecnico) !== escolhido) {
            console.warn(`⚠ Alteração feita, mas status/id_tecnico não parecem atualizados conforme esperado para ${idChamado}. Resposta do endpoint:`, resp.data);
          }
        } catch (errCheck) {
          console.warn("⚠ Não foi possível re-fetch após alterar_setor:", errCheck.response?.status || errCheck.message);
        }

      } catch (err) {
        console.error("❌ Erro ao alterar setor/status (clean):", err.response?.status || err.message || err);
        indice = (indice + 1) % num; await salvarIndiceAtual(indice);
        continue;
      }

      console.log(`✅ Chamado ${idChamado} encaminhado para técnico ${escolhido}`);

      let nomeCliente = `Cliente ${detalhado.id_cliente}`;
      try {
        const respCli = await axios.post(`${BASE_URL}/cliente`, { qtype: "id", query: String(detalhado.id_cliente), oper: "=", page: "1", rp: "1" }, { headers: headersBase(token) });
        const recs = respCli.data?.registros || [];
        if (recs.length) nomeCliente = recs[0].razao || nomeCliente;
      } catch (err) {
        console.warn("⚠ Não foi possível obter cliente:", err.message || err.response?.status);
      }

      if (!distribuicoes[escolhido]) distribuicoes[escolhido] = [];
      distribuicoes[escolhido].push({ cliente: nomeCliente, assunto_id: detalhado.id_assunto });

      indice = (indice + 1) % num;
      await salvarIndiceAtual(indice);
    }

    for (const [tecIdStr, chamados] of Object.entries(distribuicoes)) {
      const tecId = parseInt(tecIdStr, 10);
      const nomeTec = funcionariosMap[tecId] || `Técnico ${tecId}`;
      let mensagem = `⚠️ *Distribuição de Demandas Terceirizadas* ⚠️\n\n👤 *${nomeTec}*\n\n`;
      for (const info of chamados) {
        const nomeAssunto = assuntosMap[String(info.assunto_id)] || `Assunto ${info.assunto_id}`;
        mensagem += `- Cliente: ${info.cliente}\n- Assunto: ${nomeAssunto}\n\n`;
      }
      try {
        await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagem.trim());
        console.log("✅ Notificação enviada para", nomeTec);
      } catch (err) {
        console.error("❌ Erro ao enviar notificação WhatsApp:", err.message || err);
      }
    }

  } catch (err) {
    console.error("❌ Erro geral na distribuição:", err.response?.status || err.message || err);
  }
}
