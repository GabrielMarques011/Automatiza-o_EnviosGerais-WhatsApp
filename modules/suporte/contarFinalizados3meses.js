// modules/contarFinalizados.js
import axios from "axios";

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

function getLastThreeMonths() {
  const now = saoPauloNow();
  const months = [];
  
  for (let i = 0; i < 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      nome: date.toLocaleString("pt-BR", { month: "long", year: "numeric" })
    });
  }
  
  return months.reverse(); // Ordena do mais antigo para o mais recente
}

// Função base para contar finalizados - reutilizável
async function contarFinalizadosBase(tokenArg, targetMonths) {
  const token = tokenArg || process.env.TOKEN_API;
  if (!token) {
    console.error("❌ TOKEN_API não fornecido.");
    return null;
  }

  console.log(`📅 Analisando chamados finalizados para os meses:`, targetMonths.map(m => `${m.month}/${m.year}`));

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

  // Inicializa resultado para múltiplos meses
  const resultado = { 
    porTecnico: {}, 
    totalFinalizadosFiltrados: 0,
    meses: targetMonths.map(m => ({ ...m, total: 0 }))
  };
  
  IDS_ROTACAO.forEach(id => {
    resultado.porTecnico[id] = { 
      nome: funcionariosMap[id] || `Técnico ${id}`, 
      count: 0,
      countPorMes: targetMonths.map(() => 0)
    };
  });

  // 🔥 Para cada assunto, buscar registros finalizados e contar por técnico
  const headers = headersBase(token);
  const promises = ASSUNTOS_PERMITIDOS_IDS.map(async idAssunto => {
    let page = 1;
    const rp = 9999;
    
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

          if (o.status === "F" && dt && IDS_ROTACAO.includes(tecId)) {
            // Verificar se a data está em algum dos meses alvo
            const monthIndex = targetMonths.findIndex(m => 
              m.year === dt.year && m.month === dt.month
            );
            
            if (monthIndex !== -1) {
              resultado.porTecnico[tecId].count++;
              resultado.porTecnico[tecId].countPorMes[monthIndex]++;
              resultado.totalFinalizadosFiltrados++;
              resultado.meses[monthIndex].total++;
            }
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
  return resultado;
}

// Função original (mantida para compatibilidade)
export async function contarFinalizados(tokenArg) {
  const now = saoPauloNow();
  const targetMonths = [{
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    nome: now.toLocaleString("pt-BR", { month: "long", year: "numeric" })
  }];

  const resultado = await contarFinalizadosBase(tokenArg, targetMonths);
  
  if (resultado) {
    // Montar mensagem final resumida
    const targetMonth = targetMonths[0];
    let nomeMes = new Date(targetMonth.year, targetMonth.month - 1).toLocaleString("pt-BR", { month: "long" });
    nomeMes = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    let mensagem = `📊 *Relatório de Chamados Finalizados* 📊\n\n📅 *${nomeMes}/${targetMonth.year}*\n\n`;
    IDS_ROTACAO.forEach(id => {
      const t = resultado.porTecnico[id];
      mensagem += `👨‍🔧 *${t.nome}*: ${t.count} chamados finalizados\n`;
    });
    mensagem += `\n✅ *Total geral:* ${resultado.totalFinalizadosFiltrados}\n`;
  }

  return resultado;
}

// Nova função para últimos 3 meses
export async function contarFinalizadosUltimos3Meses(tokenArg) {
  const targetMonths = getLastThreeMonths();
  const resultado = await contarFinalizadosBase(tokenArg, targetMonths);
  
  if (resultado) {
    // Montar mensagem final resumida para 3 meses
    let mensagem = `📊 *Relatório de Chamados Finalizados - Últimos 3 Meses* 📊\n\n`;
    
    // Adicionar totais por mês
    targetMonths.forEach((mes, index) => {
      mensagem += `📅 *${mes.nome.charAt(0).toUpperCase() + mes.nome.slice(1)}*: ${resultado.meses[index].total} finalizados\n`;
    });
    
    mensagem += `\n`;

    // Adicionar totais por técnico
    IDS_ROTACAO.forEach(id => {
      const t = resultado.porTecnico[id];
      if (t.count > 0) {
        mensagem += `👨‍🔧 *${t.nome}*: ${t.count} chamados finalizados\n`;
        
        // Adicionar detalhes por mês para cada técnico
        t.countPorMes.forEach((count, index) => {
          if (count > 0) {
            const mesNome = targetMonths[index].nome.split(' de ')[0]; // Pega apenas o mês
            mensagem += `   📍 ${mesNome}: ${count}\n`;
          }
        });
        mensagem += `\n`;
      }
    });

    mensagem += `✅ *Total geral dos 3 meses:* ${resultado.totalFinalizadosFiltrados}\n`;
  }

  return resultado;
}

// Função flexível que aceita número de meses como parâmetro
export async function contarFinalizadosPorMeses(tokenArg, meses = 1) {
  if (meses === 1) {
    return await contarFinalizados(tokenArg);
  } else if (meses === 3) {
    return await contarFinalizadosUltimos3Meses(tokenArg);
  } else {
    console.warn(`⚠ Número de meses não suportado: ${meses}. Usando 1 mês como padrão.`);
    return await contarFinalizados(tokenArg);
  }
}