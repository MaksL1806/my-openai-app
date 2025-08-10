// src/app/api/cards/route.js
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

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        // У Responses API параметр перенесено сюди:
        text: { format: "json" },
      }),
    });

    const data = await r.json();

    // Якщо OpenAI повернув помилку — віддамо її як є, щоб бачити причину
    if (!r.ok) {
      return corsJson(
        { error: data?.error?.message || "OpenAI error", data },
        r.status
      );
    }

    // Responses API повертає текст тут
    const text = (data?.output_text ?? "").trim();
    if (!text) {
      return corsJson({ error: "Empty output_text", data }, 502);
    }

    // Очікуємо JSON від моделі
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // показуємо сирий текст, щоб було видно що саме відповіла модель
      return corsJson({ error: "Bad JSON from model", rawText: text }, 500);
    }

    return corsJson(parsed, 200);
  } catch (e) {
    // максимум інформації у відповідь, щоб знайти причину
    return corsJson({ error: "Server error", detail: String(e) }, 500);
  }
}
