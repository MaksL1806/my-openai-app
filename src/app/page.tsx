"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAnswer("");
    setError(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setAnswer(data.text || "");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Ask OpenAI (gpt-4o-mini)</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Введи prompt…"
          rows={6}
        />
        <button type="submit" disabled={loading || !prompt.trim()}>
          {loading ? "Генерація…" : "Надіслати"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>Помилка: {error}</p>}
      {answer && (
        <>
          <h2>Відповідь</h2>
          <pre style={{ background: "#f6f6f6", padding: 12, whiteSpace: "pre-wrap" }}>
            {answer}
          </pre>
        </>
      )}
    </main>
  );
}
