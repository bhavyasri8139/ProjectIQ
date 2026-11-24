import { AlertCircle, File, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";

export function FileIcon({ name = "", size = 21 }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["csv", "xls", "xlsx"].includes(ext)) return <FileSpreadsheet size={size} />;
  if (ext === "pdf") return <FileText size={size} />;
  return <File size={size} />;
}

export function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

export function Pill({ children, tone = "medium" }) {
  return <span className={`risk-severity ${tone}`}>{children}</span>;
}

export function Spinner({ label }) {
  return (
    <span className="inline-loading">
      <LoaderCircle className="spin" size={15} /> {label}
    </span>
  );
}

export function EmptyNote({ children }) {
  return <p className="empty-note">{children}</p>;
}

/** Placeholder for a result that is missing: shows the real error if the agent failed. */
export function Pending({ what, error, running }) {
  if (error) {
    return (
      <div className="stage-error">
        <AlertCircle size={16} />
        <div>
          <strong>{what} failed</strong>
          <span>{error}</span>
          <span>Fix the cause (for example the AI settings in backend/.env), then use Refresh analysis.</span>
        </div>
      </div>
    );
  }
  if (running) return <EmptyNote>{what} is running. Results appear here as soon as they are ready.</EmptyNote>;
  return <EmptyNote>{what} has not been generated yet. Use Refresh analysis to run it.</EmptyNote>;
}
