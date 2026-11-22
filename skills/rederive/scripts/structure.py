#!/usr/bin/env python3
"""Summarize a repo's code structure for when its history is too thin to read decisions from.

Usage: python3 -I structure.py <repo path>
Prints entry points, the internal import graph (most imported files, files that import
the most, edges among the central files) and the external packages used most.
Covers JS/TS, Python, Go, Rust, C/C++ and C# (with Razor). Output is capped so it fits in context.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")

C_HEADER_EXT = {".h", ".hh", ".hpp", ".hxx"}
C_SOURCE_EXT = [".c", ".cc", ".cpp", ".cxx"]
C_EXT = C_HEADER_EXT | set(C_SOURCE_EXT)
CS_EXT = {".cs", ".razor", ".cshtml"}
SOURCE_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs"} | C_EXT | CS_EXT
JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
NOISE = re.compile(
    r"(^|/)(node_modules|vendor|dist|build|\.next|target|third_party|__pycache__|\.venv|venv)/"
    r"|\.min\.js$|\.d\.ts$"
)
# C projects keep vendored libraries in deps/ (redis, h2o). Only C files there count as noise.
C_NOISE = re.compile(r"(^|/)deps/.*\.(c|h|cc|cpp|cxx|hpp|hh|hxx)$")
# .NET build output and generated code: bin/ and obj/ only count as noise for C# files (Rust has src/bin/).
CS_NOISE = re.compile(
    r"(^|/)(bin|obj)/.*\.(cs|razor|cshtml)$|\.(g|g\.i|designer|Designer)\.cs$"
    r"|(^|/)Migrations/.*\.cs$|(^|/)AssemblyInfo\.cs$"
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
# `mod x;` (a module in its own file) and `mod x {` (an inline module), in one pass.
RS_MOD = re.compile(r"^[ \t]*(?:#\[[^\]]*\][ \t]*)*(?:pub(?:\([^)]*\))?[ \t]+)?mod[ \t]+(\w+)[ \t]*([;{])", re.M)
# The tree must start like a path, so a string line such as "use a larger buffer;" is skipped.
RS_USE = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+((?:::)?(?:r#)?\w+(?:\s*::[^;]*|\s+as\s+\w+)?)\s*;", re.M)
RS_PACKAGE = re.compile(r"^\[package\][ \t]*$(.*?)(?=^\[|\Z)", re.M | re.S)
RS_NAME = re.compile(r'^name\s*=\s*"([^"]+)"', re.M)
# Comments, strings and char literals, blanked before counting braces.
RS_NOISE = re.compile(r"//[^\n]*|/\*.*?\*/|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])'", re.S)
RS_ROOT_DIRS = ("bin", "benches", "examples", "tests")
C_INCLUDE = re.compile(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', re.M)
C_MAIN = re.compile(r"\bint\s+main\s*\(")
# C# keeps no file paths in its imports: `using A.B;` opens a namespace that many files add to.
# So a file is linked to the files that declare the types it names, among the namespaces it can see.
CS_NOISE_TEXT = re.compile(
    r'//[^\n]*|/\*.*?\*/|""".*?"""|@\$?"(?:""|[^"])*"|\$?@"(?:""|[^"])*"|\$?"(?:\\.|[^"\\\n])*"'
    r"|'(?:\\.|[^'\\\n])'",
    re.S,
)
CS_NAMESPACE = re.compile(r"^[ \t]*namespace\s+(@?[\w.]+)\s*[;{]", re.M)
# Type names are taken as PascalCase, so `foreach (var record in rows)` declares no type "in".
CS_TYPE = re.compile(
    r"\b(?:class|interface|struct|enum|record(?:\s+(?:class|struct))?)\s+@?([A-Z]\w*)"
    r"|\bdelegate\s+[\w<>\[\],.? ]+?\s+([A-Z]\w*)\s*[<(]"
)
# `Type name` followed by ; = { ) , => or in: group 1 is the type, group 2 the name of a property,
# field, parameter or local.
CS_DECLARED = re.compile(
    r"\b(?!(?:new|return|throw|await|yield|case|is|as|in|out|ref|else|goto|class|struct|interface|enum|record"
    r"|namespace|using|typeof|nameof|default|when|select|from|where|orderby|group|let|join|on|equals|by|into"
    r"|params|this|base|not|and|or|with|static|const|readonly|public|private|protected|internal|override)\b)"
    r"([A-Za-z_][\w.]*)(?:<[^<>;{}()]*(?:<[^<>;{}()]*>[^<>;{}()]*)*>)?\??(?:\[[,\s]*\])?\s+@?([A-Za-z_]\w*)"
    r"\s*(?=[;={),]|=>|\bin\b)"
)
CS_USING = re.compile(r"^[ \t]*(global\s+)?using\s+(static\s+)?(?:(\w+)\s*=\s*)?(@?[\w.]+)\s*;", re.M)
CS_NAME = re.compile(r"(?<![\w.])@?([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)")
CS_MAIN = re.compile(r"\bstatic\s+(?:async\s+)?(?:void|int|Task(?:<int>)?)\s+Main\s*\(")
RAZOR_COMMENT = re.compile(r"@\*.*?\*@", re.S)
RAZOR_DIRECTIVE = re.compile(r"^[ \t]*@(using|inject|inherits|implements|model|layout|typeparam|attribute|namespace)\b([^\n]*)", re.M)
RAZOR_BLOCK = re.compile(r"@(?:code|functions)\s*\{")
RAZOR_TAG = re.compile(r"</?([A-Z][\w.]*)")
RAZOR_EXPR = re.compile(r"@\(([^)\n]*)\)|@(?!code\b|functions\b)([A-Za-z_][\w.]*)")


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
    return [f for f in files if not NOISE.search(f) and not C_NOISE.search(f) and not CS_NOISE.search(f)]


def read(path, limit=400_000):
    try:
        with open(os.path.join(repo, path), encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


files = list_files()
fileset = set(files)
sources = [f for f in files if os.path.splitext(f)[1] in SOURCE_EXT]
# Tests import everything, so they would crowd out the real structure.
TEST = re.compile(
    r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]*$|[._](test|spec)\.[a-z]+$|_test\.(go|py)$"
    r"|(^|/)[^/]*\.(Unit|Integration|Functional)?Tests?/|Tests?\.cs$"  # .NET test projects (App.Tests/)
)

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


def rs_paths(tree):
    # "crate::{a, b::{c, d}}" -> ["crate::a", "crate::b::c", "crate::b::d"]
    tree = re.sub(r"\s+", "", re.sub(r"//[^\n]*|\s+as\s+\w+", "", tree))
    out = []

    def walk(prefix, part):
        i = part.find("{")
        if i < 0:
            out.append(prefix + part)
            return
        head, body, depth, start = prefix + part[:i], part[i + 1:part.rfind("}")], 0, 0
        for j, ch in enumerate(body + ","):
            depth += (ch == "{") - (ch == "}")
            if ch == "," and depth == 0:
                if body[start:j]:
                    walk(head, body[start:j])
                start = j + 1

    walk("", tree)
    return out


def rs_root_dir(d):
    # bin/, benches/, examples/ or tests/ right under a package (or its src/), not any folder with that name.
    return os.path.basename(d) in RS_ROOT_DIRS and os.path.dirname(d) in rs_root_parents


def rs_is_root(path):
    # A crate root file: the package's lib.rs/main.rs, build.rs next to Cargo.toml, a file directly
    # in bin/, benches/, examples/ or tests/, or main.rs of a folder there (src/bin/tool/main.rs).
    stem = os.path.splitext(os.path.basename(path))[0]
    here = os.path.dirname(path)
    if rs_root_dir(here):
        return True
    if stem == "build":
        return os.path.join(here, "Cargo.toml") in fileset
    return stem in ("lib", "main") and (here in crate_srcs or here == "src" or rs_root_dir(os.path.dirname(here)))


def rs_crate_src(path):
    # The folder crate:: starts from: the nearest binary, bench or example root, else the package's src/.
    here = d = os.path.dirname(path)
    while d:
        if d in crate_srcs:
            return d
        if rs_root_dir(os.path.dirname(d)) and os.path.join(d, "main.rs") in fileset:
            return d
        if d == here and rs_root_dir(d):
            return d
        d = os.path.dirname(d)
    return "src"


def rs_mod_dir(path):
    # Folder that holds a module's children: src/a/mod.rs and src/a.rs both own src/a/,
    # and a crate root owns its own folder.
    stem = os.path.splitext(os.path.basename(path))[0]
    here = os.path.dirname(path)
    return here if stem == "mod" or rs_is_root(path) else os.path.join(here, stem)


def rs_module_file(d):
    return next((c for c in (d + ".rs", os.path.join(d, "mod.rs")) if c in fileset), None)


def rs_file(base, segs):
    # The longest prefix of the path that is a module file: crate::a::b::Item -> src/a/b.rs.
    for n in range(len(segs), 0, -1):
        hit = rs_module_file(os.path.join(base, *segs[:n]))
        if hit:
            return hit
    return None


def rs_inline_spans(text, inline):
    # (start, end) of each inline `mod name { ... }` body, with braces in comments and literals ignored.
    # Only the text from the first inline mod on is scanned; it is usually `mod tests` at the end.
    if not inline:
        return []
    base = inline[0].start()
    clean = RS_NOISE.sub(lambda m: " " * (m.end() - m.start()), text[base:])
    close, stack = {}, []
    for m in re.finditer(r"[{}]", clean):
        if m.group() == "{":
            stack.append(m.start())
        elif stack:
            close[stack.pop()] = m.start()
    return [(m.end(), base + close.get(m.end() - 1 - base, len(clean))) for m in inline]


def resolve_rs(src, path, inline=0, local=()):
    """Returns (internal file or None, external crate name or None) for one use path.
    inline is how many inline `mod x { }` blocks the use sits in; each one uses up a super.
    local holds the modules this file declares, so `mod x; use x::Y;` stays inside the crate."""
    segs = [x[2:] if x.startswith("r#") else x for x in path.split("::") if x and x != "*"]
    if len(segs) > 1 and segs[-1] == "self":  # use a::b::{self} means a::b
        segs = segs[:-1]
    if not segs:
        return None, None
    first = segs[0]
    if first == "crate":
        # ponytail: an item at the crate root (crate::Foo -> lib.rs) gets no edge, lib.rs is mostly re-exports.
        return rs_file(rs_crate_src(src), segs[1:]), None
    if first in ("self", "super"):
        if first == "self" and inline:
            return None, None  # self:: inside an inline mod points into this same file
        supers = next((i for i, x in enumerate(segs) if x != "super"), len(segs))
        if first == "super" and supers <= inline:
            return None, None  # super:: that only climbs out of inline mods stays in this file
        segs = segs[inline:] if first == "super" else segs
        base = rs_mod_dir(src)
        if first == "self":
            segs = segs[1:]
        while segs and segs[0] == "super":
            base, segs = os.path.dirname(base), segs[1:]
        hit = rs_file(base, segs)
        if not hit and base != rs_crate_src(src):
            hit = rs_module_file(base)  # super::Item lives in the parent module's own file
        return hit, None
    if first in local:
        return rs_file(rs_mod_dir(src), segs), None
    if first in crate_by_name:
        return rs_file(crate_by_name[first], segs[1:]), None
    if first in ("std", "core", "alloc") or first[0].isupper():  # use Enum::* is not a crate
        return None, None
    return None, first


def resolve_c(src, spec):
    # Without the build's include paths, try the including file's folder, then any file
    # whose path ends with the spec, closest folder first.
    near = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    if near in fileset:
        return near
    spec = re.sub(r"^(\.\.?/)+", "", spec)  # "../x/y.h" that missed above: match it as "x/y.h"
    hits = [f for f in by_name.get(os.path.basename(spec), ()) if f == spec or f.endswith("/" + spec)]
    if not hits:
        return None
    here = os.path.dirname(src).split("/")

    def shared(f):
        n = 0
        for a, b in zip(here, os.path.dirname(f).split("/")):
            if a != b:
                break
            n += 1
        return n

    return min(hits, key=lambda f: (-shared(f), len(f), f))


def impl_for(header):
    stem, ext = os.path.splitext(header)
    if ext not in C_HEADER_EXT:
        return None
    return next((stem + e for e in C_SOURCE_EXT if stem + e in fileset), None)


def go_pkg_files(pkg_dir):
    return [f for f in sources if os.path.dirname(f) == pkg_dir and f.endswith(".go") and not f.endswith("_test.go")]


def cs_blank(text):
    # Comments and strings become spaces, so offsets and braces stay where they were.
    return CS_NOISE_TEXT.sub(lambda m: " " * (m.end() - m.start()), text)


def cs_project(path):
    # The folder of the nearest .csproj above the file ("" when there is none).
    if path not in cs_project_of:
        d = os.path.dirname(path)
        while d and d not in csproj_dirs:
            d = os.path.dirname(d)
        cs_project_of[path] = d
    return cs_project_of[path]


def cs_parents(ns):
    # A.B.C sees A.B.C, A.B and A without a using.
    parts = ns.split(".") if ns else []
    return {".".join(parts[:i]) for i in range(len(parts), 0, -1)}


def razor_code(text):
    """The C# in a .razor/.cshtml file: directives, @code blocks, @expressions and component tags.
    Markup text is left out, so a word in a heading never links to a type of the same name."""
    text = RAZOR_COMMENT.sub("", text)
    parts = [m.group(2) for m in RAZOR_DIRECTIVE.finditer(text)]
    clean = cs_blank(text)
    for m in RAZOR_BLOCK.finditer(clean):
        depth = 0
        for j in range(m.end() - 1, len(clean)):
            depth += (clean[j] == "{") - (clean[j] == "}")
            if depth == 0:
                break
        parts.append(text[m.end():j])
    parts += [m.group(1) for m in RAZOR_TAG.finditer(clean)]
    parts += [m.group(1) or m.group(2) for m in RAZOR_EXPR.finditer(text)]
    return "\n".join(parts)


def cs_index():
    """Who declares what: full type name -> files, simple name -> full names, plus per-file
    namespaces and the namespaces each file opens with using."""
    for f in files:
        if f.endswith(".csproj"):
            d = os.path.dirname(f)
            csproj_dirs.add(d)
            text = read(f)
            m = re.search(r"<RootNamespace>\s*([\w.]+)\s*</RootNamespace>", text)
            root_ns[d] = m.group(1) if m else re.sub(r"[^\w.]", "_", os.path.splitext(os.path.basename(f))[0])
            global_usings[d].update(re.findall(r'<Using\s+Include="([\w.]+)"(?![^>]*Static)', text))
            for pkg in re.findall(r'<PackageReference\s+Include="([^"]+)"', text):
                cs_packages[pkg] += 1
    for f in sources:
        ext = os.path.splitext(f)[1]
        if ext not in CS_EXT:
            continue
        proj = cs_project(f)
        text = read(f).lstrip("\ufeff")  # Visual Studio saves with a BOM, which hides a `namespace` on line 1
        if ext == ".cs":
            clean = cs_blank(text)
            spaces = [(m.start(), m.group(1).lstrip("@")) for m in CS_NAMESPACE.finditer(clean)]
            cs_ns[f] = {n for _, n in spaces}
            for m in CS_TYPE.finditer(clean):
                ns = next((n for pos, n in reversed(spaces) if pos < m.start()), "")
                name = m.group(1) or m.group(2)
                full = f"{ns}.{name}" if ns else name
                cs_types[full].add(f)
                cs_simple[name].add(full)
            for g, static, alias, target in CS_USING.findall(clean):
                (global_usings[proj] if g else cs_usings[f]).add(target.lstrip("@"))
                if static or alias:
                    cs_usings[f].add(target.lstrip("@"))  # using static A.B.Type / X = A.B.Type: a type, kept as a name
        else:
            m = re.search(r"^[ \t]*@namespace\s+([\w.]+)", text, re.M)
            rel = os.path.relpath(os.path.dirname(f), proj or ".").replace(os.sep, "/")
            folder = "" if rel == "." else "." + re.sub(r"[^\w.]", "_", rel.replace("/", "."))
            ns = m.group(1) if m else (root_ns.get(proj, "") + folder).strip(".")
            cs_ns[f] = {ns} if ns else set()
            cs_usings[f].update(re.findall(r"^[ \t]*@using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)", text, re.M))
            name = os.path.splitext(os.path.basename(f))[0]
            if ext == ".razor" and name != "_Imports":
                full = f"{ns}.{name}" if ns else name
                cs_types[full].add(f)
                cs_simple[name].add(full)
    # _Imports.razor applies to every Razor file in its folder and below, up to the project.
    own_usings.update({f: set(u) for f, u in cs_usings.items()})
    for f in sources:
        if f.endswith(".razor") or f.endswith(".cshtml"):
            d, proj = os.path.dirname(f), cs_project(f)
            while True:
                for imp in ("_Imports.razor", "_ViewImports.cshtml"):
                    if os.path.join(d, imp).replace(os.sep, "/") in fileset:
                        cs_usings[f] |= own_usings.get(os.path.join(d, imp).replace(os.sep, "/"), set())
                if d == proj or not d:
                    break
                d = os.path.dirname(d)


def resolve_cs(src, text):
    """Files that declare the types src names, plus the outside namespaces it opens."""
    ext = os.path.splitext(src)[1]
    text = text.lstrip("\ufeff")
    code = cs_blank(text) if ext == ".cs" else cs_blank(razor_code(text))
    proj = cs_project(src)
    seen = set().union(*(cs_parents(n) for n in cs_ns.get(src, ()))) | {""}
    opened = cs_usings.get(src, set()) | global_usings.get(proj, set())
    seen |= opened
    hits, outside = set(), set()

    def link(targets):
        # Projects in one solution often reuse a name (each has its own Extensions or BasketItem):
        # a declaration in the file's own project wins over the others.
        same = {t for t in targets if cs_project(t) == proj}
        hits.update(same or targets)

    # Names this file declares (properties, fields, parameters, locals) are not types here: with
    # `Appointment App { get; set; }`, `App` and `App.Customer` are that property, not an App component.
    # A name in type position still counts, so `Status Status { get; set; }` links to Status.
    found = list(CS_DECLARED.finditer(code))
    mine = {m.group(2) for m in found}
    typed = {m.start(1) for m in found}
    for ns in opened:
        if ns in cs_types:  # using static A.B.Type, or an alias to a type
            link(cs_types[ns])
        # Outside packages count once per file that opens them itself, not through _Imports or global usings.
        internal = ns in cs_namespaces or ns in cs_types or any(t.startswith(ns + ".") for t in cs_namespaces)
        if ns in own_usings.get(src, ()) and not internal and not ns.startswith("System"):
            outside.add(".".join(ns.split(".")[:2]))
    for m in CS_NAME.finditer(code):
        parts = [p.strip() for p in m.group(1).split(".")]
        if parts[0] in mine and m.start(1) not in typed:
            continue
        # A qualified name (A.B.Type.Member, or Sub.Type from a namespace the file sees):
        # the longest prefix that is a known type.
        for n in range(len(parts), 1, -1):
            full = ".".join(parts[:n])
            tries = [full, full + "Attribute"] if n == len(parts) else [full]  # [Mail.Audit]
            known = [t for x in tries for t in [x] + [f"{ns}.{x}" for ns in seen if ns] if t in cs_types]
            if known:
                link(set().union(*(cs_types[t] for t in known)))
                break
        else:
            first = parts[0]
            for name in (first, first + "Attribute"):  # [Authorize] names AuthorizeAttribute
                visible = [full for full in cs_simple.get(name, ()) if (full.rsplit(".", 1)[0] if "." in full else "") in seen]
                if visible:
                    link(set().union(*(cs_types[full] for full in visible)))
    return hits, outside


csproj_dirs, root_ns, cs_project_of = set(), {}, {}
global_usings, cs_usings, own_usings, cs_ns = defaultdict(set), defaultdict(set), {}, {}
cs_types, cs_simple, cs_packages = defaultdict(set), defaultdict(set), Counter()
cs_index()
cs_namespaces = set().union(*cs_ns.values()) if cs_ns else set()

edges = defaultdict(set)
external = Counter()
# Each Cargo package's source folder (src/, or the package folder when it has none), by crate
# name, so workspaces resolve crate:: and each other.
crate_by_name = {}
rs_dirs = {os.path.dirname(f) for f in sources if f.endswith(".rs")}
for f in files:
    if os.path.basename(f) == "Cargo.toml":
        pkg = RS_PACKAGE.search(read(f))
        name = pkg and RS_NAME.search(pkg.group(1))
        if name:
            root = os.path.dirname(f)
            src_dir = os.path.join(root, "src")
            crate_by_name[name.group(1).replace("-", "_")] = src_dir if src_dir in rs_dirs else root
crate_srcs = set(crate_by_name.values())
rs_root_parents = crate_srcs | {os.path.dirname(d) for d in crate_srcs} | {"", "src"}
by_name = defaultdict(list)  # basename -> files, so an include is a dict lookup, not a scan of every file
for f in files:
    by_name[os.path.basename(f)].append(f)

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
        mods = list(RS_MOD.finditer(text))
        for m in mods:
            hit = m.group(2) == ";" and rs_module_file(os.path.normpath(os.path.join(rs_mod_dir(src), m.group(1))))
            if hit:
                edges[src].add(hit)
        spans = rs_inline_spans(text, [m for m in mods if m.group(2) == "{"])
        local = {m.group(1) for m in mods}
        for m in RS_USE.finditer(text):
            crates = set()
            inline = sum(a <= m.start() <= b for a, b in spans)
            for path in rs_paths(m.group(1)):
                hit, crate = resolve_rs(src, path, inline, local)
                if hit:
                    edges[src].add(hit)
                elif crate:
                    crates.add(crate)
            external.update(crates)  # once per use statement, as before
    elif ext in C_EXT:
        for spec in C_INCLUDE.findall(text):
            target = resolve_c(src, spec)
            if target:
                edges[src].add(target)
            elif not spec.startswith("."):  # a relative path is never an outside package
                external[spec.split("/")[0]] += 1
    elif ext in CS_EXT:
        hits, outside = resolve_cs(src, text)
        edges[src].update(hits)
        external.update(outside)

for src in list(edges):
    edges[src].discard(src)
    if TEST.search(src):
        del edges[src]

# Sorted, so files with equal counts come out in the same order on every run.
indegree = Counter(t for targets in edges.values() for t in sorted(targets))


def lines(path):
    return read(path).count("\n")


def label(path):
    impl = impl_for(path)
    extra = f", impl: {impl}, {lines(impl)} lines" if impl else ""
    return f"{path} ({lines(path)} lines{extra})"


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
    if os.path.splitext(f)[1] in C_HEADER_EXT:
        continue
    # main() is often at the end of a large C file, past the usual read limit.
    c_main = os.path.splitext(f)[1] in C_SOURCE_EXT and not TEST.search(f) and C_MAIN.search(read(f, None))
    if f.count("/") <= 3 and (ENTRY_NAMES.search(f) or "if __name__" in read(f)[-3000:] or c_main):
        if indegree[f] == 0 or ENTRY_NAMES.search(f) or c_main:
            entries.append(f"{f} ({lines(f)} lines, imported by {indegree[f]})")
# C#: Main or top-level statements in Program.cs, then what the host starts on its own.
cs_files = [f for f in sources if f.endswith(".cs") and not TEST.search(f)]
for f in cs_files:
    if os.path.basename(f) in ("Program.cs", "Startup.cs") or CS_MAIN.search(read(f)):
        entries.append(f"{f} ({lines(f)} lines, imported by {indegree[f]})")
controllers = [f for f in cs_files if re.search(r"\[ApiController\]|:\s*(?:Controller|ControllerBase)\b", read(f))]
pages = [f for f in sources if os.path.splitext(f)[1] in (".razor", ".cshtml") and re.search(r"^[ \t]*@page\b", read(f), re.M)]
workers = [f for f in cs_files if re.search(r":\s*(?:BackgroundService|IHostedService)\b|,\s*IHostedService\b", read(f))]
if controllers or pages or workers:
    entries.append(f"ASP.NET: {len(controllers)} controllers, {len(pages)} routable pages (@page), {len(workers)} background services")
    entries += [f"background service: {f}" for f in workers[:6]]
for e in entries[:20]:
    print(e)
if not entries:
    print("none found by name; start from the files that import the most")

print()
print("## Most imported internal files (top 15): the shared core")
for f, n in indegree.most_common(15):
    print(f"{n:3d}  {label(f)}")

print()
print("## Files that import the most internal files (top 10): the orchestrators")
for f, t in sorted(edges.items(), key=lambda kv: -len(kv[1]))[:10]:
    if t:
        print(f"{len(t):3d}  {label(f)}")

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
if cs_packages:
    print("NuGet packages: " + ", ".join(sorted(cs_packages)[:25]))
