"""Project Health Scoring Module.

The score is *derived from the outputs of the Scope, Risk and Blocker agents*,
not from keyword counting. Every deduction is recorded in `details`, so the
score is explainable on screen during a review.

Dimensions and weights (match the project statement):
    Scope clarity        35 %
    Timeline & risk      40 %
    Blocker health       25 %
"""

from typing import Any, Optional

WEIGHTS = {"scope_clarity": 0.35, "timeline_risk": 0.40, "blocker_health": 0.25}
SCOPE_FIELDS = [
    ("objective", "objective"),
    ("goals", "goals"),
    ("deliverables", "deliverables"),
    ("milestones", "milestones"),
    ("timeline", "timeline"),
    ("responsibilities", "team responsibilities"),
]
SEVERITY_PENALTY = {"Critical": 18, "High": 12, "Medium": 6, "Low": 2}
BLOCKER_PENALTY = {"High": 15, "Medium": 9, "Low": 4}
SCHEDULE_CATEGORIES = {"schedule", "timeline", "dependency", "delivery"}
EMPTY_MARKERS = {"", "not specified", "unknown", "n/a", "none", "unclear"}


def _clip(value: float) -> int:
    return int(max(0, min(100, round(value))))


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip().lower() not in EMPTY_MARKERS
    if isinstance(value, (list, tuple, set, dict)):
        return any(_present(v) for v in (value.values() if isinstance(value, dict) else value))
    return True


def _norm(value: Any, allowed: dict, default: str) -> str:
    text = str(value or "").strip().title()
    return text if text in allowed else default


def score_scope(scope: Optional[dict]) -> dict:
    details: list[str] = []
    if not scope:
        return {"score": 0, "details": ["Scope agent has no output yet."], "available": False}

    filled = 0
    for key, label in SCOPE_FIELDS:
        if _present(scope.get(key)):
            filled += 1
        else:
            details.append(f"No {label} found in the documents (-{round(100 / len(SCOPE_FIELDS))} pts).")
    score = 100 * filled / len(SCOPE_FIELDS)

    missing = [m for m in (scope.get("missing_information") or []) if _present(m)]
    penalty = min(20, 4 * len(missing))
    if penalty:
        details.append(f"{len(missing)} information gap(s) reported by the scope agent (-{penalty} pts).")
    score -= penalty
    if filled == len(SCOPE_FIELDS) and not penalty:
        details.append("Objective, goals, deliverables, milestones, timeline and responsibilities are all documented.")
    elif filled:
        details.insert(0, f"{filled} of {len(SCOPE_FIELDS)} scope elements are documented.")
    return {"score": _clip(score), "details": details, "available": True}


def score_timeline(risk_result: Optional[dict]) -> dict:
    if not risk_result:
        return {"score": 0, "details": ["Risk agent has no output yet."], "available": False}

    details: list[str] = []
    score = 100.0
    risks = [r for r in (risk_result.get("risks") or []) if isinstance(r, dict)]

    for risk in risks:
        severity = _norm(risk.get("severity"), SEVERITY_PENALTY, "Medium")
        category = str(risk.get("category") or "").strip().lower()
        weight = 1.0 if category in SCHEDULE_CATEGORIES else 0.5
        penalty = SEVERITY_PENALTY[severity] * weight
        score -= penalty
        details.append(f"{severity} {risk.get('category') or 'Other'} risk: {risk.get('title') or 'Untitled'} (-{round(penalty)} pts).")

    forecast = risk_result.get("delivery_forecast") or {}
    status = str(forecast.get("status") or "").strip().lower()
    if status == "delayed":
        score -= 15
        details.append("Delivery forecast: Delayed (-15 pts).")
    elif status == "at risk":
        score -= 8
        details.append("Delivery forecast: At Risk (-8 pts).")
    elif status == "insufficient evidence":
        score -= 5
        details.append("Delivery forecast: insufficient evidence (-5 pts).")
    elif status == "on track":
        details.append("Delivery forecast: On Track.")

    if not risks and not details:
        details.append("No risks were detected in the documents.")
    return {"score": _clip(score), "details": details, "available": True}


def score_blockers(blocker_result: Optional[dict]) -> dict:
    if not blocker_result:
        return {"score": 0, "details": ["Blocker agent has no output yet."], "available": False}

    details: list[str] = []
    score = 100.0

    open_blockers = [
        b for b in (blocker_result.get("blockers") or [])
        if isinstance(b, dict) and str(b.get("status") or "").strip().lower() != "resolved"
    ]
    for blocker in open_blockers:
        priority = _norm(blocker.get("priority"), BLOCKER_PENALTY, "Medium")
        score -= BLOCKER_PENALTY[priority]
        details.append(f"Open {priority.lower()}-priority blocker: {blocker.get('title') or 'Untitled'} (-{BLOCKER_PENALTY[priority]} pts).")

    pending = [d for d in (blocker_result.get("pending_decisions") or []) if isinstance(d, dict)]
    if pending:
        penalty = min(20, 5 * len(pending))
        score -= penalty
        details.append(f"{len(pending)} pending decision(s) (-{penalty} pts).")

    actions = [a for a in (blocker_result.get("action_items") or []) if isinstance(a, dict)]
    open_actions = [a for a in actions if str(a.get("status") or "").strip().lower() != "completed"]
    unowned = [a for a in open_actions if not _present(a.get("owner"))]
    if unowned:
        penalty = min(10, 2 * len(unowned))
        score -= penalty
        details.append(f"{len(unowned)} open action item(s) without an owner (-{penalty} pts).")

    if not open_blockers and not pending and not unowned:
        details.append("No open blockers or pending decisions were found.")
    return {"score": _clip(score), "details": details, "available": True}


def status_for(score: int) -> str:
    if score >= 75:
        return "Healthy"
    if score >= 50:
        return "At Risk"
    return "Critical"


def compute_health(scope: Optional[dict], risk_result: Optional[dict], blocker_result: Optional[dict],
                   documents_analyzed: int = 0) -> dict:
    """Combine agent outputs into one weighted, explainable health report."""
    dims = {
        "scope_clarity": ("Scope Clarity", score_scope(scope)),
        "timeline_risk": ("Timeline & Risk", score_timeline(risk_result)),
        "blocker_health": ("Blocker Health", score_blockers(blocker_result)),
    }

    available = {k: v for k, (_, v) in dims.items() if v["available"]}
    if not available:
        return {
            "overall_score": None,
            "health_status": "Insufficient Evidence",
            "executive_summary": "The analysis agents have not produced output yet, so a health score cannot be computed.",
            "dimensions": {
                k: {"label": label, "weight": f"{int(WEIGHTS[k] * 100)}%", "score": 0, "details": d["details"]}
                for k, (label, d) in dims.items()
            },
            "documents_analyzed": documents_analyzed,
        }

    total_weight = sum(WEIGHTS[k] for k in available)
    overall = _clip(sum(available[k]["score"] * WEIGHTS[k] for k in available) / total_weight)
    status = status_for(overall)

    dimensions = {
        k: {
            "label": label,
            "weight": f"{int(WEIGHTS[k] * 100)}%",
            "score": d["score"],
            "details": d["details"],
        }
        for k, (label, d) in dims.items()
    }

    weakest_key = min(available, key=lambda k: available[k]["score"])
    weakest = dimensions[weakest_key]
    n_risks = len((risk_result or {}).get("risks") or [])
    n_blockers = len((blocker_result or {}).get("blockers") or [])
    n_actions = len((blocker_result or {}).get("action_items") or [])
    summary = (
        f"Overall health is {status} ({overall}/100) based on {documents_analyzed} document(s). "
        f"{n_risks} risk(s), {n_blockers} blocker(s) and {n_actions} action item(s) were extracted. "
        f"The weakest dimension is {weakest['label']} ({weakest['score']}/100)."
    )
    return {
        "overall_score": overall,
        "health_status": status,
        "executive_summary": summary,
        "dimensions": dimensions,
        "documents_analyzed": documents_analyzed,
    }
