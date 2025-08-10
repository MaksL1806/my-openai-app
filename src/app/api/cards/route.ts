import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const ORIGIN = process.env.ALLOW_ORIGIN || "*";
const VERSION = "cards-2025-08-10-fix-format";

function corsJson(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
      "x-app-version": VERSION,
    },
  });
}

export function OPTIONS() {
  return corsJson({});
}

export async function POST(req: Request) {
  try {
    // читаємо raw body, щоб у 400 показати, що прилетіло
    const raw = await req.text();

    let prompt: string | undefined;
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed.prompt === "string") {
        prompt = parsed.prompt;
      }
    } catch (e) {
      console.error("Bad JSON body:", raw, e);
      return corsJson({ error: "Bad JSON", raw }, 400);
    }

    if (!prompt) {
      return corsJson({ error: "No prompt provided", raw }, 400);
    }

    // ВАЖЛИВО: формат як ОБ’ЄКТ: { format: { type: "json" } }
    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      text: { format: { type: "json" } },
    });

    const out = ((completion as any).output_text ?? "").trim();
    if (!out) {
      return corsJson({ error: "Empty response from model", raw: completion }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch (e) {
      console.error("Model returned non-JSON:", out, e);
      return corsJson({ error: "Model returned non-JSON", text: out }, 502);
    }

    return corsJson(parsed, 200);
  } catch (e: any) {
    const detail = e?.response?.data ?? e?.message ?? String(e);
    console.error("API /api/cards fatal error:", e);
    return corsJson({ error: "Server error", detail }, 500);
  }
}

