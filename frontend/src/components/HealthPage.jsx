import { useState } from "react";
import { Activity, AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Pill, StatCard } from "./Common";
import { DimensionBars, HealthGauge } from "./HealthView";

export default function HealthPage({ dashboard, onChanged, goto }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const report = dashboard?.results?.health_report;
  const dims = report?.dimensions || {};

  async function recalc() {
    setBusy(true);
    setError("");
    try {
      await api.healthScore(); // derived instantly from the saved agent outputs
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tone = report?.health_status === "Healthy" ? "low" : report?.health_status === "At Risk" ? "medium" : "critical";

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><Activity size={14} /> MILESTONE 3 · HEALTH SCORING</div>
          <h1>Project Health Scoring</h1>
          <p className="page-subtitle">
            The score is calculated from the scope, risk and blocker agents. Every point deducted is listed below.
          </p>
        </div>
        <button className="secondary-button" onClick={recalc} disabled={busy || !report}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Recalculate
        </button>
      </section>

      {error && <div className="error-banner"><AlertCircle size={18} /><span>{error}</span></div>}

      {!report ? (
        <div className="panel card empty-dashboard">
          <ShieldCheck size={26} />
          <strong>No health score yet</strong>
          <span>The score is created automatically after the agents finish. Check the dashboard for progress.</span>
          <button className="primary-button" onClick={() => goto("Dashboard")}>Open dashboard</button>
        </div>
      ) : (
        <>
          <section className="stats-grid">
            <StatCard icon={Activity} label="Overall health" value={report.overall_score == null ? "—" : `${report.overall_score}/100`} note={report.health_status} tone="amber" />
            <StatCard icon={CheckCircle2} label="Scope clarity" value={`${dims.scope_clarity?.score ?? 0}/100`} note="Weight 35%" tone="blue" />
            <StatCard icon={ShieldCheck} label="Timeline & risk" value={`${dims.timeline_risk?.score ?? 0}/100`} note="Weight 40%" tone="violet" />
            <StatCard icon={AlertCircle} label="Blocker health" value={`${dims.blocker_health?.score ?? 0}/100`} note="Weight 25%" tone="green" />
          </section>

          <div className="panel card">
            <div className="health-hero">
              <HealthGauge score={report.overall_score} status={report.health_status} size={170} />
              <div>
                <Pill tone={tone}>{String(report.health_status).toUpperCase()}</Pill>
                <h2 className="hero-title">Executive health assessment</h2>
                <p className="lead-text">{report.executive_summary}</p>
              </div>
            </div>
            <div className="divider" />
            <h3 className="section-title">Dimension-wise breakdown</h3>
            <DimensionBars dimensions={dims} />
          </div>
        </>
      )}
    </>
  );
}
