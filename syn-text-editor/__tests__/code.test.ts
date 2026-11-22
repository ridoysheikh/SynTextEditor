import { describe, expect, it } from "vitest";
import { codeLabel, codeLanguage, codeLines, detectLanguage, nextIndent, tokenize } from "../core/code";
import { toHTML } from "../core/html";
import { cleanBlock, type Block, type RichDoc } from "../core/model";
import * as ops from "../core/ops";

const code = (text: string, extra: Partial<Block> = {}): Block => ({ type: "code", spans: [{ text }], ...extra });
const doc = (...blocks: Block[]): RichDoc => ({ version: 1, blocks });
const kinds = (src: string, lang: string) => tokenize(src, lang).map((t) => [src.slice(t.start, t.end), t.kind]);

describe("code languages", () => {
  it("resolves ids, aliases, names and classes", () => {
    expect(codeLanguage("ts")?.id).toBe("typescript");
    expect(codeLanguage("language-js")?.id).toBe("javascript");
    expect(codeLanguage("C++")?.id).toBe("cpp");
    expect(codeLanguage("Shell")?.id).toBe("bash");
    expect(codeLanguage("cobol")).toBeNull();
  });

  it("guesses the language", () => {
    expect(detectLanguage("$ npm install x")).toBe("bash");
    expect(detectLanguage('{ "a": 1, "b": [true] }')).toBe("json");
    expect(detectLanguage("def hello():\n    print('hi')")).toBe("python");
    expect(detectLanguage("const x: number = 1;")).toBe("typescript");
    expect(detectLanguage("const x = () => 1;")).toBe("javascript");
    expect(detectLanguage("SELECT id FROM users WHERE id = 1")).toBe("sql");
    expect(detectLanguage("<div class=\"a\">hi</div>")).toBe("html");
    expect(detectLanguage("hello there")).toBe("plain");
  });
});

describe("tokens", () => {
  it("colours JavaScript", () => {
    expect(kinds('const a = "x"; // note\nfoo(1)', "js")).toEqual([
      ["const", "k"], ["=", "o"], ['"x"', "s"], ["// note", "c"], ["foo", "f"], ["1", "n"],
    ]);
  });
  it("colours JSON keys apart from values", () => {
    expect(kinds('{"a": "b", "n": null}', "json")).toEqual([['"a"', "p"], [":", "o"], ['"b"', "s"], ['"n"', "p"], [":", "o"], ["null", "l"]]);
  });
  it("colours Python, shell and diffs", () => {
    expect(kinds("def f(): return None  # x", "python")).toEqual([["def", "k"], ["f", "f"], [":", "o"], ["return", "k"], ["None", "l"], ["# x", "c"]]);
    expect(kinds("$ echo $HOME", "bash")).toEqual([["$", "m"], ["echo", "t"], ["$HOME", "v"]]);
    expect(kinds("+a\n-b\n c", "diff")).toEqual([["+a", "a"], ["-b", "d"]]);
  });
  it("colours markup", () => {
    expect(kinds('<a href="x">', "html")).toEqual([["<a", "g"], ["href", "p"], ['"x"', "s"], [">", "g"]]);
  });
  it("never fails on unknown or broken input", () => {
    expect(tokenize("anything", "cobol")).toEqual([]);
    expect(() => tokenize('"unterminated\n/* open', "js")).not.toThrow();
  });
});

describe("code lines", () => {
  it("cuts at line breaks, keeps formats and tokens, ends each line with its newline", () => {
    const lines = codeLines([{ text: "let a\n" }, { text: "b", bold: true }], "js");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([{ text: "let", marks: {}, tk: "k" }, { text: " a", marks: {} }, { text: "\n", marks: {} }]);
    expect(lines[1]).toEqual([{ text: "b", marks: { bold: true } }]);
  });
  it("gives a trailing newline an empty last line, and an empty block one line", () => {
    expect(codeLines([{ text: "a\n" }], "plain")).toHaveLength(2);
    expect(codeLines([], "plain")).toEqual([[]]);
  });
  it("can switch colouring off", () => {
    expect(codeLines([{ text: "const" }], "js", { highlight: false })[0]).toEqual([{ text: "const", marks: {} }]);
  });
  it("indents a new line like the last one, a step more after an opening bracket", () => {
    expect(nextIndent("  foo")).toBe("  ");
    expect(nextIndent("  if (x) {")).toBe("    ");
    expect(nextIndent("def f():")).toBe("  ");
  });
});

describe("code blocks in the document", () => {
  it("keeps the language, title and line options (only on code)", () => {
    const b = cleanBlock({ type: "code", lang: "TS", title: " app.ts ", lineNumbers: false, lineWrap: true, spans: [{ text: "x" }] })!;
    expect(b).toMatchObject({ lang: "typescript", title: "app.ts", lineNumbers: false, lineWrap: true });
    expect(cleanBlock({ type: "code", lang: "cobol", spans: [] })!.lang).toBeUndefined();
    expect(cleanBlock({ type: "p", lang: "ts", spans: [] })!.lang).toBeUndefined();
  });
  it("labels the header with the title, else the language", () => {
    expect(codeLabel(code("x", { title: "a.ts" }))).toBe("a.ts");
    expect(codeLabel(code("x", { lang: "go" }))).toBe("Go");
    expect(codeLabel(code("const a = 1;"))).toBe("JavaScript");
    expect(codeLabel(code("just words"))).toBe("Code");
  });
  it("writes lines with real newlines, tokens and its data", () => {
    const html = toHTML(doc(code("let a\nb", { lang: "javascript", title: "x.js" })), { wrap: false });
    expect(html).toBe(
      '<pre class="se-blk se-code" data-lang="javascript" data-title="x.js" data-label="x.js"><code class="se-code-body">'
      + '<span class="se-ln"><span class="se-tk-k">let</span> a\n</span><span class="se-ln">b</span></code></pre>',
    );
    expect(toHTML(doc(code("let")), { wrap: false, code: { highlight: false } })).not.toContain("se-tk-");
    expect(toHTML(doc(code("a", { lineNumbers: false, lineWrap: true })), { wrap: false })).toContain("data-nolines=\"\" data-linewrap=\"\"");
  });
  it("escapes code", () => {
    expect(toHTML(doc(code("<b>&</b>")), { wrap: false, code: { highlight: false } })).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
  });
  it("opens a code block in a language from a ```fence", () => {
    const r = ops.autoFormat(doc({ type: "p", spans: [{ text: "```ts" }] }), { b: 0, o: 5 });
    expect(r?.doc.blocks[0]).toMatchObject({ type: "code", lang: "typescript", spans: [] });
    expect(ops.autoFormat(doc({ type: "p", spans: [{ text: "```cobol" }] }), { b: 0, o: 8 })).toBeNull();
  });
  it("drops the code fields when the block stops being code", () => {
    const d = doc(code("x", { lang: "go", title: "t", lineWrap: true }));
    const p = ops.setBlockType(d, { b: 0, o: 0 }, { b: 0, o: 0 }, "p").blocks[0];
    expect(p.lang).toBeUndefined();
    expect(p.title).toBeUndefined();
    expect(p.lineWrap).toBeUndefined();
  });
});
