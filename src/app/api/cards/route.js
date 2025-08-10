import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // не кешувати на верселі
const ORIGIN = process.env.ALLOW_ORIGIN || "*";

/** Допоміжний JSON-відповідач з CORS */
function corsJson(data, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "cache-control": "no-store",
    },
  });
}
export function OPTIONS() {
  return corsJson({ ok: true }, 204);
}

/** Основний генератор карток */
async function generateCards({ topic, level, count, native }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
You are an English teacher. Create ${count} simple flashcards on the topic "${topic}" for level ${level}.
Return **strict JSON** ONLY, with this shape:

{
  "cards": [
    {
      "word": "string (English word/phrase)",
      "translation": "string (translation to ${native})",
      "example_en": "string (simple English sentence with the word)",
      "example_native": "string (translation of the sentence to ${native})"
    }
  ]
}

Constraints:
- No markdown, no comments, no extra text.
- The JSON must parse with JSON.parse() without errors.
- Keep sentences short, friendly and useful for learners.
`;

  const res = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    response_format: { type: "json_object" },
  });

  const raw = res.output_text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Спроба вичистити зайве, якщо модель щось додала
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("Bad JSON from model");
    }
  }

  if (!parsed?.cards?.length) throw new Error("No cards in model output");
  return parsed.cards;
}

/** Спільний хендлер (GET/POST) */
async function handle(req) {
  try {
    // пріоритет: body → query
    let params = {};
    try {
      params = await req.json();
    } catch (_) {
      // якщо не JSON — читаємо query
      const q = req.nextUrl.searchParams;
      params = {
        topic: q.get("topic"),
        level: q.get("level"),
        count: q.get("count"),
        native: q.get("native"),
      };
    }

    const topic = (params.topic || "daily life").toString();
    const level = (params.level || "A2").toString();
    const count = Math.max(1, Math.min(30, parseInt(params.count || 8, 10)));
    const native = (params.native || "uk").toString();

    if (!process.env.OPENAI_API_KEY) {
      return corsJson({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const cards = await generateCards({ topic, level, count, native });
    return corsJson({ ok: true, cards });
  } catch (e) {
    console.error("API /cards error:", e);
    return corsJson(
      { error: "Server error", detail: String(e?.message || e) },
      500
    );
  }
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}
