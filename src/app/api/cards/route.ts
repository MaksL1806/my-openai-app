import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '@/firebase-admin';
import { NextRequest } from 'next/server';

function formatSection(title: string, content: string) {
  return `<br><b>${title}</b><br>&nbsp;<br>${content}<br>&nbsp;`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = body.code;

    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    const url = `https://rozetka.com.ua/ua/p${code}`;
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const text = $('[class*="product-about__description"]').text();

    const sections = {
      description: '',
      advantages: '',
      composition: '',
      analysis: '',
      feeding: '',
      recommendations: '',
      contraindications: ''
    };

    for (const [key] of Object.entries(sections)) {
      const regex = new RegExp(`${key === 'feeding' ? 'норми годування' : key}`, 'i');
      const match = text.match(regex);
      if (match) {
        const start = match.index!;
        const nextMatch = Object.keys(sections)
          .filter(k => k !== key)
          .map(k => text.search(new RegExp(k, 'i')))
          .filter(index => index > start)
          .sort((a, b) => a - b)[0] || text.length;

        sections[key as keyof typeof sections] = text.slice(start, nextMatch).trim();
      }
    }

    const finalText = [
      formatSection("Опис", sections.description),
      formatSection("Переваги", sections.advantages),
      formatSection("Склад", sections.composition.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()),
      formatSection("Аналіз", sections.analysis),
      formatSection("Норми годування", sections.feeding),
      formatSection("Рекомендації до застосування", sections.recommendations),
      formatSection("Протипоказання", sections.contraindications)
    ].join('\n');

    await db.collection('cards').doc(code).set({
      code,
      content: finalText,
      createdAt: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ result: finalText }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e: any) {
    console.error('API /api/cards fatal error:', e);
    return new Response(
      JSON.stringify({ error: 'Server error', detail: String(e) }),
      { status: 500 }
    );
  }
}