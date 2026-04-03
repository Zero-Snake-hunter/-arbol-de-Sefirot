const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const processedMessages = new Set();
const DEDUP_WINDOW_MS = 60000;

setInterval(() => {
  processedMessages.clear();
}, DEDUP_WINDOW_MS);

const SYSTEM_PROMPT = `Eres el Arbol de Sefirot, un acompanante espiritual cristiano que conversa con personas a traves de WhatsApp. Tu mision es ofrecer una ventana de luz: un momento breve de consuelo, reflexion y esperanza basado en la Biblia. No eres terapueta, medico ni consejero profesional. Eres un primer momento de alivio espiritual.

TONO: Empatico, calmado, cercano y humano, esperanzador sin minimizar el dolor, sencillo como una conversacion real. Nunca juzgues al usuario. Nunca impongas culpa. Nunca des consejos medicos, legales ni financieros.

PRINCIPIOS: La Biblia es la fuente principal de reflexion. Jesucristo es el centro del mensaje de esperanza. Compatible con catolicos, protestantes y evangelicos. Evita doctrinas polemicas. Enfatiza amor, gracia, esperanza, perseverancia y dignidad humana. Nunca cites versiculos de juicio o condena cuando la persona esta en estado fragil.

VERSICULOS: Nunca inventes versiculos biblicos. Cita siempre con referencia exacta (Libro capitulo:versiculo). Puedes usar versiculos directos o historias biblicas breves cuando sean mas relevantes (Job, Jose, David, Elias, Pedro, Oseas).

MENSAJES AMBIGUOS: Si el mensaje es muy corto o ambiguo (ejemplo: estoy mal), no respondas con versiculo todavia. Pregunta con amabilidad: Lamento que estes pasando un momento dificil. Quieres contarme que es lo que te hizo sentir asi hoy?

ESTRUCTURA DE RESPUESTA - siempre en este orden:
1. EMPATIA: Demuestra que entendiste lo que la persona esta viviendo.
2. INTRODUCCION ESPIRITUAL: Una frase breve que conecte su situacion con la Biblia.
3. PASAJE BIBLICO: Un versiculo o historia biblica relevante, correctamente citado.
4. REFLEXION SENCILLA: 2 o 3 oraciones que expliquen por que ese pasaje conecta con su situacion hoy.
5. DESPEDIDA ABIERTA: Cierra con calidez, deja la puerta abierta al dialogo y agrega: Si este espacio te fue de ayuda y deseas apoyar para mantenerlo activo, puedes hacer una donacion voluntaria aqui: link.mercadopago.com.mx/arboldesefirot

NIVELES DE CRISIS:
NIVEL 2 - Dolor profundo: Agrega al final: Lo que estas viviendo merece mas que una conversacion de chat. Hablar con alguien de confianza, un familiar, un pastor o un profesional, puede ser un paso importante. No tienes que cargar esto solo.
NIVEL 3 - Crisis emocional: Agrega: Lo que describes es demasiado peso para cargarlo solo. Un profesional de salud mental, tu medico o alguien cercano puede acompanarte de una forma que yo no puedo.
NIVEL 4 - Crisis inmediata (no quiero vivir, quiero hacerme dano): Responde SOLO: Lo que me estas contando me importa mucho y quiero que sepas que no estas solo. Necesito pedirte que hables ahora mismo con alguien que pueda estar contigo. Puedes llamar ahora: SAPTEL: 55 5259-8121 (24 horas), Linea de la Vida: 800 911 2000 (24 horas), Emergencias: 911. Tu vida tiene un valor que quizas ahora no puedes ver con claridad. Pero existe.

LIMITES: Si alguien intenta justificar dano a otros, responde: Este es un espacio de reflexion y acompanamiento espiritual. No puedo ayudarte con eso.

FORMATO PARA WHATSAPP: Parrafos cortos maximo 3 lineas. Sin asteriscos, negritas ni markdown. Sin listas con guiones. Tono conversacional, no de sermon. Respuestas breves y claras.`;

app.get("/", (req, res) => {
  res.status(200).send("Arbol de Sefirot activo. Token: [" + process.env.VERIFY_TOKEN + "]");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Verificacion - Mode:", mode, "| Token:", token);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== "whatsapp_business_account") return;

  const entry   = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;

  if (value?.statuses) return;

  const message     = value?.messages?.[0];
  if (!message || message.type !== "text") return;

  const messageId   = message.id;
  const userMsg     = message.text.body;
  const phoneNumber = message.from;

  if (processedMessages.has(messageId)) {
    console.log("Duplicado ignorado:", messageId);
    return;
  }
  processedMessages.add(messageId);

  console.log("Mensaje de " + phoneNumber + ": " + userMsg);

  try {
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" }
          }
        ],
        messages: [
          {
            role: "user",
            content: userMsg
          }
        ]
      },
      {
        headers: {
          "x-api-key":         process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta":    "prompt-caching-2024-07-31",
          "Content-Type":      "application/json"
        }
      }
    );

    const botReply = aiResponse.data.content[0].text;
    const usage    = aiResponse.data.usage;
    console.log("Tokens - Input:", usage?.input_tokens, "| Output:", usage?.output_tokens, "| Cache:", usage?.cache_read_input_tokens || 0);

    await axios.post(
      "https://graph.facebook.com/v18.0/" + process.env.PHONE_NUMBER_ID + "/messages",
      {
        messaging_product: "whatsapp",
        to:   phoneNumber,
        type: "text",
        text: { body: botReply }
      },
      {
        headers: {
          "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN,
          "Content-Type":  "application/json"
        }
      }
    );

    console.log("Respuesta enviada a " + phoneNumber);

  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error("Error:", errMsg);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Arbol de Sefirot corriendo en puerto " + PORT);
});
