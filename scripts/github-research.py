#!/usr/bin/env python3
# Phase A: جمع بيانات حقيقية من GitHub API — نجوم/رخصة/آخر تحديث لكل أداة
import json, urllib.request, sys, time

REPOS = [
    ("OpenManus", ["FoundationAgents/OpenManus", "mannaandpoem/OpenManus"]),
    ("OpenHands", ["All-Hands-AI/OpenHands"]),
    ("Aider", ["Aider-AI/aider"]),
    ("Cline", ["cline/cline"]),
    ("AutoGen", ["microsoft/autogen"]),
    ("CrewAI", ["crewAIInc/crewAI"]),
    ("LangGraph", ["langchain-ai/langgraph"]),
    ("smolagents", ["huggingface/smolagents"]),
    ("Dify", ["langgenius/dify"]),
    ("mem0", ["mem0ai/mem0"]),
    ("Letta (MemGPT)", ["letta-ai/letta"]),
    ("LlamaIndex", ["run-llama/llama_index"]),
    ("Chroma", ["chroma-core/chroma"]),
    ("sqlite-vec", ["asg017/sqlite-vec"]),
    ("isolated-vm", ["isolated-vm/isolated-vm"]),
    ("Pyodide", ["pyodide/pyodide"]),
    ("gVisor", ["google/gvisor"]),
    ("Firejail", ["netblue30/firejail"]),
    ("SearXNG", ["searxng/searxng"]),
    ("Crawl4AI", ["unclecode/crawl4ai"]),
    ("Jina Reader", ["jina-ai/reader"]),
    ("Firecrawl", ["firecrawl/firecrawl", "mendableai/firecrawl"]),
    ("LiteLLM", ["BerriAI/litellm"]),
    ("one-api", ["songquanpeng/one-api"]),
    ("Reflexion", ["noahshinn/reflexion"]),
    ("OpenAI Evals", ["openai/evals"]),
]

def api(path):
    req = urllib.request.Request(f"https://api.github.com{path}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "cod-dhaki-research"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def repo_data(cands):
    for full in cands:
        try:
            d = api(f"/repos/{full}")
            return d
        except Exception as e:
            last = str(e)
    return None

out = []
for name, cands in REPOS:
    d = repo_data(cands)
    if d is None:
        out.append({"name": name, "ok": False, "reason": "غير موجود/محجوب"})
    else:
        out.append({
            "ok": True, "name": name, "full": d["full_name"],
            "stars": d["stargazers_count"], "license": (d.get("license") or {}).get("spdx_id") or "بدون",
            "pushed": (d.get("pushed_at") or "")[:10], "lang": d.get("language") or "-",
            "desc": (d.get("description") or "")[:120],
            "url": d["html_url"],
        })
    time.sleep(0.3)

with open("tool-results/github-research.json", "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
ok = [r for r in out if r["ok"]]
print(f"fetched {len(ok)}/{len(out)} repos OK")
for r in ok:
    print(f'{r["name"]:16s} ★{r["stars"]:>6} {r["license"]:10s} {r["pushed"]} {r["full"]}')
for r in out:
    if not r["ok"]:
        print(f'{r["name"]:16s} FAILED: {r["reason"]}')
