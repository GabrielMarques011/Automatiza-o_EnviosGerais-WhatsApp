import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Função para buscar tickets solucionados nos últimos N meses
export async function fetchTicketsDetalhadoPorMeses(query, campoTecnico, idsReferencia, token, meses = 1) {
  const targetMonths = getLastMonths(meses);
  const headers = { 'Authorization': token, 'Content-Type': 'application/json', 'ixcsoft': 'listar' };
  const contagem = {};
  idsReferencia.forEach(id => contagem[id] = { total: 0, assuntos: {} });

  let page = 1;
  while (true) {
    const body = {
      qtype: "id_assunto",
      query: query.toString(),
      oper: "=",
      page: page.toString(),
      rp: "2000",
      sortname: "id",
      sortorder: "asc"
    };

    try {
      const res = await axios.post(`${process.env.URL_IXC}/su_ticket`, body, { headers });
      const registros = res.data.registros || [];

      registros.forEach(r => {
        const tec_id = parseInt(r[campoTecnico] || 0);
        const assuntoId = parseInt(r.id_assunto);
        const dataFechamento = parseYearMonthFromDateTime(r.data_fechamento);
        
        // Verifica se está em algum dos meses alvo
        const estaNoPeriodo = targetMonths.some(mes => 
          dataFechamento && 
          dataFechamento.year === mes.year && 
          dataFechamento.month === mes.month
        );

        if (r.status === "F" && contagem[tec_id] !== undefined && estaNoPeriodo) {
          contagem[tec_id].total++;
          if (!contagem[tec_id].assuntos[assuntoId]) contagem[tec_id].assuntos[assuntoId] = 0;
          contagem[tec_id].assuntos[assuntoId]++;
        }
      });

      if (page * 2000 >= (res.data.total || 0) || registros.length < 2000) break;
      page++;
    } catch (err) {
      console.error("❌ Erro ao buscar tickets por meses:", err.message);
      break;
    }
  }

  return contagem;
}

// Função para buscar OSS solucionadas nos últimos N meses
export async function fetchOSSSolucionadosPorMeses(query, label, token, meses = 1) {
  const targetMonths = getLastMonths(meses);
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
      sortname: "id",
      sortorder: "asc"
    };

    try {
      const res = await axios.post(`${process.env.URL_IXC}/su_oss_chamado`, body, { headers });
      const registros = res.data.registros || [];

      registros.forEach(r => {
        const tec_id = parseInt(r.id_tecnico_encerramento || r.id_tecnico || 0);
        const dataFechamento = parseYearMonthFromDateTime(r.data_fechamento);
        
        // Verifica se está em algum dos meses alvo
        const estaNoPeriodo = targetMonths.some(mes => 
          dataFechamento && 
          dataFechamento.year === mes.year && 
          dataFechamento.month === mes.month
        );

        if (r.status === "F" && contagem[tec_id] !== undefined && estaNoPeriodo) {
          contagem[tec_id].total++;
          if (!contagem[tec_id].assuntos[label]) contagem[tec_id].assuntos[label] = 0;
          contagem[tec_id].assuntos[label]++;
        }
      });

      if (page * 2000 >= (res.data.total || 0) || registros.length < 2000) break;
      page++;
    } catch (err) {
      console.error("❌ Erro ao buscar OSS por meses:", err.message);
      break;
    }
  }

  return contagem;
}

// Funções auxiliares
function getLastMonths(meses) {
  const now = new Date();
  const months = [];
  
  for (let i = 0; i < meses; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      nome: date.toLocaleString("pt-BR", { month: "long", year: "numeric" })
    });
  }
  
  return meses === 1 ? [months[0]] : months.reverse();
}

function parseYearMonthFromDateTime(dtString) {
  if (!dtString) return null;
  const m = dtString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}