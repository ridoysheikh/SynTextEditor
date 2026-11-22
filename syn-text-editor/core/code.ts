/**
 * Code blocks: languages, a best guess at the language, syntax highlighting and the block cut into lines.
 *
 * Pure (no DOM) — the editor's surface, the viewer and `toHTML` all draw a code block from `codeLines`, so the three
 * look the same and the tokens come out identical on a server. The tokenizer is small and forgiving: it colours
 * comments, strings, numbers, keywords, types, functions, properties, tags and the like for the common languages,
 * and never fails — unknown input is just text.
 */
import { blockText, type Block, type Marks, type Span } from "./model";

// ── languages ─────────────────────────────────────────────────────────────────

export interface CodeLanguage {
  /** stored in the block (`lang`) and written as `data-lang` */
  id: string;
  /** what the header and the picker show */
  name: string;
  /** other names that mean it: a fence's ```ts, a pasted `language-js` class */
  aliases?: string[];
}

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: "plain", name: "Plain text", aliases: ["text", "txt", "plaintext", "none"] },
  { id: "bash", name: "Shell", aliases: ["sh", "shell", "zsh", "console", "terminal", "shellscript"] },
  { id: "c", name: "C", aliases: ["h"] },
  { id: "cpp", name: "C++", aliases: ["c++", "cc", "cxx", "hpp"] },
  { id: "csharp", name: "C#", aliases: ["cs", "c#", "dotnet"] },
  { id: "css", name: "CSS" },
  { id: "diff", name: "Diff", aliases: ["patch"] },
  { id: "dockerfile", name: "Dockerfile", aliases: ["docker"] },
  { id: "go", name: "Go", aliases: ["golang"] },
  { id: "graphql", name: "GraphQL", aliases: ["gql"] },
  { id: "html", name: "HTML", aliases: ["xml", "svg", "xhtml", "vue", "svelte"] },
  { id: "java", name: "Java" },
  { id: "javascript", name: "JavaScript", aliases: ["js", "jsx", "mjs", "cjs", "node"] },
  { id: "json", name: "JSON", aliases: ["jsonc", "json5"] },
  { id: "kotlin", name: "Kotlin", aliases: ["kt", "kts"] },
  { id: "markdown", name: "Markdown", aliases: ["md", "mdx"] },
  { id: "php", name: "PHP" },
  { id: "python", name: "Python", aliases: ["py", "python3"] },
  { id: "ruby", name: "Ruby", aliases: ["rb"] },
  { id: "rust", name: "Rust", aliases: ["rs"] },
  { id: "scss", name: "SCSS", aliases: ["sass", "less"] },
  { id: "sql", name: "SQL", aliases: ["postgres", "postgresql", "mysql", "sqlite", "psql"] },
  { id: "swift", name: "Swift" },
  { id: "toml", name: "TOML", aliases: ["ini", "conf", "env", "dotenv"] },
  { id: "typescript", name: "TypeScript", aliases: ["ts", "tsx", "mts", "cts"] },
  { id: "yaml", name: "YAML", aliases: ["yml"] },
];

const BY_NAME = new Map<string, CodeLanguage>();
for (const l of CODE_LANGUAGES) for (const n of [l.id, ...(l.aliases ?? [])]) BY_NAME.set(n, l);

/** A language id, alias or name ("TS", "language-js", "c++") → the language, or null. */
export function codeLanguage(name: string | null | undefined): CodeLanguage | null {
  if (!name) return null;
  const n = String(name).trim().toLowerCase().replace(/^(language|lang)-/, "");
  return BY_NAME.get(n) ?? CODE_LANGUAGES.find((l) => l.name.toLowerCase() === n) ?? null;
}

/** A stored language id, or undefined for anything unknown. */
export const cleanLang = (v: unknown): string | undefined => (typeof v === "string" ? codeLanguage(v)?.id : undefined);

/** A best guess at the language of some code — used when a block has none set. "plain" when nothing fits. */
export function detectLanguage(code: string): string {
  const t = code.trim();
  if (!t) return "plain";
  const first = t.split("\n", 1)[0];
  if (/^#!.*\b(ba|z|)sh\b/.test(first) || /^\$ /m.test(t) || /^(npm|npx|yarn|pnpm|pip3?|brew|git|cd|curl|wget|docker|kubectl|sudo|apt(-get)?|export|echo|chmod|mkdir|go (get|run|build)|cargo|composer) /m.test(first)) return "bash";
  if (/^#!.*python/.test(first)) return "python";
  if (/^(diff --git|--- |\+\+\+ |@@ )/m.test(t) && /^[-+]/m.test(t)) return "diff";
  if (/^<\?php/.test(t)) return "php";
  if (/^(FROM|RUN|CMD|ENTRYPOINT|COPY|WORKDIR) /m.test(first)) return "dockerfile";
  if (/^[[{]/.test(t) && /[}\]]$/.test(t) && /"[^"\n]*"\s*:/.test(t) && !/^\s*(\/\/|[a-z_$][\w$]*\s*[(=])/im.test(t)) return "json";
  if (/^<(!doctype|html|[a-z][\w-]*[\s>/])/i.test(t)) return "html";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b[\s\S]*\b(FROM|INTO|TABLE|SET|WHERE|AS)\b/i.test(t)) return "sql";
  if (/^(query|mutation|subscription|fragment|type|schema)\b[^\n{]*\{/m.test(t) && !/[;=]\s*$/m.test(first)) return "graphql";
  if (/^\s*(def |class \w+(\(.*\))?:|from [\w.]+ import |import \w+$|if __name__|elif |print\()/m.test(t)) return "python";
  if (/^\s*(fn |let mut |impl |pub (fn|struct|enum)|use \w+::)/m.test(t)) return "rust";
  if (/^\s*(package \w+|func |import \()/m.test(t) && /\bfunc\b/.test(t)) return "go";
  if (/^\s*(public |private )?(class|interface) \w+/m.test(t) && /\b(public|private|static|void)\b/.test(t) && /;\s*$/m.test(t)) {
    return /\busing System|\bnamespace\b|\bConsole\./.test(t) ? "csharp" : "java";
  }
  if (/^#include\s*[<"]/m.test(t)) return /\bstd::|\bcout\b|\btemplate\s*</.test(t) ? "cpp" : "c";
  if (/^\s*(fun |val |var )\w/m.test(t) && /\bfun\b/.test(t)) return "kotlin";
  if (/^\s*(def |end$|require ['"]|puts )/m.test(t) && /\bend\b/.test(t)) return "ruby";
  if (/^\s*(\.|#|@media|@import|:root|[a-z][\w-]*\s*(,\s*[a-z][\w-]*)*\s*)\s*[^{}\n]*\{[^}]*:[^}]*\}?/im.test(t) && /[{;]\s*$/m.test(t) && !/\b(function|const|let|=>)\b/.test(t)) {
    return /\$[\w-]+\s*:|@mixin|@include|&[:.]/.test(t) ? "scss" : "css";
  }
  if (/^[\w.-]+\s*:\s*\S/m.test(t) && /^\s*-\s+\S/m.test(t) && !/[;{}]\s*$/m.test(t)) return "yaml";
  if (/^\[[\w.-]+\]\s*$/m.test(t) && /^[\w.-]+\s*=\s*/m.test(t)) return "toml";
  if (/^#{1,6} \S/m.test(t) || /^```/m.test(t)) return "markdown";
  if (/\b(interface|type)\s+\w+\s*[={<]|:\s*(string|number|boolean|void|any|unknown)\b|\bas const\b|<\w+(\[\])?>\(/.test(t)) return "typescript";
  if (/\b(const|let|var|function|=>|require\(|import\s.+\sfrom\s|export\s(default|const|function)|console\.)/.test(t)) return "javascript";
  if (/^[\w.-]+\s*:\s*\S/m.test(t) && !/[;{}()]\s*$/m.test(t)) return "yaml";
  return "plain";
}

// ── tokens ────────────────────────────────────────────────────────────────────

/**
 * What a run of code is, as a class suffix (`se-tk-k`…):
 * c comment · s string · n number · k keyword · t type / built-in · l literal (true, null…) · f function ·
 * p property / attribute / key · g tag · m meta (decorator, directive, prompt) · v variable · o operator ·
 * r regex / escape · a an added line · d a removed line · h a heading or hunk
 */
export type TokenKind = "c" | "s" | "n" | "k" | "t" | "l" | "f" | "p" | "g" | "m" | "v" | "o" | "r" | "a" | "d" | "h";
export interface Token { start: number; end: number; kind: TokenKind }

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

interface Grammar {
  line?: string[];                 // line comment starts
  block?: [string, string][];      // block comments
  quotes?: string;                 // string quote characters
  triple?: boolean;                // """ and ''' strings
  template?: boolean;              // `…` strings
  keywords: Set<string>;
  types?: Set<string>;
  literals?: Set<string>;
  caseless?: boolean;              // keywords match in any case (SQL)
  /** Capitalised words are types (C-like languages). */
  capitalTypes?: boolean;
  /** `@word` is a decorator / annotation. */
  at?: boolean;
  /** `$name` is a variable (shell, PHP). */
  dollar?: boolean;
  /** `#word` is a directive (C preprocessor). */
  hash?: boolean;
}

const LITERALS = words("true false null undefined NaN Infinity");
const C_LIKE: Omit<Grammar, "keywords"> = { line: ["//"], block: [["/*", "*/"]], quotes: `"'`, capitalTypes: true };

const JS_KEYWORDS = "break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield async await as";
const GRAMMARS: Record<string, Grammar> = {
  javascript: { ...C_LIKE, template: true, at: true, keywords: words(JS_KEYWORDS), literals: LITERALS,
    types: words("Array Object String Number Boolean Promise Map Set Date RegExp Error JSON Math Symbol BigInt console window document globalThis") },
  typescript: { ...C_LIKE, template: true, at: true, keywords: words(`${JS_KEYWORDS} type interface enum implements namespace declare readonly abstract private protected public keyof infer is satisfies module`),
    literals: LITERALS, types: words("string number boolean any unknown never void object bigint symbol Array Record Partial Readonly Pick Omit Promise Map Set Date Error") },
  python: { line: ["#"], quotes: `"'`, triple: true, at: true,
    keywords: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case"),
    literals: words("True False None"), types: words("int float str bool list dict set tuple bytes object type range len print self cls Exception") },
  bash: { line: ["#"], quotes: `"'`, dollar: true,
    keywords: words("if then else elif fi for while until do done case esac in function return local export unset readonly shift exit source alias select time"),
    types: words("echo cd ls cat grep sed awk curl wget npm npx yarn pnpm pip git docker kubectl sudo mkdir rm cp mv chmod chown tar make node python go cargo brew apt printf read test") },
  json: { quotes: `"`, keywords: words(""), literals: words("true false null") },
  css: { block: [["/*", "*/"]], quotes: `"'`, at: true, keywords: words("important"), types: words("") },
  scss: { line: ["//"], block: [["/*", "*/"]], quotes: `"'`, at: true, dollar: true, keywords: words("important if else each for from through to in"), types: words("") },
  sql: { line: ["--"], block: [["/*", "*/"]], quotes: `'"`, caseless: true,
    keywords: words("select from where and or not insert into values update set delete create alter drop table index view as join left right inner outer full cross on group by order having limit offset distinct union all case when then else end is null like in between exists primary key foreign references default unique constraint returning with begin commit rollback grant revoke cascade if asc desc"),
    types: words("int integer bigint smallint serial text varchar char boolean bool date time timestamp timestamptz uuid json jsonb numeric decimal real float double count sum avg min max now coalesce"), literals: words("true false null") },
  go: { ...C_LIKE, template: true, keywords: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"),
    literals: words("true false nil iota"), types: words("string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 bool byte rune error any make new len cap append panic recover") },
  rust: { ...C_LIKE, keywords: words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while"),
    literals: words("true false None Some Ok Err"), types: words("i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box") },
  java: { ...C_LIKE, at: true, keywords: words("abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record"),
    literals: words("true false null"), types: words("int long short byte char float double boolean String Object List Map Integer") },
  kotlin: { ...C_LIKE, template: false, at: true, triple: true, keywords: words("as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor data enum finally import init internal open override private protected public sealed suspend companion lateinit"),
    literals: words("true false null"), types: words("Int Long Short Byte Char Float Double Boolean String Unit Any List Map") },
  swift: { ...C_LIKE, at: true, triple: true, keywords: words("associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await self Self"),
    literals: words("true false nil"), types: words("Int Double Float Bool String Character Array Dictionary Set Optional Any") },
  c: { ...C_LIKE, hash: true, keywords: words("auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while"),
    literals: words("NULL true false"), types: words("void char short int long float double signed unsigned bool size_t FILE uint8_t uint16_t uint32_t uint64_t int32_t int64_t") },
  cpp: { ...C_LIKE, hash: true, keywords: words("alignas auto break case catch class const constexpr continue default delete do else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public return sizeof static struct switch template this throw try typedef typename union using virtual volatile while override final"),
    literals: words("nullptr NULL true false"), types: words("void char short int long float double signed unsigned bool size_t string vector map std auto") },
  csharp: { ...C_LIKE, at: false, keywords: words("abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual void volatile while async await var record get set init"),
    literals: words("true false null"), types: words("int long short byte char float double decimal bool string object dynamic List Dictionary Task Console") },
  php: { ...C_LIKE, line: ["//", "#"], dollar: true, keywords: words("abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield"),
    literals: words("true false null TRUE FALSE NULL"), types: words("int float string bool array object void mixed self parent") },
  ruby: { line: ["#"], quotes: `"'`, at: false, keywords: words("alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require attr_accessor attr_reader private protected public puts"),
    literals: words("true false nil") },
  graphql: { line: ["#"], quotes: `"`, triple: true, at: true, keywords: words("query mutation subscription fragment on type interface union enum input scalar schema extend implements directive"),
    literals: words("true false null"), types: words("ID String Int Float Boolean") },
  dockerfile: { line: ["#"], quotes: `"'`, dollar: true, caseless: false,
    keywords: words("FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS") },
  toml: { line: ["#", ";"], quotes: `"'`, triple: true, keywords: words(""), literals: words("true false") },
  yaml: { line: ["#"], quotes: `"'`, keywords: words(""), literals: words("true false null yes no on off ~") },
  plain: { keywords: words("") },
};

const NUMBER = /^(0x[\da-f_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(\.\d[\d_]*)?(e[+-]?\d+)?)[a-z%]*/i;
const WORD = /^[A-Za-z_$À-￿][\w$À-￿]*/;

/** Colour a whole block's text. Positions are character offsets into `code`. */
export function tokenize(code: string, lang: string): Token[] {
  const id = codeLanguage(lang)?.id ?? "plain";
  if (id === "plain") return [];
  if (id === "html") return markup(code);
  if (id === "diff") return byLine(code, (line) => (/^(\+\+\+|---) /.test(line) ? "h" : /^@@/.test(line) ? "h" : line[0] === "+" ? "a" : line[0] === "-" ? "d" : null));
  if (id === "markdown") return markdown(code);
  return scan(code, id, GRAMMARS[id] ?? GRAMMARS.plain);
}

function byLine(code: string, kind: (line: string) => TokenKind | null): Token[] {
  const out: Token[] = [];
  let at = 0;
  for (const line of code.split("\n")) {
    const k = kind(line);
    if (k && line.length) out.push({ start: at, end: at + line.length, kind: k });
    at += line.length + 1;
  }
  return out;
}

function scan(code: string, id: string, g: Grammar): Token[] {
  const out: Token[] = [];
  const push = (start: number, end: number, kind: TokenKind) => { if (end > start) out.push({ start, end, kind }); };
  const n = code.length;
  let i = 0;
  let lineStart = true;                     // only whitespace so far on this line
  let prevSig = "";                         // the last character that wasn't whitespace
  const kw = (w: string) => g.keywords.has(g.caseless ? w.toLowerCase() : w);
  const isType = (w: string) => g.types?.has(g.caseless ? w.toLowerCase() : w);
  const isLit = (w: string) => g.literals?.has(g.caseless ? w.toLowerCase() : w);

  while (i < n) {
    const c = code[i];
    if (c === "\n") { lineStart = true; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    const rest = code.slice(i, i + 3);

    // comments
    const bc = g.block?.find(([a]) => code.startsWith(a, i));
    if (bc) {
      const close = code.indexOf(bc[1], i + bc[0].length);
      const end = close < 0 ? n : close + bc[1].length;
      push(i, end, "c"); i = end; lineStart = false; continue;
    }
    if (g.line?.some((s) => code.startsWith(s, i)) && !(id === "bash" && c === "#" && !lineStart && !/\s/.test(code[i - 1] ?? " "))) {
      if (!(c === "#" && id === "scss")) {
        const end = code.indexOf("\n", i);
        push(i, end < 0 ? n : end, "c"); i = end < 0 ? n : end; continue;
      }
    }
    // shell prompt
    if (id === "bash" && lineStart && code.startsWith("$ ", i)) { push(i, i + 1, "m"); i += 2; lineStart = false; continue; }
    // preprocessor / directive
    if (g.hash && c === "#" && lineStart) {
      const m = /^#\s*\w+/.exec(code.slice(i));
      if (m) { push(i, i + m[0].length, "m"); i += m[0].length; lineStart = false; continue; }
    }
    lineStart = false;

    // strings
    const tq = g.triple && (rest === '"""' || rest === "'''") ? rest : null;
    if (tq || (g.quotes?.includes(c)) || (g.template && c === "`")) {
      const q = tq ?? c;
      let j = i + q.length;
      while (j < n) {
        if (code[j] === "\\") { j += 2; continue; }
        if (code.startsWith(q, j)) { j += q.length; break; }
        if (code[j] === "\n" && !tq && q !== "`") break;
        j++;
      }
      j = Math.min(j, n);
      // A JSON / YAML / TOML key, or a Python dict key, is a property.
      const after = code.slice(j).match(/^\s*:/);
      push(i, j, after && (id === "json" || id === "yaml" || id === "toml") ? "p" : "s");
      i = j; prevSig = q; continue;
    }
    // numbers (not inside a word)
    if (/[\d]/.test(c) || (c === "." && /\d/.test(code[i + 1] ?? ""))) {
      const m = NUMBER.exec(code.slice(i));
      if (m && !/[\w$]/.test(code[i - 1] ?? "")) { push(i, i + m[0].length, "n"); i += m[0].length; prevSig = "0"; continue; }
    }
    // CSS hex colours
    if ((id === "css" || id === "scss") && c === "#" && /^#[\da-f]{3,8}\b/i.test(code.slice(i))) {
      const m = /^#[\da-f]{3,8}/i.exec(code.slice(i))!;
      push(i, i + m[0].length, "n"); i += m[0].length; continue;
    }
    // decorators / at-rules
    if (g.at && c === "@") {
      const m = /^@[\w.-]+/.exec(code.slice(i));
      if (m) { push(i, i + m[0].length, "m"); i += m[0].length; prevSig = "@"; continue; }
    }
    // variables
    if (g.dollar && c === "$") {
      const m = /^\$(\{[^}\n]*\}|[\w-]+|[?#@*!$0-9])/.exec(code.slice(i));
      if (m) { push(i, i + m[0].length, "v"); i += m[0].length; prevSig = "v"; continue; }
    }
    // words
    const wm = WORD.exec(code.slice(i));
    if (wm) {
      const w = wm[0];
      const end = i + w.length;
      const next = code.slice(end).match(/^\s*(\(|:(?!:)|=(?!=))/)?.[1];
      let kind: TokenKind | null = null;
      if (id === "css" || id === "scss") kind = next === ":" && !/[,{]\s*$/.test(code.slice(Math.max(0, i - 2), i)) ? "p" : null;
      else if (id === "yaml" || id === "toml") kind = next === ":" || next === "=" ? "p" : isLit(w) ? "l" : null;
      else if (kw(w)) kind = "k";
      else if (isLit(w)) kind = "l";
      else if (isType(w)) kind = "t";
      else if (next === "(") kind = "f";
      else if (prevSig === ".") kind = "p";
      else if (g.capitalTypes && /^[A-Z][a-z0-9]\w*$/.test(w)) kind = "t";
      if (kind) push(i, end, kind);
      i = end; prevSig = "w"; continue;
    }
    // operators
    if (/[=+\-*/%!<>&|^~?:]/.test(c)) {
      const m = /^[=+\-*/%!<>&|^~?:]+/.exec(code.slice(i))!;
      push(i, i + m[0].length, "o");
      i += m[0].length; prevSig = c; continue;
    }
    prevSig = c;
    i++;
  }
  return out;
}

/** HTML / XML: tags, attributes, attribute values, comments, entities. */
function markup(code: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:.-]*|\/?>|&#?\w+;|"[^"]*"|'[^']*'|[A-Za-z_:][\w:.-]*(?==)/g;
  let inTag = false;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const t = m[0];
    const start = m.index;
    const end = start + t.length;
    if (t.startsWith("<!--")) out.push({ start, end, kind: "c" });
    else if (t[0] === "<") { out.push({ start, end, kind: "g" }); inTag = true; }
    else if (t === ">" || t === "/>") { out.push({ start, end, kind: "g" }); inTag = false; }
    else if (t[0] === "&") out.push({ start, end, kind: "r" });
    else if (inTag && (t[0] === '"' || t[0] === "'")) out.push({ start, end, kind: "s" });
    else if (inTag) out.push({ start, end, kind: "p" });
  }
  return out;
}

/** Markdown: headings, fences, inline code, emphasis, links, list markers, quotes. */
function markdown(code: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  let fence = false;
  for (const line of code.split("\n")) {
    const push = (a: number, z: number, kind: TokenKind) => { if (z > a) out.push({ start: at + a, end: at + z, kind }); };
    if (/^\s*```/.test(line)) { fence = !fence; push(0, line.length, "m"); }
    else if (fence) push(0, line.length, "s");
    else if (/^#{1,6}\s/.test(line)) push(0, line.length, "h");
    else if (/^\s*>/.test(line)) push(0, line.length, "c");
    else {
      const lm = /^(\s*)([-*+]|\d+[.)])\s/.exec(line);
      if (lm) push(lm[1].length, lm[1].length + lm[2].length, "k");
      for (const m of line.matchAll(/`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\)/g)) {
        const t = m[0];
        push(m.index!, m.index! + t.length, t[0] === "`" ? "s" : t[0] === "[" ? "f" : "t");
      }
    }
    at += line.length + 1;
  }
  return out;
}

// ── the block, cut into lines ─────────────────────────────────────────────────

/** A run of a code line: its text, the formats of the span it came from, and its token. */
export interface CodePiece { text: string; marks: Marks; tk?: TokenKind }
/** A line's runs. The "\n" that ends a line is the last run of that line (its own piece). */
export type CodeLine = CodePiece[];

export interface CodeOptions {
  /** Colour the code (default true). */
  highlight?: boolean;
}

const guess = new WeakMap<Block, string>();
/** The language a code block is drawn in: its own, else a guess from its text (remembered per block). */
export function blockLanguage(b: Block): string {
  if (b.lang) return b.lang;
  let g = guess.get(b);
  if (!g) { g = detectLanguage(blockText(b)); guess.set(b, g); }
  return g;
}

/** What a code block's header says: its title, else its language's name. */
export function codeLabel(b: Block): string {
  if (b.title) return b.title;
  const lang = codeLanguage(blockLanguage(b));
  return !lang || lang.id === "plain" ? (b.lang ? "Plain text" : "Code") : lang.name;
}

/** A code block as lines of runs — spans and tokens merged, cut at every line break. Always at least one line. */
export function codeLines(spans: Span[], lang: string, opts: CodeOptions = {}): CodeLine[] {
  const text = spans.map((s) => s.text).join("");
  const tokens = opts.highlight === false ? [] : tokenize(text, lang);
  const lines: CodeLine[] = [[]];
  let ti = 0;
  let at = 0;
  for (const s of spans) {
    const { text: t, ...marks } = s;
    let k = 0;
    while (k < t.length) {
      const pos = at + k;
      if (t[k] === "\n") {
        lines[lines.length - 1].push({ text: "\n", marks });
        lines.push([]);
        k++;
        continue;
      }
      while (ti < tokens.length && tokens[ti].end <= pos) ti++;
      const tok = tokens[ti] && tokens[ti].start <= pos ? tokens[ti] : undefined;
      // The run goes on to the next line break, span end or token edge.
      const nl = t.indexOf("\n", k);
      let stop = nl < 0 ? t.length : nl;
      const edge = tok ? tok.end : tokens[ti]?.start;
      if (edge !== undefined && edge - at < stop) stop = Math.max(k + 1, edge - at);
      const piece: CodePiece = { text: t.slice(k, stop), marks };
      if (tok) piece.tk = tok.kind;
      lines[lines.length - 1].push(piece);
      k = stop;
    }
    at += t.length;
  }
  return lines;
}

/** The plain text of a code block — what Copy puts on the clipboard. */
export const codeText = (b: Block) => blockText(b);

/**
 * The text a new line should start with after `line`: its indentation, one step more after an opening bracket or a
 * colon (Python, YAML).
 */
export function nextIndent(line: string, unit = "  "): string {
  const base = /^[ \t]*/.exec(line)![0];
  return /[{[(:]\s*$/.test(line) ? base + unit : base;
}
