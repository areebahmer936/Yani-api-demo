const UPSTREAM_URL = "https://ai.ecovis.yanipro.ai/apis/chat/database";
const MAX_HISTORY_MESSAGES = 10;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(body) {
  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString("utf-8"));
  }

  return body;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim(),
    }))
    .filter((message) => message.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function buildContextualQuestion(question, messages) {
  const normalizedQuestion = String(question || "").trim();
  const normalizedMessages = normalizeMessages(messages);

  if (!normalizedMessages.length) {
    return normalizedQuestion;
  }

  const history = normalizedMessages
    .slice(0, -1)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");

  if (!history) {
    return normalizedQuestion;
  }

  return [
    "Continue this chat using the prior conversation as context.",
    "",
    "Conversation history:",
    history,
    "",
    `Latest user message: ${normalizedQuestion}`,
    "",
    "Answer the latest user message while staying consistent with the conversation above.",
  ].join("\n");
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      status: "error",
      code: 405,
      message: "Method not allowed",
      data: null,
    });
  }

  if (!process.env.YANI_API_KEY) {
    return res.status(500).json({
      status: "error",
      code: 500,
      message: "YANI_API_KEY is not configured",
      data: null,
    });
  }

  let payload;
  try {
    payload = parseBody(req.body);
  } catch {
    return res.status(400).json({
      status: "error",
      code: 400,
      message: "Invalid JSON body",
      data: null,
    });
  }

  try {
    const upstreamPayload = {
      user_id: payload?.user_id,
      question: buildContextualQuestion(payload?.question, payload?.messages),
    };

    const upstreamResponse = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": process.env.YANI_API_KEY,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const text = await upstreamResponse.text();

    try {
      const json = JSON.parse(text);
      return res.status(upstreamResponse.status).json(json);
    } catch {
      res.status(upstreamResponse.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(text);
    }
  } catch (error) {
    return res.status(502).json({
      status: "error",
      code: 502,
      message: error instanceof Error ? error.message : "Upstream request failed",
      data: null,
    });
  }
};