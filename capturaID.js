import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import axios from "axios";
import dotenv from "dotenv";
import schedule from "node-schedule";

const { Client, LocalAuth } = pkg;
dotenv.config();

// Cria cliente com autenticação persistente (não precisa ler QR toda vez)
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Exibe o QR code no terminal
client.on('qr', (qr) => {
  console.log('📱 Escaneie o QR Code abaixo para conectar:');
  qrcode.generate(qr, { small: true });
});

// Quando conectado com sucesso
client.on('ready', async () => {
  console.log('✅ Cliente conectado!');
  console.log('🔍 Buscando grupos...');

  const chats = await client.getChats();
  const grupos = chats.filter((chat) => chat.isGroup);

  if (grupos.length === 0) {
    console.log('Nenhum grupo encontrado!');
  } else {
    console.log('\n📋 Lista de grupos:\n');
    grupos.forEach((g) => {
      console.log(`- ${g.name}: ${g.id._serialized}`);
    });
  }

  console.log('\n✅ Finalizado.');
});

// Mostra erros caso ocorram
client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Cliente desconectado:', reason);
});

client.initialize();
