import dotenv from "dotenv";
import schedule from "node-schedule";
import { client } from "./modules/whatsappClient.js";
import { retencao } from "./modules/retencao.js";
import { upgrade } from "./modules/upgrade.js";
import { solucionados } from "./modules/solucionado.js";

import { envioReag } from "./modules/suporte/envioReag.js";
import { envioSIP } from "./modules/suporte/envioSIP.js";
import { envioTer } from "./modules/suporte/envioTer.js";
import { envioPPPoE } from "./modules/suporte/envioPPPoE.js";
import { distribuirFeed } from "./modules/suporte/envioFeed.js";

import { contarChamadosTerceirizada, distribuicaoComercial } from "./modules/comercial/envioCom.js";
import { gerarAgendaInstalacoesUnificada } from "./modules/agenda/instalacao.js";
import { contarFinalizados } from "./modules/suporte/contarFinalizados.js";
import distribuicaoVendaAvulsa from "./modules/comercial/distribuicaoVendaAvulsa.js";
import distribuicaoTrocaPlano from "./modules/comercial/distribuicaoTrocaPlano.js";
import { envioConfirmacao } from "./modules/suporte/envioConfirmacao.js";

dotenv.config();

client.on("ready", async () => {
  console.log("🚀 Bot ativo e pronto!");
  const token = process.env.TOKEN_API;
  //await executarRotinaEnvios(token);
  //await executarRotinaCompleta(token);
  //await executarRotinaComercial(token);
  //await executarRotinaFeed(token);
  //await executarRotinaAgenda(token);
  
  await testes(token);

  // Executar rotina completa 1-1h
  schedule.scheduleJob("0 6-21 * * *", async () => {
    console.log("⏰ Executando rotina completa (retencao/upgrade/solucionados)...");
    await executarRotinaAgenda(token);
  });

  // Executar rotina completa 18h
  schedule.scheduleJob("0 18 * * *", async () => {
    console.log("⏰ Executando rotina completa (retencao/upgrade/solucionados)...");
    await executarRotinaFeed(token);
  });

  // Executar rotina completa 8h, 16h e 21h
  schedule.scheduleJob("0 8,16,21 * * *", async () => {
    console.log("⏰ Executando rotina completa (retencao/upgrade/solucionados)...");
    await executarRotinaCompleta(token);
  });

  // Executar rotinas específicas de 10 em 10 minutos (06h às 21h)
  schedule.scheduleJob("*/10 6-21 * * *", async () => {
    console.log("🔄 Executando rotinas de envio (Ter/Reag/PPPoE/SIP)...");
    await executarRotinaEnvios(token);
    await executarRotinaComercial(token);

    await testes(token);
  });
});

async function executarRotinaCompleta(token) {
  try {
    
    await retencao(token);
    await upgrade(token);
    await solucionados(token);

    await contarChamadosTerceirizada(token);

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err.message);
  }
}

async function executarRotinaEnvios(token) {
  try {

    await envioTer();
    await envioReag(token);
    await envioPPPoE(token);
    await envioSIP(token);
    
    await distribuicaoVendaAvulsa();
    await distribuicaoTrocaPlano();

  } catch (err) {
    console.error("❌ Erro na rotina de envios:", err.message);
  }
}

async function executarRotinaComercial(token) {
  try {
    
    await distribuicaoComercial(token);

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err.message);
  }
}

async function executarRotinaFeed(token) {
  try {
    
    await distribuirFeed(token);

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err.message);
  }
}

async function executarRotinaAgenda(token) {
  try {

    await gerarAgendaInstalacoesUnificada();

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err.message);
  }
}

async function testes(token) {
  try {

    await envioConfirmacao();

  } catch (err) {
    console.error("❌ Erro na rotina completa:", err.message);
  }
}