// helpers.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export async function fetchTicketsDetalhado(query, campoTecnico, idsReferencia, token) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

  const primeiroDiaStr = primeiroDia.toISOString().slice(0, 19).replace("T", " ");
  const ultimoDiaStr = ultimoDia.toISOString().slice(0, 19).replace("T", " ");

  const headers = { 'Authorization': token, 'Content-Type': 'application/json', 'ixcsoft': 'listar' };
  const body = {
    qtype: "id_assunto",
    query: query.toString(),
    oper: "=",
    page: "1",
    rp: "2000",
    grid_param: JSON.stringify([
      { TB: "data_criacao", OP: ">=", P: primeiroDiaStr, C: "AND", G: "data_criacao" },
      { TB: "data_criacao", OP: "<=", P: ultimoDiaStr, C: "AND", G: "data_criacao" }
    ])
  };

  try {
    const res = await axios.post(`${process.env.URL_IXC}/su_ticket`, body, { headers });
    const registros = res.data.registros || [];
    const contagem = {};
    idsReferencia.forEach(id => contagem[id] = { total: 0, assuntos: {} });

    registros.forEach(r => {
      const tec_id = parseInt(r[campoTecnico] || 0);
      const assuntoId = parseInt(r.id_assunto);
      if (contagem[tec_id] !== undefined) {
        contagem[tec_id].total++;
        if (!contagem[tec_id].assuntos[assuntoId]) contagem[tec_id].assuntos[assuntoId] = 0;
        contagem[tec_id].assuntos[assuntoId]++;
      }
    });

    return contagem;

  } catch (err) {
    console.error("❌ Erro ao buscar tickets:", err.message);
    return {};
  }
}

// NOVA FUNÇÃO PARA OS SOLUCIONADOS
export async function fetchOSSSolucionados(query, label, token) {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

  const primeiroDiaStr = primeiroDia.toISOString().slice(0, 19).replace("T", " ");
  const ultimoDiaStr = ultimoDia.toISOString().slice(0, 19).replace("T", " ");

  const headers = { 'Authorization': token, 'Content-Type': 'application/json', 'ixcsoft': 'listar' };
  const IDS_TECNICOS = [345, 359, 337, 313, 367, 377, 307, 306, 386, 387, 389, 390];
  const contagem = {};
  IDS_TECNICOS.forEach(id => contagem[id] = { total: 0, assuntos: {} });

  let page = 1;
  while (true) {
    const body = {
      qtype: "id_assunto",
      query: query.toString(),
      oper: "=",
      page: page.toString(),
      rp: "2000",
      grid_param: JSON.stringify([
        { TB: "status", OP: "=", P: "F", C: "AND", G: "status" },
        { TB: "data_fechamento", OP: ">=", P: primeiroDiaStr, C: "AND", G: "data_fechamento" },
        { TB: "data_fechamento", OP: "<=", P: ultimoDiaStr, C: "AND", G: "data_fechamento" }
      ])
    };

    try {
      const res = await axios.post(`${process.env.URL_IXC}/su_oss_chamado`, body, { headers });
      const registros = res.data.registros || [];
      registros.forEach(r => {
        const tec_id = parseInt(r.id_tecnico || 0);
        if (contagem[tec_id] !== undefined) {
          contagem[tec_id].total++;
          if (!contagem[tec_id].assuntos[label]) contagem[tec_id].assuntos[label] = 0;
          contagem[tec_id].assuntos[label]++;
        }
      });

      if (page * 2000 >= (res.data.total || 0)) break;
      page++;
    } catch (err) {
      console.error("❌ Erro ao buscar OSS:", err.message);
      break;
    }
  }

  return contagem;
}
