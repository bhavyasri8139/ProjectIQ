"""Unit tests for the pure-logic parts of ProjectIQ (no Ollama / Chroma needed).

Run from the backend folder:
    python -m unittest discover -s tests -v
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import health_scorer  # noqa: E402
import pipeline  # noqa: E402
import report_builders  # noqa: E402
from evidence import format_context, select_chunks  # noqa: E402
from store import AnalysisStore, fingerprint_for  # noqa: E402

FULL_SCOPE = {
    "project_name": "Campus Connect",
    "objective": "Replace WhatsApp groups with one event system.",
    "goals": ["Publish events in under 1 day"],
    "deliverables": ["Event workflow", "Student portal"],
    "milestones": ["M2: backend APIs due 22 Nov"],
    "timeline": ["5 Oct - 18 Dec 2026"],
    "responsibilities": ["Ananya Rao: project lead"],
    "missing_information": [],
    "summary": "A student event app.",
}
RISKS = {
    "risks": [
        {"title": "SSO credentials delayed", "category": "Dependency", "severity": "High",
         "probability": "High", "impact": "High", "mitigation": "Escalate to IT head", "evidence": "pending since 28 Oct"},
        {"title": "Low test coverage", "category": "Technical", "severity": "Medium"},
    ],
    "delivery_forecast": {"status": "At Risk"},
}
BLOCKERS = {
    "blockers": [
        {"title": "SSO credentials", "status": "Open", "priority": "High"},
        {"title": "Old issue", "status": "Resolved", "priority": "High"},
    ],
    "pending_decisions": [{"decision": "Payment gateway"}],
    "action_items": [
        {"task": "Escalate SSO", "owner": "Ananya Rao", "status": "Open"},
        {"task": "Request server", "owner": "Not specified", "status": "Open"},
    ],
}


class HealthScorerTests(unittest.TestCase):
    def test_scope_complete_scores_100(self):
        self.assertEqual(health_scorer.score_scope(FULL_SCOPE)["score"], 100)

    def test_scope_gaps_reduce_score(self):
        scope = dict(FULL_SCOPE, milestones=[], timeline="Not specified", missing_information=["budget"])
        result = health_scorer.score_scope(scope)
        self.assertLess(result["score"], 70)
        self.assertTrue(any("milestones" in d for d in result["details"]))

    def test_timeline_penalties_are_explained(self):
        result = health_scorer.score_timeline(RISKS)
        # High dependency (-12) + Medium technical at half weight (-3) + At Risk (-8)
        self.assertEqual(result["score"], 77)
        self.assertTrue(any("At Risk" in d for d in result["details"]))

    def test_resolved_blockers_do_not_count(self):
        result = health_scorer.score_blockers(BLOCKERS)
        # -15 open high blocker, -5 pending decision, -2 unowned action
        self.assertEqual(result["score"], 78)

    def test_overall_is_weighted_and_has_status(self):
        report = health_scorer.compute_health(FULL_SCOPE, RISKS, BLOCKERS, documents_analyzed=4)
        expected = round(100 * 0.35 + 77 * 0.40 + 78 * 0.25)
        self.assertEqual(report["overall_score"], expected)
        self.assertEqual(report["health_status"], health_scorer.status_for(expected))
        self.assertEqual(set(report["dimensions"]), {"scope_clarity", "timeline_risk", "blocker_health"})
        self.assertEqual(report["dimensions"]["timeline_risk"]["weight"], "40%")

    def test_no_agent_output_means_insufficient_evidence(self):
        report = health_scorer.compute_health(None, None, None)
        self.assertIsNone(report["overall_score"])
        self.assertEqual(report["health_status"], "Insufficient Evidence")

    def test_bad_project_can_score_critical(self):
        risks = {"risks": [{"title": f"r{i}", "category": "Schedule", "severity": "Critical"} for i in range(6)],
                 "delivery_forecast": {"status": "Delayed"}}
        blockers = {"blockers": [{"title": f"b{i}", "status": "Open", "priority": "High"} for i in range(6)]}
        report = health_scorer.compute_health({"objective": "x"}, risks, blockers)
        self.assertEqual(report["health_status"], "Critical")
        self.assertLess(report["overall_score"], 50)


class ReportBuilderTests(unittest.TestCase):
    def test_risk_register_table(self):
        md = report_builders.build_risk_register(RISKS)
        self.assertIn("| Risk ID |", md)
        self.assertIn("RSK-01", md)
        self.assertIn("SSO credentials delayed", md)
        self.assertIn("Not specified", md)  # owner is never invented

    def test_empty_risk_register_is_honest(self):
        self.assertIn("No risks were identified", report_builders.build_risk_register({"risks": []}))

    def test_action_items_include_blockers_and_decisions(self):
        md = report_builders.build_action_items(BLOCKERS)
        self.assertIn("ACT-02", md)
        self.assertIn("Payment gateway", md)
        self.assertIn("## Blockers", md)

    def test_pipes_in_cells_do_not_break_tables(self):
        md = report_builders.build_risk_register({"risks": [{"title": "a | b", "severity": "Low"}]})
        self.assertNotIn("a | b", md)

    def test_summary_contains_sections(self):
        md = report_builders.build_project_summary(FULL_SCOPE, RISKS, BLOCKERS, {"overall_score": 82, "health_status": "Healthy"})
        for heading in ("## Deliverables", "## Known risks", "## Pending decisions", "Healthy (82/100)"):
            self.assertIn(heading, md)

    def test_user_story_fallback(self):
        md = report_builders.build_user_stories_fallback(FULL_SCOPE)
        self.assertIn("US-01", md)
        self.assertIn("suggestions", md)


class JsonRepairTests(unittest.TestCase):
    def test_valid_json(self):
        self.assertEqual(pipeline.parse_json_object('{"a": 1}'), {"a": 1})

    def test_truncated_mid_list_is_repaired(self):
        raw = '{"risks": [{"title": "A", "severity": "High"}, {"title": "B", "sever'
        result = pipeline.parse_json_object(raw)
        self.assertEqual(result["risks"][0]["title"], "A")

    def test_text_before_json(self):
        self.assertEqual(pipeline.parse_json_object('Sure! {"x": [1, 2]}')["x"], [1, 2])

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            pipeline.parse_json_object("no json here")

    def test_normalizers_coerce_bad_types(self):
        risk = pipeline.normalize_risk({"risks": "oops", "delivery_forecast": None})
        self.assertEqual(risk["risks"], [])
        self.assertEqual(risk["delivery_forecast"]["status"], "Insufficient Evidence")
        blockers = pipeline.normalize_blockers({"blockers": [{"title": "x"}, {"title": "X"}, "bad"]})
        self.assertEqual(len(blockers["blockers"]), 1)  # de-duplicated, junk dropped

    def test_severity_counts(self):
        counts = pipeline.severity_counts([{"severity": "high"}, {"severity": "Low"}, {"severity": "??"}])
        self.assertEqual(counts["High"], 1)
        self.assertEqual(counts["Low"], 1)


class EvidenceTests(unittest.TestCase):
    def _chunks(self):
        return [
            ("A" * 400, {"filename": "a.txt", "chunk_index": 0}),
            ("B" * 400, {"filename": "a.txt", "chunk_index": 1}),
            ("C" * 400, {"filename": "a.txt", "chunk_index": 2}),
            ("D" * 400, {"filename": "b.csv", "chunk_index": 0}),
        ]

    def test_budget_is_respected(self):
        selected = select_chunks(self._chunks(), max_chars=1000)
        self.assertLessEqual(sum(len(t) + 70 for t, _ in selected), 1000)

    def test_every_document_is_represented(self):
        # a.txt chunks rank first, yet b.csv must still make it in
        selected = select_chunks(self._chunks(), max_chars=1000, per_doc_min=1)
        self.assertIn("b.csv", {m["filename"] for _, m in selected})

    def test_output_is_in_document_order_and_sources_deduped(self):
        context, sources = format_context(select_chunks(self._chunks(), max_chars=5000))
        self.assertTrue(context.startswith("Source: a.txt"))
        self.assertEqual(len(sources), 4)


class StoreTests(unittest.TestCase):
    def test_persistence_and_staleness(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cache.json"
            store = AnalysisStore(path)
            fp = fingerprint_for(["b", "a"])
            self.assertEqual(fp, fingerprint_for(["a", "b"]))
            self.assertTrue(store.is_stale("project", fp))

            store.set_part("project", "risk_analysis", {"risks": []}, fingerprint=fp)
            store.set_document("project", "risk_register", {"content": "x"})
            self.assertFalse(store.is_stale("project", fp))
            self.assertTrue(store.is_stale("project", fingerprint_for(["a", "b", "c"])))

            reloaded = AnalysisStore(path)  # simulates a server restart
            self.assertEqual(reloaded.get_results("project")["documents"]["risk_register"]["content"], "x")
            self.assertEqual(reloaded.get_state()["status"], "idle")

    def test_corrupt_cache_file_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cache.json"
            path.write_text("{not json", encoding="utf-8")
            self.assertIsNone(AnalysisStore(path).get_results("project"))


class OrchestratorTests(unittest.TestCase):
    """Runs the full pipeline with the LLM calls replaced by canned answers."""

    def test_full_run_populates_every_milestone_output(self):
        original = (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
                    pipeline.analyze_project_blockers, pipeline.generate_user_stories)
        pipeline.analyze_project_scope = lambda ctx: FULL_SCOPE
        pipeline.analyze_project_risks = lambda ctx: pipeline.normalize_risk(RISKS)
        pipeline.analyze_project_blockers = lambda ctx: pipeline.normalize_blockers(BLOCKERS)
        pipeline.generate_user_stories = lambda scope, ctx: {"content": "# User Stories", "method": "llm"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                store = AnalysisStore(Path(tmp) / "c.json")
                evidence = lambda scope, query, limit: ("ctx", [{"filename": "a.txt", "location": "x", "chunk_index": 0}])
                results = pipeline.run_full_analysis(store, evidence, "project", "fp1")

                for key in ("scope_analysis", "risk_analysis", "blocker_analysis", "health_report"):
                    self.assertIn(key, results)
                self.assertEqual(set(results["documents"]), {"user_stories", "risk_register", "action_items", "project_summary"})
                self.assertEqual(results["fingerprint"], "fp1")
                self.assertEqual(store.get_state()["status"], "idle")
                self.assertEqual(store.get_state()["progress"], 100)
                self.assertFalse(store.is_stale("project", "fp1"))
        finally:
            (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
             pipeline.analyze_project_blockers, pipeline.generate_user_stories) = original

    def test_a_failing_agent_does_not_stop_the_rest(self):
        original = (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
                    pipeline.analyze_project_blockers, pipeline.generate_user_stories)

        def boom(ctx):
            raise RuntimeError("model offline")

        pipeline.analyze_project_scope = boom
        pipeline.analyze_project_risks = lambda ctx: pipeline.normalize_risk(RISKS)
        pipeline.analyze_project_blockers = lambda ctx: pipeline.normalize_blockers(BLOCKERS)
        pipeline.generate_user_stories = lambda scope, ctx: {"content": "x", "method": "fallback"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                store = AnalysisStore(Path(tmp) / "c.json")
                evidence = lambda s, q, n: ("ctx", [{"filename": "a.txt"}])
                results = pipeline.run_full_analysis(store, evidence, "project", "fp")
                self.assertNotIn("scope_analysis", results)
                self.assertIn("risk_analysis", results)
                self.assertIn("scope", results["stage_errors"])
                self.assertIsNotNone(results["health_report"]["overall_score"])
        finally:
            (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
             pipeline.analyze_project_blockers, pipeline.generate_user_stories) = original


    def test_all_agents_failing_marks_the_run_as_error(self):
        original = (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
                    pipeline.analyze_project_blockers, pipeline.generate_user_stories)

        def boom(ctx):
            raise RuntimeError("ollama is not running")

        pipeline.analyze_project_scope = boom
        pipeline.analyze_project_risks = boom
        pipeline.analyze_project_blockers = boom
        pipeline.generate_user_stories = lambda scope, ctx: {"content": "x", "method": "fallback"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                store = AnalysisStore(Path(tmp) / "c.json")
                evidence = lambda s, q, n: ("ctx", [{"filename": "a.txt"}])
                pipeline.run_full_analysis(store, evidence, "project", "fp")
                state = store.get_state()
                self.assertEqual(state["status"], "error")
                self.assertIn("ollama is not running", state["error"])
                self.assertTrue(store.is_stale("project", "fp"))  # a failed run must not look fresh
        finally:
            (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
             pipeline.analyze_project_blockers, pipeline.generate_user_stories) = original


class FakeResponse:
    def __init__(self, status=200, payload=None, headers=None):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.headers = headers or {}
        self.ok = status < 400

    def json(self):
        return self._payload


def ok_reply(text):
    return FakeResponse(200, {"choices": [{"message": {"content": text}}]})


class LLMClientTests(unittest.TestCase):
    def setUp(self):
        import llm
        import requests
        self.llm, self.requests = llm, requests
        self.saved = (llm.REMOTE, llm.API_KEY, llm.PROVIDER, llm.time.sleep, requests.post)
        llm.REMOTE, llm.API_KEY, llm.PROVIDER = True, "test-key", "groq"
        llm.time.sleep = lambda *_: None

    def tearDown(self):
        (self.llm.REMOTE, self.llm.API_KEY, self.llm.PROVIDER,
         self.llm.time.sleep, self.requests.post) = self.saved

    def script(self, *responses):
        calls = []
        queue = list(responses)

        def fake_post(url, headers=None, json=None, timeout=None):
            calls.append(dict(json))  # snapshot: the client edits its body between attempts
            return queue.pop(0)

        self.requests.post = fake_post
        return calls

    def test_returns_text(self):
        self.script(ok_reply("  hello  "))
        self.assertEqual(self.llm.chat_text([{"role": "user", "content": "hi"}]), "hello")

    def test_rate_limit_is_retried(self):
        calls = self.script(FakeResponse(429, headers={"retry-after": "1"}), ok_reply("done"))
        self.assertEqual(self.llm.chat_text([{"role": "user", "content": "hi"}]), "done")
        self.assertEqual(len(calls), 2)

    def test_strict_json_rejection_falls_back_to_plain_output(self):
        calls = self.script(FakeResponse(400, {"error": {"message": "json_validate_failed"}}), ok_reply('{"a": 1}'))
        result = self.llm.chat_json("system", "user", max_tokens=50)
        self.assertEqual(result, {"a": 1})
        self.assertIn("response_format", calls[0])
        self.assertNotIn("response_format", calls[1])

    def test_bad_key_gives_a_clear_message(self):
        self.script(FakeResponse(401, {"error": {"message": "invalid"}}))
        with self.assertRaises(self.llm.LLMError) as ctx:
            self.llm.chat_text([{"role": "user", "content": "hi"}])
        self.assertIn("API key", str(ctx.exception))

    def test_missing_key_is_reported_before_any_request(self):
        self.llm.API_KEY = ""
        with self.assertRaises(self.llm.LLMError):
            self.llm.chat_text([{"role": "user", "content": "hi"}])

    def test_code_fenced_json_is_parsed(self):
        self.assertEqual(self.llm.parse_json_object('```json\n{"k": [1]}\n```'), {"k": [1]})


class CancellationTests(unittest.TestCase):
    def test_stale_run_stops_at_the_next_stage(self):
        original = (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
                    pipeline.analyze_project_blockers, pipeline.generate_user_stories)
        ran = []

        def scope(ctx):
            ran.append("scope")
            return FULL_SCOPE

        def risk(ctx):
            ran.append("risk")
            return pipeline.normalize_risk(RISKS)

        pipeline.analyze_project_scope = scope
        pipeline.analyze_project_risks = risk
        pipeline.analyze_project_blockers = lambda ctx: pipeline.normalize_blockers(BLOCKERS)
        pipeline.generate_user_stories = lambda scope, ctx: {"content": "x", "method": "llm"}
        try:
            with tempfile.TemporaryDirectory() as tmp:
                store = AnalysisStore(Path(tmp) / "c.json")
                evidence = lambda s, q, n: ("ctx", [{"filename": "a.txt"}])
                cancel = lambda: "scope" in ran  # documents change right after the scope stage
                pipeline.run_full_analysis(store, evidence, "project", "fp", cancel=cancel)
                self.assertEqual(ran, ["scope"])
                self.assertEqual(store.get_results("project")["scope_analysis"], FULL_SCOPE)  # finished stage kept
                self.assertEqual(store.get_state()["status"], "running")  # the next run takes over
                self.assertTrue(store.is_stale("project", "fp"))
        finally:
            (pipeline.analyze_project_scope, pipeline.analyze_project_risks,
             pipeline.analyze_project_blockers, pipeline.generate_user_stories) = original



class ParallelAnalysisTests(unittest.TestCase):
    """With a hosted model the three independent agents run at the same time."""

    def test_hosted_model_runs_agents_concurrently_and_keeps_all_results(self):
        import tempfile, time
        from pathlib import Path
        import llm, pipeline
        from store import AnalysisStore

        saved = (llm.REMOTE, pipeline.analyze_project_scope, pipeline.analyze_project_risks,
                 pipeline.analyze_project_blockers, pipeline.generate_user_stories)
        try:
            llm.REMOTE = True
            slow = lambda value: (lambda *_: (time.sleep(0.4), value)[1])
            pipeline.analyze_project_scope = slow({"project_name": "P", "objective": "o", "goals": ["g"], "deliverables": ["d"],
                                                   "milestones": ["m"], "timeline": ["t"], "responsibilities": ["r"],
                                                   "missing_information": [], "summary": "s"})
            pipeline.analyze_project_risks = slow(pipeline.normalize_risk({"risks": [{"title": "x", "severity": "High"}]}))
            pipeline.analyze_project_blockers = slow(pipeline.normalize_blockers({}))
            pipeline.generate_user_stories = lambda *_: {"content": "stories", "method": "llm"}
            with tempfile.TemporaryDirectory() as tmp:
                store = AnalysisStore(Path(tmp) / "a.json")
                started = time.time()
                results = pipeline.run_full_analysis(store, lambda *_: ("ctx", [{"filename": "a.txt", "location": "p1"}]), "project", "fp")
                elapsed = time.time() - started
            self.assertLess(elapsed, 1.0)  # three 0.4 s agents would take 1.2 s one after another
            for part in ("scope_analysis", "risk_analysis", "blocker_analysis", "health_report"):
                self.assertIn(part, results)
        finally:
            (llm.REMOTE, pipeline.analyze_project_scope, pipeline.analyze_project_risks,
             pipeline.analyze_project_blockers, pipeline.generate_user_stories) = saved


if __name__ == "__main__":
    unittest.main()
