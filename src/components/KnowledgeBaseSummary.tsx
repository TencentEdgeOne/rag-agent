import { useState, useEffect, useCallback } from "react";
import { useT } from "../i18n";
import "./KnowledgeBaseSummary.css";

export default function KnowledgeBaseSummary() {
  const { t } = useT();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // EdgeOne agents/ runtime accepts POST only AND requires the request to
      // look like a normal JSON POST (Content-Type + JSON body). A bare
      // `fetch(url, { method: 'POST' })` with no body is rejected at the
      // platform layer with 400 before our handler runs.
      const res = await fetch("/rag-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatSize = (bytes) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    const date = new Date(ts);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="kb-summary">
      <div className="kb-summary-header">
        <div className="kb-summary-title-row">
          <svg className="kb-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7" />
            <path d="M20 7c0 2.21-3.58 4-8 4S4 9.21 4 7" />
            <ellipse cx="12" cy="7" rx="8" ry="4" />
          </svg>
          <span className="kb-summary-title">{t("kb.title")}</span>
        </div>
        <button
          className="kb-refresh-btn"
          onClick={fetchStats}
          disabled={loading}
          title="Refresh stats"
        >
          <svg
            className={`kb-refresh-icon ${loading ? "spinning" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="kb-error">
          <span>{error}</span>
          <button className="kb-retry-btn" onClick={fetchStats}>
            {t("kb.retry")}
          </button>
        </div>
      )}

      {!error && (
        <div className="kb-stats-row">
          <div className="kb-stat">
            <span className="kb-stat-value">
              {loading ? "—" : stats?.documents?.length ?? "—"}
            </span>
            <span className="kb-stat-label">{t("kb.documents")}</span>
          </div>
          <div className="kb-stat-divider" />
          <div className="kb-stat">
            <span className="kb-stat-value">
              {loading ? "—" : stats?.documents?.reduce((s, d) => s + (d.pages ?? 0), 0) ?? "—"}
            </span>
            <span className="kb-stat-label">{t("kb.pages")}</span>
          </div>
          <div className="kb-stat-divider" />
          <div className="kb-stat">
            <span className="kb-stat-value">
              {loading ? "—" : formatSize(stats?.totalBytes)}
            </span>
            <span className="kb-stat-label">{t("kb.dataSize")}</span>
          </div>
          <div className="kb-stat-divider" />
          <div className="kb-stat">
            <span className="kb-stat-value">
              {loading ? "—" : `${stats?.total ?? 0} ${t("kb.entries")}`}
            </span>
            <span className="kb-stat-label">{t("kb.indexed")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
