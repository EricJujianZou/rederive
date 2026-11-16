#!/usr/bin/env python3
"""Summarize a repo's code structure for when its history is too thin to read decisions from.

Usage: python3 -I structure.py <repo path> [scope path inside the repo]
Prints entry points, the internal import graph (most imported files, files that import
the most, edges among the central files) and the external packages used most.
Covers JS/TS, Python, Go and Rust. Output is capped so it fits in context.
With a scope, only files under that path are summarized, but imports still resolve
against the whole repo, so the files the scope depends on show up in their own list.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
scope = sys.argv[2] if len(sys.argv) > 2 else ""
scope = os.path.relpath(scope, repo) if os.path.isabs(scope) else scope
scope = (scope[2:] if scope.startswith("./") else scope).rstrip("/")
scope = "" if scope == "." else scope

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
        # With a scope, keep paths like café/ unquoted so they can match it.
        quote = ["-c", "core.quotePath=off"] if scope else []
        out = subprocess.run(["git", "-C", repo, *quote, "ls-files"], capture_output=True, text=True, check=True).stdout
        files = out.splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError):
        files = []
        for root, dirs, names in os.walk(repo):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for n in names:
                files.append(os.path.relpath(os.path.join(root, n), repo))
    return files


def read(path):
    try:
        with open(os.path.join(repo, path), encoding="utf-8", errors="replace") as fh:
            return fh.read(400_000)
    except OSError:
        return ""


all_files = list_files()
files = [f for f in all_files if not NOISE.search(f)]
fileset = set(files)
sources = [f for f in files if os.path.splitext(f)[1] in SOURCE_EXT]


def in_scope(path):
    return not scope or path == scope or path.startswith(scope + "/")


def depth(path):
    # Depth below the scope, so entry points are found the same way inside a subsystem.
    return (path[len(scope) + 1:] if scope and path != scope else path).count("/")


# Checked before the noise filter, so a scope inside vendor/ gives an empty summary, not an error.
if scope and not any(in_scope(f) for f in all_files):
    print(f"SCOPE_NOT_FOUND: {scope}")
    sys.exit(1)
# Imports resolve against every source file; only the scoped ones are read and reported.
scoped = [f for f in sources if in_scope(f)]
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
outside = Counter()

for src in scoped:
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
        continue
    for t in sorted(t for t in edges[src] if not in_scope(t)):
        outside[t] += 1
        edges[src].discard(t)

indegree = Counter(t for targets in edges.values() for t in targets)


def lines(path):
    return read(path).count("\n")


print("## Code size")
print(f"source files: {len(scoped)} ({sum(1 for f in scoped if TEST.search(f))} tests, left out of the graph) | internal import edges: {sum(len(t) for t in edges.values())}")
by_ext = Counter(os.path.splitext(f)[1] for f in scoped)
print("by type: " + ", ".join(f"{e} {n}" for e, n in by_ext.most_common(6)))

print()
print("## Entry points")
entries = []
if "package.json" in fileset and not scope:
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
    if f.endswith("manifest.json") and in_scope(f) and depth(f) <= 2:
        entries.append(f"extension or app manifest: {f}")
for f in scoped:
    if depth(f) <= 3 and (ENTRY_NAMES.search(f) or "if __name__" in read(f)[-3000:]):
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

if scope:
    print()
    print("## Outside files the scope imports (top 15)")
    for f, n in outside.most_common(15):
        print(f"{n:3d}  {f} ({lines(f)} lines)")
    if not outside:
        print("none")

print()
print("## Files that import the most internal files (top 10): the orchestrators")
for f, t in sorted(edges.items(), key=lambda kv: -len(kv[1]))[:10]:
    if t:
        print(f"{len(t):3d}  {f} ({lines(f)} lines)")

print()
print("## Largest source files (top 10)")
for f in sorted(scoped, key=lines, reverse=True)[:10]:
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
