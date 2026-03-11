const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("Arbol de Sefirot activo. Token: [" + process.env.VERIFY_TOKEN + "]");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Mode: " + mode);
  console.log("Token recibido: [" + token + "]");
  console.log("Token esperado: [" + VERIFY_TOKEN + "]");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado");
    res.status(200).send(challenge);
  } else {
    console.log("Verificacion fallida");
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("POST recibido:", JSON.stringify(body));

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

  console.log("Mensaje de " + phoneNumber + ": " + userMessage);

  try {
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: "Eres el Arbol de Sefirot, un acompanante espiritual cristiano por WhatsApp. Escucha a la persona, muestra empatia, conecta su situacion con un pasaje biblico relevante, explica brevemente su significado y despidete con calidez. Nunca inventes versiculos. Usa parrafos cortos sin formato markdown.",
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

    console.log("Respuesta enviada");
    res.sendStatus(200);

  } catch (error) {
    console.error("Error: " + (error.response ? JSON.stringify(error.response.data) : error.message));
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Arbol de Sefirot corriendo en puerto " + PORT);
});
