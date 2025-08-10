// src/app/api/cards/route.js
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
const ORIGIN = process.env.ALLOW_ORIGIN || "*";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { level = "A1", topic = "daily life", count = 10 } = body || {};
    const safeCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 50);

    const prompt = `
You are an English teacher creating vocabulary flashcards.
Level: ${level}
Topic: ${topic}
Count: ${safeCount}

Return a strict JSON object with **only** this shape:
{
  "cards": [
    {
      "word": "string",
      "translation": "string",
      "example_en": "string",
      "example_uk": "string",
      "pos": "string",
      "ipa": "string"
    }
  ]
}
Do not include any commentary. JSON only.
`;

    // 👇 ЖОДНОГО response_format тут бути не повинно
    const payload = {
      model: "gpt-4o-mini",
      input: prompt,
      text: { format: "json" },     // новий параметр Responses API
    };
    console.log("DEBUG payload", JSON.stringify(payload));

    const completion = await client.responses.create(payload);

    const text =
      completion.output_text ??
      completion.output?.[0]?.content
        ?.map((c) => c?.text?.value)
        .filter(Boolean)
        .join("") ??
      "";

    if (!text.trim()) {
      return corsJson({ error: "Empty response from model", raw: completion }, 500);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return corsJson({ error: "Bad JSON from model", raw: text }, 500);
    }

    if (!parsed?.cards || !Array.isArray(parsed.cards)) {
      return corsJson({ error: "No cards in JSON", raw: parsed }, 500);
    }

    const cards = parsed.cards.map((c) => ({
      word: String(c.word || "").trim(),
      translation: String(c.translation || "").trim(),
      example_en: String(c.example_en || "").trim(),
      example_uk: String(c.example_uk || "").trim(),
      pos: String(c.pos || "").trim(),
      ipa: String(c.ipa || "").trim(),
    }));

    return corsJson({ cards });
  } catch (e) {
    console.error(e);
    return corsJson({ error: "Server error", detail: String(e) }, 500);
  }
}

export async function GET() {
  return corsJson({ ok: true, hint: "POST here with { level, topic, count }" });
}
