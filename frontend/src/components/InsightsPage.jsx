import {
  Activity, AlertCircle, ArrowRight, CheckCircle2, Circle, Clock, Files, ListChecks,
  LoaderCircle, RefreshCw, ShieldAlert, Sparkles, Target,
} from "lucide-react";
import { ActionTable, BlockerList, DecisionList, ForecastCard, RiskList } from "./AgentViews";
import { EmptyNote, Pending, StatCard } from "./Common";
import { DimensionBars, HealthGauge, SeverityBars } from "./HealthView";
import UploadPanel from "./UploadPanel";
import { isFilled, timeAgo } from "../utils";

const STEPS = [
  ["scope", "Scope"],
  ["risk", "Risks"],
  ["blockers", "Blockers"],
  ["health", "Health score"],
  ["docs", "Documents"],
  ["stories", "User stories"],
];

function PipelineSteps({ state, results }) {
  const running = state.status === "running";
  const currentIndex = STEPS.findIndex(([key]) => key === state.stage);
  const hasResult = {
    scope: !!results.scope_analysis,
    risk: !!results.risk_analysis,
    blockers: !!results.blocker_analysis,
    health: !!results.health_report,
    docs: !!results.documents?.project_summary,
    stories: !!results.documents?.user_stories,
  };
  return (
    <ol className="pipeline">
      {STEPS.map(([key, label], index) => {
        const active = running && index === currentIndex;
        const done = hasResult[key] && !active;
        return (
          <li key={key} className={active ? "active" : done ? "done" : ""}>
            {active ? <LoaderCircle className="spin" size={15} /> : done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function StatusBanner({ dashboard, onRun }) {
  const { state, stale, results, documents } = dashboard;
  const running = state.status === "running";
  const indexing = documents.processing > 0;
  let tone = "ok";
  let icon = <CheckCircle2 size={18} />;
  let title = `Analysis is up to date. Last updated ${timeAgo(results.generated_at)}.`;
  let detail = "Everything below is served instantly from the saved analysis.";

  if (indexing) {
    tone = "busy"; icon = <LoaderCircle className="spin" size={18} />;
    title = `Indexing ${documents.processing} document(s)...`;
    detail = "The knowledge base is updating. The analysis refreshes automatically afterwards.";
  } else if (running) {
    tone = "busy"; icon = <LoaderCircle className="spin" size={18} />;
    title = `${state.message} (${state.progress}%)`;
    detail = results.health_report ? "Showing the previous results while the new analysis finishes." : "Results appear below as each agent finishes.";
  } else if (documents.in_project === 0) {
    tone = "idle"; icon = <Clock size={18} />;
    title = "No project documents yet.";
    detail = "Upload documents or load the sample project to generate the dashboard.";
  } else if (state.status === "error") {
    tone = "error"; icon = <AlertCircle size={18} />;
    title = "The analysis could not run.";
    detail = state.error || state.message || "Check the AI settings in backend/.env, then use Refresh analysis.";
  } else if (!results.health_report) {
    tone = "idle"; icon = <Clock size={18} />;
    title = "Analysis has not been run for these documents.";
    detail = "Select Refresh analysis to run all agents.";
  } else if (stale) {
    tone = "stale"; icon = <Clock size={18} />;
    title = "Documents changed since the last analysis.";
    detail = "Select Refresh analysis to update the results.";
  } else if (state.message?.includes("warnings")) {
    tone = "stale"; icon = <AlertCircle size={18} />;
    title = state.message;
    detail = "Some agents failed. The rest of the results are shown.";
  }

  return (
    <div className={`status-banner ${tone}`}>
      <div className="status-banner-main">
        {icon}
        <div><strong>{title}</strong><span>{detail}</span></div>
        <button className="secondary-button" onClick={onRun} disabled={running || indexing || documents.in_project === 0}>
          <RefreshCw size={15} /> Refresh analysis
        </button>
      </div>
      {(running || (results.health_report && state.status !== "idle")) && (
        <div className="progress-track"><span style={{ width: `${state.progress || 0}%` }} /></div>
      )}
      {(running || results.scope_analysis) && <PipelineSteps state={state} results={results} />}
    </div>
  );
}

export default function InsightsPage({ dashboard, onFiles, uploading, onLoadSample, onRunAnalysis, goto }) {
  if (!dashboard) {
    return <div className="empty-state"><LoaderCircle className="spin" size={23} /><span>Loading dashboard...</span></div>;
  }
  const { results, documents, state } = dashboard;
  const errors = results.stage_errors || {};
  const running = state.status === "running";
  const scope = results.scope_analysis;
  const risk = results.risk_analysis;
  const blockers = results.blocker_analysis;
  const health = results.health_report;
  const openBlockers = (blockers?.blockers || []).filter((b) => String(b.status || "").toLowerCase() !== "resolved");
  const risks = risk?.risks || [];
  const actions = blockers?.action_items || [];
  const hasAnything = !!(scope || risk || blockers || health);

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> MILESTONE 4 · PROJECT INSIGHTS & RISK SUMMARY DASHBOARD</div>
          <h1>Project insights{isFilled(scope?.project_name) ? `: ${scope.project_name}` : ""}</h1>
          <p className="page-subtitle">
            Health score, risks, blockers, action items and scope in one view, grounded in your uploaded documents.
          </p>
        </div>
      </section>

      <StatusBanner dashboard={dashboard} onRun={onRunAnalysis} />

      <section className="stats-grid">
        <StatCard icon={Files} label="Project documents" value={documents.in_project} note={`${documents.indexed} indexed · ${documents.chunks} chunks`} tone="blue" />
        <StatCard icon={ShieldAlert} label="Risks detected" value={risk ? risks.length : "—"} note={risk ? `${risks.filter((r) => ["high", "critical"].includes(String(r.severity).toLowerCase())).length} high or critical` : "Awaiting analysis"} tone="amber" />
        <StatCard icon={AlertCircle} label="Open blockers" value={blockers ? openBlockers.length : "—"} note={blockers ? `${(blockers.pending_decisions || []).length} pending decision(s)` : "Awaiting analysis"} tone="violet" />
        <StatCard icon={ListChecks} label="Action items" value={blockers ? actions.length : "—"} note={blockers ? `${actions.filter((a) => !isFilled(a.owner)).length} without an owner` : "Awaiting analysis"} tone="green" />
      </section>

      {hasAnything ? (
        <>
          <section className="dash-grid">
            <div className="panel card health-card">
              <span className="mini-label">PROJECT HEALTH SCORE</span>
              <div className="health-card-body">
                <HealthGauge score={health?.overall_score} status={health?.health_status} />
                <div>
                  <p className="lead-text">{health?.executive_summary || "The health score appears once the agents finish."}</p>
                  <button className="text-button" onClick={() => goto("Project Health")}>See score breakdown <ArrowRight size={14} /></button>
                </div>
              </div>
              {health && <DimensionBars dimensions={health.dimensions} showDetails={false} />}
            </div>

            <div className="panel card">
              <div className="card-head">
                <span className="mini-label">SCOPE SUMMARY</span>
                <button className="text-button" onClick={() => goto("AI Agents")}>Details <ArrowRight size={14} /></button>
              </div>
              {scope ? (
                <div className="scope-brief">
                  <p className="lead-text">{isFilled(scope.objective) ? scope.objective : "Objective not specified."}</p>
                  <div><span className="field-label"><Target size={13} /> Deliverables</span>
                    {(scope.deliverables || []).filter(isFilled).length
                      ? <ul className="plain-list">{scope.deliverables.slice(0, 5).map((d, i) => <li key={i}>{typeof d === "string" ? d : JSON.stringify(d)}</li>)}</ul>
                      : <EmptyNote>None specified.</EmptyNote>}
                  </div>
                  <div><span className="field-label"><Clock size={13} /> Milestones</span>
                    {(scope.milestones || []).filter(isFilled).length
                      ? <ul className="plain-list">{scope.milestones.slice(0, 4).map((m, i) => <li key={i}>{typeof m === "string" ? m : JSON.stringify(m)}</li>)}</ul>
                      : <EmptyNote>None specified.</EmptyNote>}
                  </div>
                </div>
              ) : <Pending what="Scope extraction" error={errors.scope} running={running} />}
            </div>
          </section>

          <section className="dash-grid">
            <div className="panel card">
              <div className="card-head">
                <span className="mini-label">TOP RISKS</span>
                <button className="text-button" onClick={() => goto("AI Agents")}>All risks <ArrowRight size={14} /></button>
              </div>
              {risk ? <RiskList risks={risks} limit={4} /> : <Pending what="Risk detection" error={errors.risk} running={running} />}
            </div>
            <div className="panel card">
              <span className="mini-label">DELIVERY FORECAST & SEVERITY</span>
              {risk ? (
                <>
                  <ForecastCard forecast={risk.delivery_forecast} />
                  <div className="divider" />
                  <SeverityBars risks={risks} />
                </>
              ) : <Pending what="Risk analysis" error={errors.risk} running={running} />}
            </div>
          </section>

          <section className="dash-grid">
            <div className="panel card">
              <div className="card-head">
                <span className="mini-label">BLOCKERS & PENDING DECISIONS</span>
                <button className="text-button" onClick={() => goto("AI Agents")}>Details <ArrowRight size={14} /></button>
              </div>
              {blockers ? (
                <>
                  <BlockerList blockers={blockers.blockers} limit={3} />
                  <span className="field-label spaced">Pending decisions</span>
                  <DecisionList decisions={(blockers.pending_decisions || []).slice(0, 4)} />
                </>
              ) : <Pending what="Blocker detection" error={errors.blockers} running={running} />}
            </div>
            <div className="panel card">
              <div className="card-head">
                <span className="mini-label">ACTION ITEMS</span>
                <button className="text-button" onClick={() => goto("AI Agents")}>Full list <ArrowRight size={14} /></button>
              </div>
              {blockers ? <ActionTable items={actions} limit={7} /> : <Pending what="Blocker analysis" error={errors.blockers} running={running} />}
            </div>
          </section>
        </>
      ) : (
        <div className="panel card empty-dashboard">
          <Activity size={26} />
          <strong>Your dashboard will appear here</strong>
          <span>Upload project documents, or load the sample project, and the multi-agent analysis starts automatically.</span>
        </div>
      )}

      <UploadPanel
        onFiles={onFiles} onLoadSample={onLoadSample} uploading={uploading}
        compact hasDocuments={documents.total > 0}
      />
    </>
  );
}
