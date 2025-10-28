// modules/contarFinalizados.js
import axios from "axios";
import { enviarWhatsApp } from "../whatsappClient.js";

const BASE_URL = process.env.URL_IXC;
export const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID_TESTE;

// IDs de técnicos da rotação
const IDS_ROTACAO = [345, 359, 337, 313, 367, 377, 307, 381, 306, 386, 387, 389, 390];

// IDs de assuntos permitidos
const ASSUNTOS_PERMITIDOS_IDS = [
  168, 172, 547, 176, 171, 393, 196, 545,
  258, 259, 614, 170, 192, 169, 543, 166,
  546, 544, 167
];

function headersBase(auth) {
  return { Authorization: auth, "Content-Type": "application/json", ixcsoft: "listar" };
}

function saoPauloNow() {
  const str = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(str);
}

function parseYearMonthFromDateTime(dtString) {
  if (!dtString) return null;
  const m = dtString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

export async function contarFinalizados(tokenArg) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) return console.error("❌ TOKEN_API não fornecido.");

  const now = saoPauloNow();
  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() + 1;

  console.log(`📅 Analisando chamados finalizados de ${targetMonth}/${targetYear}...`);

  // Buscar nomes de funcionários
  const funcionariosMap = {};
  try {
    const respF = await axios.post(
      `${BASE_URL}/funcionarios`,
      { qtype: "id", query: "0", oper: ">", page: "1", rp: "2000" },
      { headers: headersBase(token) }
    );
    (respF.data?.registros || []).forEach(f => {
      funcionariosMap[parseInt(f.id, 10)] = f.funcionario;
    });
  } catch (err) {
    console.warn("⚠ Não foi possível obter funcionários:", err.message);
  }

  // Inicializa resultado
  const resultado = { porTecnico: {}, totalFinalizadosFiltrados: 0 };
  IDS_ROTACAO.forEach(id => {
    resultado.porTecnico[id] = { nome: funcionariosMap[id] || `Técnico ${id}`, count: 0 };
  });

  // 🔥 Para cada assunto, buscar registros finalizados e contar por técnico
  const headers = headersBase(token);
  const promises = ASSUNTOS_PERMITIDOS_IDS.map(async idAssunto => {
    let page = 1;
    const rp = 9999; // ou ajustar conforme limite do seu servidor
    while (true) {
      const body = {
        qtype: "id_assunto",
        query: String(idAssunto),
        oper: "=",
        page: String(page),
        rp: String(rp)
      };

      try {
        const resp = await axios.post(`${BASE_URL}/su_oss_chamado`, body, { headers });
        const registros = resp.data?.registros || [];

        for (const o of registros) {
          const dt = parseYearMonthFromDateTime(o.data_fechamento);
          const tecId = parseInt(o.id_tecnico, 10);
          const clienteId = parseInt(o.id_cliente, 10);

          // 🚫 Ignorar cliente de teste (Assinante de teste)
          if (clienteId === 12174) continue;

          if (
            o.status === "F" &&
            dt &&
            dt.year === targetYear &&
            dt.month === targetMonth &&
            IDS_ROTACAO.includes(tecId)
          ) {
            resultado.porTecnico[tecId].count++;
            resultado.totalFinalizadosFiltrados++;
          }
        }

        if (registros.length < rp) break;
        page++;
      } catch (err) {
        console.warn(`⚠ Erro técnico, assunto ${idAssunto}:`, err.message);
        break;
      }
    }
  });

  await Promise.all(promises);

  // Montar mensagem final resumida
  let nomeMes = new Date(targetYear, targetMonth - 1).toLocaleString("pt-BR", { month: "long" });
  nomeMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  let mensagem = `📊 *Relatório de Chamados Finalizados* 📊\n\n📅 *${nomeMes}/${targetYear}*\n\n`;
  IDS_ROTACAO.forEach(id => {
    const t = resultado.porTecnico[id];
    mensagem += `👨‍🔧 *${t.nome}*: ${t.count} chamados finalizados\n`;
  });
  mensagem += `\n✅ *Total geral:* ${resultado.totalFinalizadosFiltrados}\n`;

  return resultado;
}
