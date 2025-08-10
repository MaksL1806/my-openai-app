// src/app/api/cards/route.ts
// Next.js App Router (Node runtime) — генерація карток слів через OpenAI
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // за потреби вкажіть домен Tilda
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Max-Age': '86400'
};

type RequestBody = {
  topic?: string;
  count?: number;
  targetLang?: string;
  avoid?: string[];
};

type OpenAIChoice = { message?: { content?: string } };
type OpenAIChatResponse = { choices?: OpenAIChoice[] };

type Item = {
  term: string;
  translation: string;
  example?: string;
};

function sanitizeStr(input: unknown, max = 120): string {
  return String(input ?? '').trim().slice(0, max);
}

function isItemLike(x: unknown): x is Partial<Item> {
  if (!x || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return 'term' in obj || 'translation' in obj || 'example' in obj;
}

function sanitizeItem(x: Partial<Item>): Item {
  return {
    term: sanitizeStr(x.term, 60),
    translation: sanitizeStr(x.translation, 120),
    example: sanitizeStr(x.example, 140)
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    // ---- parse request body (no 'any')
    let body: RequestBody = {};
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      body = {};
    }

    const topic = sanitizeStr(body.topic || 'general', 80);
    const count = Math.max(1, Math.min(50, Number(body.count) || 8));
    const targetLang = sanitizeStr(body.targetLang || 'uk', 10);

    // avoid terms
    const avoidInput: string[] = Array.isArray(body.avoid) ? body.avoid : [];
    const avoidSet = new Set(
      avoidInput.map(t => String(t || '').toLowerCase().trim()).filter(Boolean).slice(0, 200)
    );
    const avoidList = Array.from(avoidSet).join(', ').slice(0, 2000);

    const messages = [
      { role: 'system', content: 'You are a concise vocabulary generator. Output strict JSON.' },
      {
        role: 'user',
        content:
          `Give ${count} beginner-friendly English vocabulary items about "${topic}". ` +
          `Return JSON with key "items": [{ "term": "...", "translation": "...", "example": "..." }]. ` +
          `Translate "translation" to language code ${targetLang}. ` +
          (avoidSet.size ? `Avoid these terms entirely: [${avoidList}]. ` : '') +
          `Do not repeat; diversify parts of speech; keep examples natural and <= 8 words.`
      }
    ];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages,
        response_format: { type: 'json_object' }
      })
    });

    if (!r.ok) {
      const details = await r.text().catch(() => '');
      return new NextResponse(JSON.stringify({ error: 'OpenAI error', details }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // ---- parse OpenAI response
    const out = (await r.json()) as OpenAIChatResponse;
    const content = out?.choices?.[0]?.message?.content ?? '{}';

    let parsed: unknown = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const itemsRaw = (parsed as { items?: unknown }).items;
    const items: Item[] = Array.isArray(itemsRaw)
      ? itemsRaw
          .filter(isItemLike)
          .map((x) => sanitizeItem(x as Partial<Item>))
          .filter((x) => x.term && x.translation)
      : [];

    return new NextResponse(JSON.stringify({ items }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error';
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}

