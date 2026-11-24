import { scoreColor } from "../utils";

export function HealthGauge({ score, status, size = 150 }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = scoreColor(score);
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={`Health score ${score ?? "not available"}`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#edf0f6" strokeWidth="13" />
        <circle
          cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="gauge-center">
        <strong style={{ color }}>{score == null ? "—" : score}</strong>
        <span>{status || "Not scored"}</span>
      </div>
    </div>
  );
}

export function DimensionBars({ dimensions = {}, showDetails = true }) {
  return (
    <div className="dimension-list">
      {Object.entries(dimensions).map(([key, dim]) => {
        const color = scoreColor(dim.score);
        return (
          <div className="dimension" key={key}>
            <div className="dimension-head">
              <span>
                {dim.label} <small>weight {dim.weight}</small>
              </span>
              <strong style={{ color }}>{dim.score}/100</strong>
            </div>
            <div className="risk-bar-track">
              <div className="risk-bar-fill" style={{ width: `${dim.score}%`, background: color }} />
            </div>
            {showDetails && (dim.details || []).length > 0 && (
              <ul className="dimension-notes">
                {dim.details.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SeverityBars({ risks = [] }) {
  const levels = ["Critical", "High", "Medium", "Low"];
  const colors = { Critical: "#c83242", High: "#e0792b", Medium: "#d9a520", Low: "#2eaa75" };
  const counts = Object.fromEntries(levels.map((l) => [l, 0]));
  risks.forEach((r) => {
    const level = String(r.severity || "").trim().toLowerCase();
    const match = levels.find((l) => l.toLowerCase() === level);
    if (match) counts[match] += 1;
  });
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="severity-bars">
      {levels.map((level) => (
        <div className="risk-bar-row" key={level}>
          <span>{level}</span>
          <div className="risk-bar-track">
            <div className="risk-bar-fill" style={{ width: `${(counts[level] / max) * 100}%`, background: colors[level] }} />
          </div>
          <strong>{counts[level]}</strong>
        </div>
      ))}
    </div>
  );
}
