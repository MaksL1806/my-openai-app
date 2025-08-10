import OpenAI from "openai";

export const dynamic = "force-dynamic"; // щоб Vercel не кешував

const ORIGIN = process.env.ALLOW_ORIGIN || "*";

function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "cache-control": "no-store",
    },
  });
}

export function OPTIONS() {
  return corsJson({ ok: true });
}

export async function POST(req) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return corsJson({ error: "No prompt" }, 400);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      // У Responses API це правильний параметр:
      text: { format: "json" },
    });

    // ГОЛОВНЕ: беремо текст саме так
    const text = (completion.output_text ?? "").trim();
    if (!text) {
      return corsJson({ error: "Empty response from model", raw: completion }, 502);
    }

    // Спробуємо розпарсити JSON, який повернули
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return corsJson({ error: "Bad JSON from model", rawText: text }, 500);
    }

    return corsJson(parsed, 200);
  } catch (e) {
    console.error("API /api/cards error:", e);
    return corsJson({ error: "Server error", detail: String(e) }, 500);
  }
}