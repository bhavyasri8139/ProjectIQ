"""Deterministic document builders.

The risk register, action-item report and project summary are rendered
directly from the structured agent outputs. That makes them instant and keeps
them strictly grounded: nothing is added that the agents did not extract.
"""

from typing import Any, Iterable

NOT_SPECIFIED = "Not specified"


def _cell(value: Any) -> str:
    text = str(value if value not in (None, "") else NOT_SPECIFIED)
    return " ".join(text.replace("|", "/").split()) or NOT_SPECIFIED


def _bullets(items: Iterable[Any]) -> str:
    lines = []
    for item in items or []:
        if isinstance(item, dict):
            item = "; ".join(f"{k}: {v}" for k, v in item.items() if v)
        text = " ".join(str(item).split())
        if text and text.lower() != NOT_SPECIFIED.lower():
            lines.append(f"- {text}")
    return "\n".join(lines) if lines else f"- {NOT_SPECIFIED}"


def build_risk_register(risk_result: dict) -> str:
    risks = [r for r in (risk_result or {}).get("risks", []) if isinstance(r, dict)]
    lines = [
        "# Project Risk Register",
        "",
        "_Generated from the Risk Detection agent. Mitigations are recommendations, not approved project decisions._",
        "",
    ]
    if not risks:
        lines.append("No risks were identified in the uploaded documents.")
        return "\n".join(lines)

    lines += [
        "| Risk ID | Risk | Category | Evidence | Probability | Impact | Severity | Mitigation (recommended) | Owner | Status |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, risk in enumerate(risks, start=1):
        lines.append(
            "| " + " | ".join([
                f"RSK-{i:02d}",
                _cell(risk.get("title")),
                _cell(risk.get("category")),
                _cell(risk.get("evidence") or risk.get("description")),
                _cell(risk.get("probability")),
                _cell(risk.get("impact")),
                _cell(risk.get("severity")),
                _cell(risk.get("mitigation")),
                NOT_SPECIFIED,
                "Open",
            ]) + " |"
        )
    return "\n".join(lines)


def build_action_items(blocker_result: dict) -> str:
    data = blocker_result or {}
    actions = [a for a in data.get("action_items", []) if isinstance(a, dict)]
    blockers = [b for b in data.get("blockers", []) if isinstance(b, dict)]
    decisions = [d for d in data.get("pending_decisions", []) if isinstance(d, dict)]

    lines = ["# Project Action-Item Report", ""]
    lines += ["## Action items", ""]
    if actions:
        lines += [
            "| Action ID | Action | Owner | Due Date | Status | Priority | Evidence |",
            "|---|---|---|---|---|---|---|",
        ]
        for i, a in enumerate(actions, start=1):
            lines.append("| " + " | ".join([
                f"ACT-{i:02d}", _cell(a.get("task")), _cell(a.get("owner")), _cell(a.get("due_date")),
                _cell(a.get("status")), _cell(a.get("priority")), _cell(a.get("evidence")),
            ]) + " |")
    else:
        lines.append("No action items were found in the uploaded documents.")

    lines += ["", "## Blockers", ""]
    if blockers:
        lines += ["| Blocker | Status | Owner | Priority | Evidence |", "|---|---|---|---|---|"]
        for b in blockers:
            lines.append("| " + " | ".join([
                _cell(b.get("title")), _cell(b.get("status")), _cell(b.get("owner")),
                _cell(b.get("priority")), _cell(b.get("evidence")),
            ]) + " |")
    else:
        lines.append("No explicit blockers were found.")

    lines += ["", "## Pending decisions", ""]
    if decisions:
        lines += ["| Decision | Owner | Status | Evidence |", "|---|---|---|---|"]
        for d in decisions:
            lines.append("| " + " | ".join([
                _cell(d.get("decision")), _cell(d.get("owner")), _cell(d.get("status")), _cell(d.get("evidence")),
            ]) + " |")
    else:
        lines.append("No pending decisions were found.")
    return "\n".join(lines)


def build_project_summary(scope: dict, risk_result: dict, blocker_result: dict, health: dict | None = None) -> str:
    scope = scope or {}
    risk_result = risk_result or {}
    blocker_result = blocker_result or {}
    forecast = risk_result.get("delivery_forecast") or {}

    lines = [f"# Project Summary: {scope.get('project_name') or NOT_SPECIFIED}", ""]
    if health and health.get("overall_score") is not None:
        lines += [f"**Health:** {health.get('health_status')} ({health.get('overall_score')}/100)", ""]
    lines += ["## Project overview", scope.get("summary") or NOT_SPECIFIED, ""]
    lines += ["## Objective", scope.get("objective") or NOT_SPECIFIED, ""]
    lines += ["## Goals", _bullets(scope.get("goals")), ""]
    lines += ["## Deliverables", _bullets(scope.get("deliverables")), ""]
    lines += ["## Milestones", _bullets(scope.get("milestones")), ""]
    lines += ["## Timeline", _bullets(scope.get("timeline")), ""]
    lines += ["## Responsibilities", _bullets(scope.get("responsibilities")), ""]
    lines += [f"## Delivery forecast: {forecast.get('status') or NOT_SPECIFIED}",
              _bullets(forecast.get("schedule_observations")), ""]
    lines += ["## Known risks", _bullets(
        f"{r.get('severity', '?')}: {r.get('title')}" for r in risk_result.get("risks", []) if isinstance(r, dict)
    ), ""]
    lines += ["## Blockers", _bullets(
        f"{b.get('title')} ({b.get('status', 'Unclear')})" for b in blocker_result.get("blockers", []) if isinstance(b, dict)
    ), ""]
    lines += ["## Pending decisions", _bullets(
        d.get("decision") for d in blocker_result.get("pending_decisions", []) if isinstance(d, dict)
    ), ""]
    gaps = list(scope.get("missing_information") or []) + list(risk_result.get("missing_information") or []) \
        + list(blocker_result.get("missing_information") or [])
    lines += ["## Missing information", _bullets(gaps)]
    return "\n".join(lines)


def build_user_stories_fallback(scope: dict) -> str:
    """Used only if the LLM call fails: stories derived from extracted deliverables."""
    deliverables = [str(d).strip() for d in (scope or {}).get("deliverables", []) if str(d).strip()]
    objective = (scope or {}).get("objective") or NOT_SPECIFIED
    lines = [
        "# User Stories",
        "",
        "_The language model was unavailable, so these stories were templated from the extracted deliverables. "
        "They are suggestions, not approved requirements._",
        "",
    ]
    if not deliverables:
        lines.append("No deliverables were extracted, so no stories could be generated.")
        return "\n".join(lines)
    for i, item in enumerate(deliverables[:8], start=1):
        lines += [
            f"## US-{i:02d}: {item}",
            f"- **Story:** As a project team member, I want {item[0].lower() + item[1:]}, so that the project objective is met.",
            f"- **Objective reference:** {objective}",
            "- **Acceptance criteria:** Not specified (to be agreed with the team).",
            "- **Priority:** Not specified",
            "",
        ]
    return "\n".join(lines)
