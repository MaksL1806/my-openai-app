// src/app/api/cards/route.ts
import OpenAI, { APIError } from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const ORIGIN = process.env.ALLOW_ORIGIN || "*";

function corsJson(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
    },
  });
}

export function OPTIONS() {
  return corsJson({});
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return corsJson(
        { error: "Missing OPENAI_API_KEY on server" },
        500
      );
    }

    // 1) Безпечний парсінг тіла
    const raw = await req.text();
    let prompt: string | undefined;

    try {
      const parsed = JSON.parse(raw || "{}");
      prompt = typeof parsed?.prompt === "string" ? parsed.prompt : undefined;
    } catch (e) {
      console.error("JSON parse error:", e);
      return corsJson({ error: "Bad JSON", raw }, 400);
    }

    if (!prompt) {
      return corsJson({ error: "No prompt in body", raw }, 400);
    }

    // 2) Виклик Responses API — БЕЗ text/response_format
    const systemHint =
      "Return ONLY valid JSON. No prose, no markdown, no code fences. The JSON must parse.";

    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: `${systemHint}\n\nTask: ${prompt}`,
    });

    // 3) Тягнемо суцільний текст з відповіді
    const text = (completion.output_text ?? "").trim();
    if (!text) {
      console.error("Empty output_text from model:", completion);
      return corsJson({ error: "Empty response from model", raw: completion }, 502);
    }

    // 4) Намагаємося розпарсити JSON
    try {
      const parsed = JSON.parse(text);
      return corsJson(parsed, 200);
    } catch {
      console.error("Model did not return valid JSON. Raw text:", text);
      return corsJson({ error: "Model did not return valid JSON", text }, 502);
    }
  } catch (err: unknown) {
    // 5) Дуже докладна діагностика
    if (err instanceof APIError) {
      console.error("OpenAI APIError:", {
        status: err.status,
        type: err.type,
        code: err.code,
        param: err.param,
        message: err.message,
        // @ts-ignore
        raw: err.error,
      });
      return corsJson(
        {
          error: "OpenAI API error",
          status: err.status,
          type: err.type,
          code: err.code,
          param: err.param,
          message: err.message,
          // @ts-ignore
          raw: err.error,
        },
        err.status ?? 500
      );
    }

    const e = err as Error;
    console.error("API /api/cards error:", e);
    return corsJson(
      { error: "Server error", detail: e.message, name: e.name, stack: e.stack },
      500
    );
  }
}
