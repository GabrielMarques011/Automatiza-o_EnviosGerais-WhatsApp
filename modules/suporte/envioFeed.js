import axios from "axios";
import dotenv from "dotenv";
import schedule from "node-schedule";
import { enviarWhatsApp } from "../whatsappClient.js";

dotenv.config();

const TOKEN_API = process.env.TOKEN_API;
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_DEMANDAS;
const BASE_URL = "https://assinante.nmultifibra.com.br/webservice/v1";

// =====================
// Distribuição Feedbacks
// =====================
export async function distribuirFeed() {
  const headersListar = { Authorization: TOKEN_API, "Content-Type": "application/json", ixcsoft: "listar" };
  const headersPost = { Authorization: TOKEN_API, "Content-Type": "application/json" };

  // 1. Buscar chamados abertos
  const urlOss = `${BASE_URL}/su_oss_chamado`;
  const { data: dadosOss } = await axios.post(
    urlOss,
    { qtype: "status", query: "A", oper: "=", page: "1", rp: "1000" },
    { headers: headersListar }
  );
  const registrosOss = dadosOss.registros || [];

  // 2. Buscar assuntos para mapear id -> nome
  const { data: dadosAssuntos } = await axios.post(`${BASE_URL}/su_oss_assunto`, { page: "1", rp: "1000" }, { headers: headersListar });
  const assuntosMap = {};
  (dadosAssuntos.registros || []).forEach(a => { assuntosMap[String(a.id)] = a.assunto; });

  const idsAssuntoDesejados = ["205", "409"];
  const filtrados = registrosOss.filter(os => os.status === "A" && idsAssuntoDesejados.includes(os.id_assunto));

  console.log(`📌 Total chamados filtrados: ${filtrados.length}`);

  if (filtrados.length === 0) {
    console.log("🟡 Nenhum chamado para encaminhar.");
    return;
  }

  // 3. Técnicos
  const idsTecnicos = [345, 359, 337, 313, 367, 377, 307, 381, 386, 387, 389, 390];
  const distribuicoes = {};

  for (let i = 0; i < filtrados.length; i++) {
    const chamado = filtrados[i];
    const idChamado = chamado.id;

    // Buscar detalhado
    const { data: detalhadoResp } = await axios.post(
      urlOss,
      { qtype: "id", query: String(idChamado), oper: "=", page: "1", rp: "1" },
      { headers: headersListar }
    );
    const registrosDet = detalhadoResp.registros || [];
    if (!registrosDet.length) continue;

    const chamadoDetalhado = registrosDet[0];
    const tecnicoId = idsTecnicos[i % idsTecnicos.length];

    // 🔁 NOVA REQUISIÇÃO — Correta e funcional
    const payload = {
      id_chamado: idChamado,
      id_setor: "5", // Setor correto
      id_tecnico: tecnicoId,
      id_assunto: chamadoDetalhado.id_assunto,
      mensagem: "Encaminhado automaticamente pelo sistema de distribuição.",
      status: "EN",
      data: new Date().toISOString().slice(0, 19).replace("T", " "),
      id_evento: "",
      latitude: "",
      longitude: "",
      gps_time: "",
      id_filial: "1",
    };

    try {
      const { data: resp } = await axios.post(`${BASE_URL}/su_oss_chamado_alterar_setor`, payload, { headers: headersPost });

      if (resp?.type === "success") {
        if (!distribuicoes[tecnicoId]) distribuicoes[tecnicoId] = 0;
        distribuicoes[tecnicoId] += 1;
        console.log(`✅ Chamado ${idChamado} encaminhado para técnico ${tecnicoId}`);
      } else {
        console.warn(`⚠️ Falha ao encaminhar ${idChamado}:`, resp);
      }
    } catch (err) {
      console.error(`❌ Erro ao atualizar chamado ${idChamado}:`, err.message || err);
    }
  }

  if (Object.keys(distribuicoes).length === 0) {
    console.log("🟡 Nenhum chamado foi distribuído. Nenhuma mensagem enviada ao WhatsApp.");
    return;
  }

  // 4. Buscar nomes dos técnicos
  const { data: funcResp } = await axios.post(
    `${BASE_URL}/funcionarios`,
    { qtype: "id", query: "0", oper: ">", page: "1", rp: "1000" },
    { headers: headersListar }
  );
  const funcionariosMap = {};
  (funcResp.registros || []).forEach(f => { funcionariosMap[f.id] = f.funcionario; });

  // 5. Enviar notificações WhatsApp
  let mensagemFinal = "⚠️ *Resumo de Feedbacks Encaminhados* ⚠️\n\n";

  for (const [tecIdStr, total] of Object.entries(distribuicoes)) {
    const tecId = parseInt(tecIdStr, 10);
    const nomeTec = funcionariosMap[tecId] || `Técnico ${tecId}`;
    mensagemFinal += `👤 *${nomeTec}* = ${total} encaminhado${total > 1 ? "s" : ""}\n`;
  }

  await enviarWhatsApp(WHATSAPP_GROUP_ID, mensagemFinal.trim());
  console.log("✅ Notificação enviada com resumo de encaminhamentos");
}
