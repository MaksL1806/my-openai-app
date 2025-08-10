// src/app/api/cards/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*', // за потреби постав свій домен Tilda
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

function sanitizeStr(s: unknown, max = 120): string {
  return String(s ?? '').trim().slice(0, max);
}
function sanitizeItem(x: any) {
  return {
    term: sanitizeStr(x?.term, 60),
    translation: sanitizeStr(x?.translation, 120),
    example: sanitizeStr(x?.example, 140)
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody = {};
    try { body = (await req.json()) as RequestBody; } catch { body = {}; }

    const topic = sanitizeStr(body.topic || 'general', 80);
    const count = Math.max(1, Math.min(50, Number(body.count) || 8));
    const targetLang = sanitizeStr(body.targetLang || 'uk', 10);

    const avoidInput = Array.isArray(body.avoid) ? body.avoid : [];
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

    const out = await r.json();
    let parsed: any = {};
    try { parsed = JSON.parse(out?.choices?.[0]?.message?.content ?? '{}'); } catch { parsed = {}; }

    const items = Array.isArray(parsed?.items)
      ? parsed.items.map(sanitizeItem).filter(x => x.term && x.translation)
      : [];

    return new NextResponse(JSON.stringify({ items }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e?.message || 'Server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}
