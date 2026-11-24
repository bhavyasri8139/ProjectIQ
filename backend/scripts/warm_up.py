"""Pre-load the sample project and finish the full analysis BEFORE a demo.

Usage (backend must be running, Ollama models pulled):
    python scripts/warm_up.py            # load sample docs, wait for analysis
    python scripts/warm_up.py --url http://localhost:8000

Results are cached on disk (analysis_cache.json), so the dashboard shows every
milestone output instantly, even after restarting the server.
"""

import argparse
import sys
import time

import requests


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    api = args.url.rstrip("/")

    health = requests.get(f"{api}/api/health", timeout=10).json()
    print("Backend:", health.get("status"), "| AI:", health.get("llm_provider"), health.get("chat_model"), "| embeddings:", health.get("embedding_model"))
    for problem in health.get("problems", []):
        print("Problem:", problem)

    loaded = requests.post(f"{api}/api/demo/load", timeout=60).json()
    print(f"Queued {loaded.get('loaded', 0)} sample document(s).")

    start = time.time()
    last = ""
    requested = False
    while time.time() - start < args.timeout:
        dash = requests.get(f"{api}/api/dashboard", timeout=10).json()
        docs, state = dash["documents"], dash["state"]
        line = f"docs indexed {docs['indexed']}/{docs['total']} | analysis {state['status']} {state.get('progress', 0)}% {state.get('message', '')}"
        if line != last:
            print(line)
            last = line
        if state["status"] == "error":
            print("Analysis failed:", state.get("message"))
            print("Check the AI settings in backend/.env (API key), then run this script again.")
            return 1
        idle = docs["processing"] == 0 and state["status"] != "running"
        if idle and dash["stale"] and docs["in_project"] and not requested:
            requests.post(f"{api}/api/analysis/run", json={}, timeout=10)  # documents already loaded but not analysed
            requested = True
        finished = docs["processing"] == 0 and state["status"] != "running" and dash["results"].get("health_report") and not dash["stale"]
        if finished:
            report = dash["results"]["health_report"]
            print(f"Done in {time.time() - start:.0f}s. Health: {report['health_status']} ({report['overall_score']}/100)")
            return 0
        time.sleep(3)
    print("Timed out waiting for the analysis.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
