"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type AnalyticsData = Record<string, unknown>;

interface DistributionRow {
  slug: string;
  platform: string;
  status: string;
  distributed_at: string | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

interface DistributionData {
  log: DistributionRow[];
  summary: Record<string, Record<string, number>>;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  distributed: "#2d8c3c",
  failed: "#c9a000",
  permanently_failed: "#c00",
  skipped: "#888",
  draft_ready: "#06c",
  pending: "#888",
};

export default function AdminPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [distData, setDistData] = useState<DistributionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchAll(days);
  }, [days]);

  async function getAccessToken(): Promise<string | null> {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function fetchAll(period: number) {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();

      if (!token) {
        setError("Не авторизован. Сначала залогиньтесь на /login");
        setLoading(false);
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      const [analyticsRes, distRes] = await Promise.all([
        fetch(`/api/admin/analytics?days=${period}`, { headers }),
        fetch("/api/admin/distribution", { headers }),
      ]);

      if (!analyticsRes.ok) {
        const body = await analyticsRes.json().catch(() => null);
        setError(body?.error ?? `Ошибка ${analyticsRes.status}`);
        setLoading(false);
        return;
      }

      setData(await analyticsRes.json());

      if (distRes.ok) {
        setDistData(await distRes.json());
      }
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

      {distData && (
        <>
          <h2 style={{ marginTop: 32, marginBottom: 12 }}>Дистрибуция статей</h2>

          {Object.keys(distData.summary).length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {Object.entries(distData.summary).map(([platform, statuses]) => (
                <div key={platform} style={{
                  background: "#f5f5f5",
                  padding: "8px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <strong>{platform}</strong>:{" "}
                  {Object.entries(statuses).map(([status, count]) => (
                    <span key={status} style={{ color: STATUS_COLORS[status] || "#333", marginRight: 8 }}>
                      {status} ({count})
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}

          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>Slug</th>
                <th style={{ padding: "6px 8px" }}>Платформа</th>
                <th style={{ padding: "6px 8px" }}>Статус</th>
                <th style={{ padding: "6px 8px" }}>Дата</th>
                <th style={{ padding: "6px 8px" }}>Retry</th>
                <th style={{ padding: "6px 8px" }}>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {distData.log.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 8px" }}>{row.slug}</td>
                  <td style={{ padding: "4px 8px" }}>{row.platform}</td>
                  <td style={{ padding: "4px 8px", color: STATUS_COLORS[row.status] || "#333" }}>
                    {row.status}
                  </td>
                  <td style={{ padding: "4px 8px" }}>
                    {row.distributed_at
                      ? new Date(row.distributed_at).toLocaleString("ru-RU")
                      : "—"}
                  </td>
                  <td style={{ padding: "4px 8px" }}>{row.retry_count}</td>
                  <td style={{ padding: "4px 8px", color: "#c00", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {distData.log.length === 0 && (
            <p style={{ color: "#888", marginTop: 8 }}>Нет записей дистрибуции</p>
          )}
        </>
      )}
    </div>
  );
}
