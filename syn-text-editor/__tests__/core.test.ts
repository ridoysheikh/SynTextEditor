import { describe, expect, it } from "vitest";
import { toHTML } from "../core/html";
import { cleanBlock, docLength, docToPlain, docWords, isEmptyDoc, safeLink, safeSrc, schemaOf, toDoc, type RichDoc } from "../core/model";
import * as ops from "../core/ops";
import * as tables from "../core/table";
import { createMemoryStorage } from "../core/storage";
import { listMarkers } from "../core/styles";
import { PRESETS } from "../presets";

const doc = (...blocks: RichDoc["blocks"]): RichDoc => ({ version: 1, blocks });
const p = (text: string, extra: object = {}) => ({ type: "p" as const, spans: text ? [{ text }] : [], ...extra });

describe("model", () => {
  it("reads plain text, JSON and documents", () => {
    expect(toDoc("a\nb")!.blocks).toHaveLength(2);
    expect(toDoc(JSON.stringify(doc(p("x"))))!.blocks[0].spans[0].text).toBe("x");
    expect(toDoc(null)).toBeNull();
  });

  it("drops what the schema doesn't allow", () => {
    const basic = schemaOf(PRESETS.basic.formats);
    const b = cleanBlock({ type: "h1", spans: [{ text: "hi", bold: true, color: "red", size: 30 }] }, basic)!;
    expect(b.type).toBe("p");
    expect(b.spans[0]).toEqual({ text: "hi", bold: true });
    expect(cleanBlock({ type: "image", src: "https://x/a.png", spans: [] }, basic)).toBeNull();
  });

  it("turns a table into lines where tables aren't allowed", () => {
    const b = cleanBlock({ type: "table", rows: [[{ spans: [{ text: "a" }] }, { spans: [{ text: "b" }] }]], spans: [] }, schemaOf(["bold"]))!;
    expect(b.spans.map((s) => s.text).join("")).toBe("a\tb");
  });

  it("refuses unsafe links and sources", () => {
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("example.com/x")).toBe("https://example.com/x");
    expect(safeSrc("javascript:alert(1)")).toBeUndefined();
    expect(safeSrc("data:text/html;base64,AAA")).toBeUndefined();
    expect(safeSrc("data:image/png;base64,AAA")).toBeDefined();
    expect(cleanBlock({ type: "p", spans: [{ text: "x", color: "red;background:url(x)" }] })!.spans[0].color).toBeUndefined();
  });

  it("counts characters and words, table cells included", () => {
    const d = doc(p("Hello brave world"), { type: "table", spans: [], rows: [[{ spans: [{ text: "two words" }] }]] });
    expect(docWords(d)).toBe(5);
    expect(docLength(d)).toBe(17 + 9);
    expect(isEmptyDoc(doc(p("  ")))).toBe(true);
  });

  it("writes plain text with list markers", () => {
    expect(docToPlain(doc(p("a", { list: "ordered" }), p("b", { list: "ordered" }), p("c", { list: "check", checked: true })))).toBe("1. a\n2. b\n[x] c");
  });
});

describe("ops", () => {
  it("types, splits and joins", () => {
    let r = ops.insertText(doc(p("")), { b: 0, o: 0 }, "Hello", {});
    r = ops.splitBlock(r.doc, { b: 0, o: 2 });
    expect(r.doc.blocks.map((b) => b.spans[0]?.text)).toEqual(["He", "llo"]);
    r = ops.joinBackward(r.doc, r.pos);
    expect(r.doc.blocks).toHaveLength(1);
    expect(r.pos).toEqual({ b: 0, o: 2 });
  });

  it("keeps unchanged blocks by identity", () => {
    const d = doc(p("one"), p("two"));
    const n = ops.toggleMark(d, { b: 1, o: 0 }, { b: 1, o: 3 }, "bold");
    expect(n.blocks[0]).toBe(d.blocks[0]);
    expect(n.blocks[1].spans[0].bold).toBe(true);
  });

  it("puts an atom after the caret's block with a line after it", () => {
    const r = ops.insertAtom(doc(p("text")), { b: 0, o: 4 }, { type: "image", src: "/a.png", spans: [] });
    expect(r.doc.blocks.map((b) => b.type)).toEqual(["p", "image", "p"]);
    expect(r.pos).toEqual({ b: 1, o: 0 });
  });

  it("splits a block when an atom goes mid-text", () => {
    const r = ops.insertAtom(doc(p("abcd")), { b: 0, o: 2 }, { type: "hr", spans: [] });
    expect(r.doc.blocks.map((b) => b.type === "hr" ? "—" : b.spans[0].text)).toEqual(["ab", "—", "cd"]);
  });

  it("steps onto an atom with Backspace instead of swallowing it", () => {
    const d = doc(p("a"), { type: "image", src: "/a.png", spans: [] }, p("b"));
    const r = ops.joinBackward(d, { b: 2, o: 0 });
    expect(r.doc).toBe(d);
    expect(r.pos).toEqual({ b: 1, o: 0 });
  });

  it("deletes an atom selected as a range", () => {
    const d = doc(p("a"), { type: "image", src: "/a.png", spans: [] }, p("b"));
    const r = ops.deleteRange(d, { b: 1, o: 0 }, { b: 2, o: 0 });
    expect(r.doc.blocks.map((b) => b.type)).toEqual(["p", "p"]);
  });

  it("auto-formats markdown starts, within the schema", () => {
    const d = ops.insertText(doc(p("")), { b: 0, o: 0 }, "[]", {}).doc;
    expect(ops.autoFormat(d, { b: 0, o: 2 })!.doc.blocks[0].list).toBe("check");
    expect(ops.autoFormat(d, { b: 0, o: 2 }, (f) => f.list !== "check")).toBeNull();
  });

  it("finds and replaces, keeping formats", () => {
    const d = doc({ type: "p", spans: [{ text: "cat " }, { text: "Cat", bold: true }] });
    expect(ops.findAll(d, "cat")).toHaveLength(2);
    const { doc: n, count } = ops.replaceAll(d, "cat", "dog", true);
    expect(count).toBe(1);
    expect(n.blocks[0].spans.map((s) => s.text).join("")).toBe("dog Cat");
  });

  it("ends a list with Enter on an empty item; a checklist item starts unticked", () => {
    const d = doc(p("x", { list: "check", checked: true }));
    const r = ops.splitBlock(d, { b: 0, o: 1 });
    expect(r.doc.blocks[1].list).toBe("check");
    expect(r.doc.blocks[1].checked).toBeUndefined();
    expect(ops.splitBlock(r.doc, r.pos).doc.blocks[1].list).toBeUndefined();
  });
});

describe("tables", () => {
  it("edits a cell through the text ops", () => {
    let d = doc(tables.newTable(2, 2));
    const ref = { b: 0, r: 1, c: 1 };
    const sub = ops.insertText(tables.cellDoc(tables.cellAt(d, ref)), { b: 0, o: 0 }, "hi", { bold: true }).doc;
    d = tables.withCell(d, ref, sub);
    expect(tables.cellAt(d, ref)!.spans).toEqual([{ text: "hi", bold: true }]);
  });

  it("adds and removes rows and columns; the last row takes the table", () => {
    let d = doc(tables.newTable(1, 2), p(""));
    d = tables.insertCol(d, 0, 1, 1);
    expect(d.blocks[0].rows![0]).toHaveLength(3);
    d = tables.insertRow(d, 0, 0, 1);
    expect(d.blocks[0].rows).toHaveLength(2);
    d = tables.deleteRow(d, 0, 0) as RichDoc;
    const gone = tables.deleteRow(d, 0, 0) as ops.Result;
    expect(gone.doc.blocks.every((b) => b.type !== "table")).toBe(true);
  });

  it("walks cells with Tab", () => {
    const d = doc(tables.newTable(2, 2));
    expect(tables.stepCell(d, { b: 0, r: 0, c: 1 }, 1)).toEqual({ b: 0, r: 1, c: 0 });
    expect(tables.stepCell(d, { b: 0, r: 1, c: 1 }, 1)).toBeNull();
  });
});

describe("html out", () => {
  const d = doc(
    { type: "h2", spans: [{ text: "Title" }] },
    { type: "p", spans: [{ text: "<b>", bold: true }, { text: "red", color: "red" }, { text: "go", link: "https://x.dev" }] },
    p("one", { list: "bullet" }), p("two", { list: "bullet" }),
    { type: "image", src: "https://x/a.png", alt: "A \"cat\"", width: 50, spans: [] },
    { type: "table", head: true, spans: [], rows: [[{ spans: [{ text: "H" }] }], [{ spans: [{ text: "c" }] }]] },
  );

  it("escapes text and attributes", () => {
    const html = toHTML(d);
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('alt="A &quot;cat&quot;"');
  });

  it("writes classes and palette variables by default", () => {
    const html = toHTML(d);
    expect(html.startsWith('<div class="se-content">')).toBe(true);
    expect(html).toContain('class="se-b"');
    expect(html).toContain("var(--se-c-red, #e03131)");
    expect(html).toContain('<ul class="se-list">');
    expect(html).toContain("<thead><tr><th>H</th></tr></thead>");
  });

  it("writes self-contained inline styles on request", () => {
    const html = toHTML(d, { mode: "inline" });
    expect(html).not.toContain("se-");
    expect(html).toContain("color:#e03131");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("max-width:50%");
  });
});

describe("list markers", () => {
  it("numbers per depth: 1. a. i.", () => {
    const m = listMarkers([p("a", { list: "ordered" }), p("b", { list: "ordered", indent: 1 }), p("c", { list: "ordered", indent: 2 }), p("d", { list: "ordered" })]);
    expect(m).toEqual(["1.", "a.", "i.", "2."]);
  });
});

describe("memory storage", () => {
  it("lists, filters, pages and removes", async () => {
    const s = createMemoryStorage({
      seed: Array.from({ length: 5 }, (_, i) => ({ id: String(i), url: `https://x/${i}.png`, name: `f${i}.png`, type: i % 2 ? "image/png" : "application/pdf" })),
    });
    const page = await s.list({ limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next).toBe("2");
    expect((await s.list({ limit: 10, kind: "image" })).items).toHaveLength(2);
    await s.remove!("1");
    expect((await s.list({ limit: 10 })).total).toBe(4);
  });
});
