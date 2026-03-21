"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type AnalyticsData = Record<string, unknown>;

export default function AdminPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchAnalytics(days);
  }, [days]);

  async function fetchAnalytics(period: number) {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Не авторизован. Сначала залогиньтесь на /login");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/analytics?days=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Ошибка ${res.status}`);
        setLoading(false);
        return;
      }

      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, fontFamily: "monospace" }}>Загрузка аналитики...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "monospace", color: "#c00" }}>
        <h2>Ошибка</h2>
        <p>{error}</p>
        <a href="/login" style={{ color: "#06c" }}>Войти</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "monospace", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 16 }}>Аналитика Diplox</h1>

      <div style={{ marginBottom: 20 }}>
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              marginRight: 8,
              padding: "6px 14px",
              background: days === d ? "#333" : "#eee",
              color: days === d ? "#fff" : "#333",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {d} дней
          </button>
        ))}
      </div>

      <pre style={{
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: 20,
        borderRadius: 8,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.5,
      }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
