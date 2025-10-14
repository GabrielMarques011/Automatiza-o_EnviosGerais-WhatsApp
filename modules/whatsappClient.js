import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

export const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ WhatsApp conectado."));

export async function enviarWhatsApp(groupId, mensagem) {
  try {
    await client.sendMessage(groupId, mensagem);
    console.log("✅ Mensagem enviada!");
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem:", err.message);
  }
}

client.initialize();
