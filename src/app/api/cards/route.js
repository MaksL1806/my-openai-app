// src/app/api/cards/route.js
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// Дозволений фронтовий домен (для CORS)
const ORIGIN = process.env.ALLOW_ORIGIN || "*";

// Ініціалізація OpenAI SDK (ключ у Vercel: OPENAI_API_KEY)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

/** CORS preflight */
export function OPTIONS() {
  return corsJson({ ok: true }, 200);
}

/** POST /api/cards */
export async function POST(req) {
  if (!process.env.OPENAI_API_KEY) {
    return corsJson({ error: "Missing OPENAI_API_KEY" }, 500);
  }

  const raw = await req.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return corsJson({ error: "Bad JSON from client", raw }, 400);
  }

  const { topic = "daily life", level = "A2", count = 8, style = "kid" } = body;

  const schema = `{
    "cards": [
      {
        "word": "string (one English word)",
        "translation": "string (Ukrainian)",
        "example_en": "string",
        "example_uk": "string",
        "pos": "string",
        "ipa": "string"
      }
    ]
  }`;

  const prompt = `
You are an ESL teacher. Create ${count} flashcards for an ${level} learner on the topic "${topic}" in a playful style "${style}".

Each flashcard must have:
- word: one English word (lowercase, no quotes)
- translation: Ukrainian translation of the word
- example_en: a short simple English sentence using the word
- example_uk: Ukrainian translation of the example
- pos: part of speech (noun/verb/adj/etc.)
- ipa: IPA transcription of the word (e.g., /ˈhɛləʊ/)

Return ONLY valid JSON that EXACTLY matches this schema (no markdown, no code fences):
${schema}

Keep outputs short and age-appropriate if "style" implies kids.
If you cannot follow the schema, still return valid JSON with "cards": [].
  `.trim();

  try {
    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      text: { format: "json" }, // 👈 новий параметр, text: { format: "json" }
    });

    const text = (completion.output_text || "").trim();
    if (!text) {
      return corsJson(
        { error: "Empty response from model", raw: completion },
        502
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return corsJson(
        { error: "Model did not return valid JSON", raw: text },
        502
      );
    }

    if (!parsed?.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      return corsJson({ error: "No cards in response", raw: parsed }, 502);
    }

    return corsJson(parsed, 200);
  } catch (e) {
    console.error("OpenAI error:", e);
    return corsJson({ error: "Server error", detail: String(e) }, 500);
  }
}
