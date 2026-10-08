#!/usr/bin/env python3
"""
Guarded autonomous developer for Fun class 2D.

Design:
- Gemini proposes a unified diff for exactly one small, player-facing improvement.
- Only game source/public assets may be changed.
- Never edits CI, Render config, secrets, package manifests, or ATRS.
- Runs typecheck/build before allowing a commit.
- Up to MAX_AI_CALLS calls per scheduled run.
"""
import json, os, re, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
KEY = os.getenv("GEMINI_API_KEY", "")
MAX_CALLS = int(os.getenv("MAX_AI_CALLS", "3"))

if not KEY:
    print("GEMINI_API_KEY is not configured; safe no-op.")
    sys.exit(0)

def sh(cmd, cwd=ROOT, check=True):
    p = subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if check and p.returncode:
        raise RuntimeError(p.stdout[-12000:])
    return p.stdout

def context():
    tree = sh(["bash","-lc","git ls-files 'metaverse/apps/web/src/**' 'metaverse/apps/web/public/**' | head -n 220"])
    status = sh(["git","status","--short"])
    log = sh(["git","log","-6","--oneline"])
    todo = sh(["bash","-lc","git grep -n -E 'TODO|FIXME|HACK' -- metaverse/apps/web/src metaverse/apps/web/public 2>/dev/null | head -n 80"], check=False)
    key_files = [
        "metaverse/apps/web/src/game/config/spaces.ts",
        "metaverse/apps/web/src/game/scenes/SpaceScene.ts",
        "metaverse/apps/web/src/game/scenes/MultiplayerSpaceScene.ts",
        "metaverse/apps/web/src/game/GridMovement.ts",
    ]
    snippets = []
    for f in key_files:
        p = ROOT / f
        if p.exists():
            snippets.append("\n--- " + f + " ---\n" + p.read_text()[:18000])
    return f"""RECENT COMMITS:
{log}

WORKTREE:
{status}

GAME FILE TREE:
{tree}

TODO/FIXME:
{todo}

KEY CODE:
{''.join(snippets)}
"""

def ask(instruction, extra=""):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}"
    prompt = f"""You are the guarded autonomous developer for the multiplayer browser game "Fun class 2D".
Repository is the current Git checkout. You must improve the existing game, not redesign it.

HARD RULES:
1. Pick exactly ONE small, high-value player-facing improvement.
2. Preserve multiplayer, chat/speech bubbles, English Tablet, central Hub routing, existing room portals and current classroom right-door behavior.
3. Do not touch ATRS or any unrelated project.
4. Do not change secrets, CI, Render configuration, package manifests/lockfiles, database/schema, auth, quotas, or infrastructure.
5. Only change files under metaverse/apps/web/src or metaverse/apps/web/public.
6. Do not invent nonexistent APIs. Follow existing architecture and TypeScript style.
7. Return a unified diff that applies cleanly to the current checkout.
8. If there is no safe improvement, return an empty patch.
9. Keep the change small enough to review and test in one CI run.

CURRENT REPOSITORY CONTEXT:
{context()}

TASK:
{instruction}

{extra}

Return ONLY valid JSON:
{{"summary":"short summary","rationale":"why this is safe/useful","patch":"unified diff or empty string"}}
"""
    data = json.dumps({"contents":[{"parts":[{"text":prompt}]}],"generationConfig":{"temperature":0.2,"responseMimeType":"application/json"}}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = json.load(r)
    text = raw["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)

def safe_paths():
    changed = sh(["bash","-lc","git diff --name-only"], check=False).splitlines()
    allowed = [x.startswith("metaverse/apps/web/src/") or x.startswith("metaverse/apps/web/public/") for x in changed]
    return changed, bool(changed) and all(allowed)

def apply_patch(patch):
    if not patch.strip():
        return False
    patch = patch.replace("\\r\\n","\\n")
    proc = subprocess.run(["git","apply","--whitespace=error-all","-"], input=patch, text=True, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if proc.returncode:
        raise RuntimeError("git apply failed:\\n" + proc.stdout)
    changed, ok = safe_paths()
    if not ok:
        sh(["git","reset","--hard","HEAD"], check=False)
        raise RuntimeError("Safety gate rejected changed paths: " + repr(changed))
    return True

def test():
    sh(["bun","run","--cwd","apps/web","check-types"], cwd=ROOT/"metaverse")
    sh(["bun","run","--cwd","apps/web","build"], cwd=ROOT/"metaverse")
    sh(["git","diff","--check"])

def main():
    if sh(["git","status","--porcelain"]) .strip():
        print("Dirty checkout detected; refusing autonomous edits.")
        return
    calls = 0
    task = """Inspect the current game and implement the single most useful low-risk improvement you can justify from the codebase.
Prefer fixing an actual UX/gameplay issue over adding a speculative feature."""
    for attempt in range(MAX_CALLS):
        calls += 1
        try:
            result = ask(task)
            print("AI:", result.get("summary",""))
            if not apply_patch(result.get("patch","")):
                print("No safe patch proposed.")
                return
            try:
                test()
                print("BUILD/TYPECHECK: PASS")
                return
            except Exception as e:
                err = str(e)
                print("TEST FAILED; reverting and asking AI for a focused fix.")
                sh(["git","reset","--hard","HEAD"], check=False)
                task = """A previous proposed change failed validation. Fix ONLY the validation failure while preserving the existing game behavior.
Do not broaden scope. Return a minimal patch."""
                # Include only the failure, not unbounded logs.
                extra = "\nVALIDATION FAILURE:\n" + err[-9000:]
                result = ask(task, extra)
                if not apply_patch(result.get("patch","")):
                    raise RuntimeError("No safe repair patch.")
                test()
                print("REPAIR BUILD/TYPECHECK: PASS")
                return
        except Exception as e:
            print("AUTONOMOUS CYCLE STOPPED:", str(e)[-12000:])
            sh(["git","reset","--hard","HEAD"], check=False)
            return
    print("AI call budget exhausted without a verified change.")

if __name__ == "__main__":
    main()
