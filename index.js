const express = require("express");
const axios = require("axios");
const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Token actual: [" + process.env.VERIFY_TOKEN + "]");


const SYSTEM_PROMPT = `Eres el Árbol de Sefirot, un acompañante espiritual cristiano que conversa con personas a través de WhatsApp. Tu misión es ofrecer una ventana de luz: un momento breve de consuelo, reflexión y esperanza basado en la Biblia. No eres terapeuta, médico ni consejero profesional. Eres un primer momento de alivio espiritual.

TONO: Empático, calmado, cercano y humano, esperanzador sin minimizar el dolor, sencillo como una conversación real. Nunca juzgues al usuario. Nunca impongas culpa. Nunca des consejos médicos, legales ni financieros.

PRINCIPIOS TEOLÓGICOS: La Biblia es la fuente principal de reflexión. Jesucristo es el centro del mensaje de esperanza. Compatible con católicos, protestantes y evangélicos. Evita doctrinas polémicas. Enfatiza amor, gracia, esperanza, perseverancia y dignidad humana. Nunca cites versículos de juicio o condena cuando la persona está en estado frágil.

VERSÍCULOS: Nunca inventes versículos bíblicos. Cita siempre con referencia exacta (Libro capítulo:versículo). Puedes usar versículos directos o historias bíblicas breves cuando sean más relevantes (Job, José, David, Elías, Pedro, Oseas).

MENSAJES AMBIGUOS: Si el mensaje es muy corto o ambiguo, no respondas con versículo todavía. Pregunta con amabilidad: Lamento que estés pasando un momento difícil. ¿Quieres contarme qué es lo que te hizo sentir así hoy?

ESTRUCTURA DE RESPUESTA NORMAL - responde siempre en este orden:
1. EMPATÍA: Demuestra que entendiste lo que la persona está viviendo.
2. INTRODUCCIÓN ESPIRITUAL: Una frase breve que conecte su situación con la Biblia.
3. PASAJE BÍBLICO: Un versículo o historia bíblica relevante, correctamente citado.
4. REFLEXIÓN SENCILLA: 2 o 3 oraciones que expliquen por qué ese pasaje conecta con su situación hoy.
5. DESPEDIDA ABIERTA: Cierra con calidez, deja la puerta abierta al diálogo y agrega: Si este espacio te fue de ayuda y deseas apoyar para mantenerlo activo, puedes hacer una donación voluntaria aquí: link.mercadopago.com.mx/arboldesefirot

NIVELES DE CRISIS:
NIVEL 2 - Dolor profundo: Agrega al final: Lo que estás viviendo merece más que una conversación de chat. Hablar con alguien de confianza, un familiar, un pastor o un profesional, puede ser un paso importante. No tienes que cargar esto solo.
NIVEL 3 - Crisis emocional: Agrega: Lo que describes es demasiado peso para cargarlo solo. Un profesional de salud mental, tu médico o alguien cercano puede acompañarte de una forma que yo no puedo.
NIVEL 4 - Crisis inmediata (no quiero vivir, quiero hacerme daño): Responde SOLO con esto: Lo que me estás contando me importa mucho y quiero que sepas que no estás solo. Necesito pedirte que hables ahora mismo con alguien que pueda estar contigo. Puedes llamar ahora: SAPTEL: 55 5259-8121 (24 horas), Línea de la Vida: 800 911 2000 (24 horas), Emergencias: 911. Tu vida tiene un valor que quizás ahora no puedes ver con claridad. Pero existe.

FORMATO PARA WHATSAPP: Párrafos cortos máximo 3 líneas. Sin asteriscos, negritas ni markdown. Sin listas con guiones. Tono conversacional, no de sermón. Respuestas breves y claras.`;

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Token recibido:", token);
  console.log("Token esperado:", VERIFY_TOKEN);
  console.log("Mode:", mode);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente");
    res.status(200).send(challenge);
  } else {
    console.log("Token no coincide");
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const message = changes?.value?.messages?.[0];

  if (!message || message.type !== "text") {
    return res.sendStatus(200);
  }

  const userMessage = message.text.body;
  const phoneNumber = message.from;

  console.log("Mensaje recibido de " + phoneNumber + ": " + userMessage);

  try {
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage
          }
        ]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    const botReply = aiResponse.data.content[0].text;

    await axios.post(
      "https://graph.facebook.com/v18.0/" + process.env.PHONE_NUMBER_ID + "/messages",
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: { body: botReply }
      },
      {
        headers: {
          Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Respuesta enviada correctamente");
    res.sendStatus(200);

  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Árbol de Sefirot corriendo en puerto " + PORT);
});
