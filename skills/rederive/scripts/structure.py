#!/usr/bin/env python3
"""Summarize a repo's code structure for when its history is too thin to read decisions from.

Usage: python3 -I structure.py <repo path>
Prints entry points, the internal import graph (most imported files, files that import
the most, edges among the central files) and the external packages used most.
Covers JS/TS, Python, Go and Rust. Output is capped so it fits in context.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")

SOURCE_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs"}
JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
NOISE = re.compile(
    r"(^|/)(node_modules|vendor|dist|build|\.next|target|third_party|__pycache__|\.venv|venv)/"
    r"|\.min\.js$|\.d\.ts$"
)
ENTRY_NAMES = re.compile(
    r"(^|/)(main|index|app|server|cli|__main__|manage|background|content|popup|worker)\.[a-z]+$"
)

JS_IMPORT = re.compile(
    r"""(?:import\s[^'"]*?from\s*|import\s*\(?\s*|require\s*\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]"""
)
PY_FROM = re.compile(r"^\s*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)", re.M)
PY_IMPORT = re.compile(r"^\s*import\s+([\w., ]+)", re.M)
GO_IMPORT_BLOCK = re.compile(r"import\s*\(([^)]*)\)", re.S)
GO_IMPORT_ONE = re.compile(r'import\s+(?:\w+\s+)?"([^"]+)"')
RS_MOD = re.compile(r"^\s*(?:pub\s+)?mod\s+(\w+)\s*;", re.M)
RS_USE = re.compile(r"^\s*(?:pub\s+)?use\s+(crate|super|self)::(\w+)", re.M)
RS_EXT = re.compile(r"^\s*(?:pub\s+)?use\s+(\w+)::", re.M)


def list_files():
    try:
        out = subprocess.run(["git", "-C", repo, "ls-files"], capture_output=True, text=True, check=True).stdout
        files = out.splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError):
        files = []
        for root, dirs, names in os.walk(repo):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for n in names:
                files.append(os.path.relpath(os.path.join(root, n), repo))
    return [f for f in files if not NOISE.search(f)]


def read(path):
    try:
        with open(os.path.join(repo, path), encoding="utf-8", errors="replace") as fh:
            return fh.read(400_000)
    except OSError:
        return ""


files = list_files()
fileset = set(files)
sources = [f for f in files if os.path.splitext(f)[1] in SOURCE_EXT]
# Tests import everything, so they would crowd out the real structure.
TEST = re.compile(r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]*$|[._](test|spec)\.[a-z]+$|_test\.(go|py)$")

go_module = ""
if "go.mod" in fileset:
    m = re.search(r"^module\s+(\S+)", read("go.mod"), re.M)
    go_module = m.group(1) if m else ""


def resolve_js(src, spec):
    if not spec.startswith("."):
        return None
    base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    candidates = [base] + [base + e for e in JS_EXT] + [base + "/index" + e for e in JS_EXT]
    for c in candidates:
        if c in fileset:
            return c
    return None


def resolve_py(src, module, names):
    if module.startswith("."):
        dots = len(module) - len(module.lstrip("."))
        pkg = os.path.dirname(src)
        for _ in range(dots - 1):
            pkg = os.path.dirname(pkg)
        rest = module.lstrip(".")
        base = os.path.join(pkg, *rest.split(".")) if rest else pkg
    else:
        base = os.path.join(*module.split("."))
    tries = [base + ".py", base + "/__init__.py"]
    names = [n.strip(" ()").split(" as ")[0].strip() for n in names.split(",")]
    tries += [os.path.join(base, n) + ".py" for n in names if n not in ("", "*")]
    # Projects often keep packages under src/.
    tries += ["src/" + t for t in tries]
    hits = [os.path.normpath(t) for t in tries if os.path.normpath(t) in fileset]
    # "from pkg import mod" points at mod, not at the package's __init__.
    specific = [h for h in hits if not h.endswith("__init__.py")]
    return specific or hits


def go_pkg_files(pkg_dir):
    return [f for f in sources if os.path.dirname(f) == pkg_dir and f.endswith(".go") and not f.endswith("_test.go")]


edges = defaultdict(set)
external = Counter()

for src in sources:
    text = read(src)
    ext = os.path.splitext(src)[1]
    if ext in JS_EXT:
        for spec in JS_IMPORT.findall(text):
            target = resolve_js(src, spec)
            if target:
                edges[src].add(target)
            elif not spec.startswith("."):
                parts = spec.split("/")
                external[("/".join(parts[:2]) if spec.startswith("@") else parts[0])] += 1
    elif ext == ".py":
        for module, names in PY_FROM.findall(text):
            hits = resolve_py(src, module, names)
            edges[src].update(hits)
            if not hits and not module.startswith("."):
                external[module.split(".")[0]] += 1
        for group in PY_IMPORT.findall(text):
            for module in group.split(","):
                module = module.strip().split(" ")[0]
                if not module:
                    continue
                hits = resolve_py(src, module, "")
                edges[src].update(hits)
                if not hits:
                    external[module.split(".")[0]] += 1
    elif ext == ".go":
        specs = GO_IMPORT_ONE.findall(text)
        for block in GO_IMPORT_BLOCK.findall(text):
            specs += re.findall(r'"([^"]+)"', block)
        for spec in specs:
            if go_module and spec.startswith(go_module + "/"):
                for target in go_pkg_files(spec[len(go_module) + 1:]):
                    edges[src].add(target)
            elif go_module and spec == go_module:
                for target in go_pkg_files(""):
                    edges[src].add(target)
            else:
                external[spec] += 1
    elif ext == ".rs":
        here = os.path.dirname(src)
        for name in RS_MOD.findall(text):
            for c in (os.path.join(here, name + ".rs"), os.path.join(here, name, "mod.rs")):
                if os.path.normpath(c) in fileset:
                    edges[src].add(os.path.normpath(c))
        for _, name in RS_USE.findall(text):
            for c in (os.path.join(here, name + ".rs"), os.path.join("src", name + ".rs"), os.path.join("src", name, "mod.rs")):
                if os.path.normpath(c) in fileset:
                    edges[src].add(os.path.normpath(c))
        for crate in RS_EXT.findall(text):
            if crate not in ("crate", "super", "self", "std", "core", "alloc"):
                external[crate] += 1

for src in list(edges):
    edges[src].discard(src)
    if TEST.search(src):
        del edges[src]

indegree = Counter(t for targets in edges.values() for t in targets)


def lines(path):
    return read(path).count("\n")


print("## Code size")
print(f"source files: {len(sources)} ({sum(1 for f in sources if TEST.search(f))} tests, left out of the graph) | internal import edges: {sum(len(t) for t in edges.values())}")
by_ext = Counter(os.path.splitext(f)[1] for f in sources)
print("by type: " + ", ".join(f"{e} {n}" for e, n in by_ext.most_common(6)))

print()
print("## Entry points")
entries = []
if "package.json" in fileset:
    try:
        pkg = json.loads(read("package.json"))
        for key in ("main", "module", "bin"):
            val = pkg.get(key)
            if isinstance(val, str):
                entries.append(f"package.json {key}: {val}")
            elif isinstance(val, dict):
                entries += [f"package.json bin {k}: {v}" for k, v in val.items()]
        for k, v in list(pkg.get("scripts", {}).items())[:6]:
            entries.append(f"package.json script {k}: {v[:100]}")
    except ValueError:
        pass
for f in files:
    if f.endswith("manifest.json") and f.count("/") <= 2:
        entries.append(f"extension or app manifest: {f}")
for f in sources:
    if f.count("/") <= 3 and (ENTRY_NAMES.search(f) or "if __name__" in read(f)[-3000:]):
        if indegree[f] == 0 or ENTRY_NAMES.search(f):
            entries.append(f"{f} ({lines(f)} lines, imported by {indegree[f]})")
for e in entries[:20]:
    print(e)
if not entries:
    print("none found by name; start from the files that import the most")

print()
print("## Most imported internal files (top 15): the shared core")
for f, n in indegree.most_common(15):
    print(f"{n:3d}  {f} ({lines(f)} lines)")

print()
print("## Files that import the most internal files (top 10): the orchestrators")
for f, t in sorted(edges.items(), key=lambda kv: -len(kv[1]))[:10]:
    if t:
        print(f"{len(t):3d}  {f} ({lines(f)} lines)")

print()
print("## Largest source files (top 10)")
for f in sorted(sources, key=lines, reverse=True)[:10]:
    print(f"{lines(f):5d}  {f}")

central = {f for f, _ in indegree.most_common(12)} | {f for f, _ in sorted(edges.items(), key=lambda kv: -len(kv[1]))[:6]}
print()
print("## Edges among the central files (who imports whom)")
shown = 0
for src in sorted(central):
    targets = sorted(t for t in edges.get(src, ()) if t in central)
    if targets and shown < 25:
        print(f"{src} -> {', '.join(targets)}")
        shown += 1

print()
print("## External packages used most (top 15)")
print(", ".join(f"{p} ({n})" for p, n in external.most_common(15)) or "none found")
