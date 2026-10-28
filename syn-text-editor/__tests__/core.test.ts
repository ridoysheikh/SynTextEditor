import { describe, expect, it } from "vitest";
import { toHTML } from "../core/html";
import { cleanBlock, normaliseMedia, docLength, docToPlain, docWords, isEmptyDoc, safeLink, safeSrc, schemaOf, toDoc, type RichDoc } from "../core/model";
import * as ops from "../core/ops";
import * as tables from "../core/table";
import { createMemoryStorage } from "../core/storage";
import { formatTime } from "../view/player";
import { safePoster } from "../core/model";
import { FONTS, fontFaceCSS, fontStylesheets, listMarkers, resolveFonts, usedFonts } from "../core/styles";
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

describe("fonts", () => {
  const brand = { label: "Brand", value: "'Brand Sans', sans-serif", src: [{ url: "/fonts/brand.woff2", weight: 400 }, { url: "/fonts/brand-b.woff2", weight: "700" }] };
  const gf = { label: "Lora", value: "Lora, serif", src: "https://fonts.googleapis.com/css2?family=Lora&display=swap" };

  it("pushes onto the defaults, or replaces them", () => {
    expect(resolveFonts(undefined)).toBe(FONTS);
    expect(resolveFonts([gf])).toEqual([gf]);
    const pushed = resolveFonts({ add: [gf, { label: "Serif!", value: FONTS[1].value }] });
    expect(pushed).toHaveLength(FONTS.length + 1);
    expect(pushed.at(-1)!.label).toBe("Serif!");
  });

  it("writes @font-face rules for files and links for stylesheets", () => {
    const css = fontFaceCSS([brand, gf]);
    expect(css.split("\n")).toHaveLength(2);
    expect(css).toContain('font-family:"Brand Sans";src:url("/fonts/brand.woff2") format("woff2");font-weight:400');
    expect(css).toContain("font-weight:700");
    expect(fontStylesheets([brand, gf])).toEqual([gf.src]);
    expect(fontFaceCSS([{ label: "x", value: "X", src: "/a.woff2\");}body{color:red" }])).toBe("");
    expect(fontStylesheets([{ label: "x", value: "X", src: "javascript:alert(1)" }])).toEqual([]);
  });

  it("finds the fonts a document uses, tables included", () => {
    const doc = toDoc({ version: 1, blocks: [
      { type: "p", spans: [{ text: "a", font: gf.value }] },
      { type: "table", spans: [], rows: [[{ spans: [{ text: "b", font: brand.value }] }]] },
    ] })!;
    expect(usedFonts([brand, gf, FONTS[0]], doc.blocks).map((f) => f.label)).toEqual(["Brand", "Lora"]);
  });
});

describe("colour picker maths", async () => {
  const { hexToHsv, hsvToHex, normalizeHex } = await import("../UI/ColorPicker");
  it("round-trips hex through HSV", () => {
    for (const h of ["#000000", "#ffffff", "#e11d48", "#2f6bff", "#0c8599", "#808080"]) expect(hsvToHex(hexToHsv(h))).toBe(h);
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 100, v: 100 });
  });
  it("normalises typed hex", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #1a2B3c ")).toBe("#1a2b3c");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });
});

describe("video thumbnails", () => {
  const vid = (extra: Record<string, unknown>) => ({ version: 1, blocks: [{ type: "video", src: "https://x.test/a.mp4", spans: [], ...extra }] });

  it("keeps a safe poster on videos only", () => {
    expect(toDoc(vid({ poster: "https://x.test/p.jpg" }))!.blocks[0].poster).toBe("https://x.test/p.jpg");
    expect(toDoc(vid({ poster: "/uploads/p.png" }))!.blocks[0].poster).toBe("/uploads/p.png");
    expect(toDoc(vid({ poster: "data:image/png;base64,AAAA" }))!.blocks[0].poster).toBe("data:image/png;base64,AAAA");
    const img = toDoc({ version: 1, blocks: [{ type: "image", src: "https://x.test/a.png", poster: "https://x.test/p.jpg", spans: [] }] })!;
    expect(img.blocks[0].poster).toBeUndefined();
  });

  it("doesn't throw on non-string addresses (untrusted JSON)", () => {
    for (const bad of [5, true, {}, [], null])
      expect(() => toDoc({ version: 1, blocks: [{ type: "video", src: bad, spans: [] }, { type: "image", src: "https://x/a.png", poster: bad, spans: [] }] })).not.toThrow();
    expect(toDoc({ version: 1, blocks: [{ type: "video", src: 5, spans: [] }] })!.blocks.some((b) => b.type === "video")).toBe(false);
    expect(safeLink(42 as never)).toBeUndefined();
    expect(safeSrc({} as never)).toBeUndefined();
  });

  it("drops unsafe posters", () => {
    for (const poster of ["javascript:alert(1)", "data:video/mp4;base64,AAAA", "data:text/html;base64,AAAA", "ftp://x/p.jpg", "", 5])
      expect(toDoc(vid({ poster }))!.blocks[0].poster).toBeUndefined();
    expect(safePoster("data:video/mp4;base64,AAAA")).toBeUndefined();
    expect(safePoster(null)).toBeUndefined();
  });

  it("exports the poster and reads it back", () => {
    const doc = toDoc(vid({ poster: "https://x.test/p.jpg", caption: "Demo", width: 60 }))!;
    const html = toHTML(doc);
    expect(html).toContain('class="se-player"');
    expect(html).toContain('poster="https://x.test/p.jpg"');
    expect(html).toContain("controls");                                  // the no-script fallback
    expect(toHTML(doc, { mode: "inline" })).toContain('poster="https://x.test/p.jpg"');
  });

  it("escapes the poster in HTML", () => {
    const html = toHTML({ blocks: [{ type: "video", src: "https://x.test/a.mp4", poster: 'https://x.test/p.jpg?a="b"&c=<d>', spans: [] }] });
    expect(html).not.toContain('"b"');
    expect(html).toContain("&quot;b&quot;");
  });

  it("formats time", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
  });
});

describe("media sizing, wrapping and links", () => {
  const img = (extra: object = {}) => ({ type: "image", src: "https://x/a.png", spans: [], ...extra });
  const clean = (b: object) => cleanBlock(b)!;

  it("keeps free px sizes from 20px with no upper bound below the cap", () => {
    expect(clean(img({ w: 5 })).w).toBe(20);
    expect(clean(img({ w: 3000, h: 40 }))).toMatchObject({ w: 3000, h: 40 });
    expect(clean(img({ w: 99999 })).w).toBe(10000);
  });

  it("a px width replaces a percent one; 100% is a real width", () => {
    expect(clean(img({ w: 300, width: 50 })).width).toBeUndefined();
    expect(clean(img({ width: 100 })).width).toBe(100);
    expect(clean(img({ width: 1 })).width).toBe(5);
  });

  it("a fit needs a height, wrapping needs left or right", () => {
    expect(clean(img({ fit: "cover" })).fit).toBeUndefined();
    expect(clean(img({ h: 100, fit: "cover" })).fit).toBe("cover");
    expect(clean(img({ h: 100, fit: "stretch" })).fit).toBeUndefined();
    expect(clean(img({ wrap: true })).wrap).toBeUndefined();
    expect(clean(img({ wrap: true, align: "right" }))).toMatchObject({ wrap: true, align: "right" });
  });

  it("only images carry a safe link", () => {
    expect(clean(img({ link: "https://example.com" })).link).toBe("https://example.com");
    expect(clean(img({ link: "javascript:alert(1)" })).link).toBeUndefined();
    expect(cleanBlock({ type: "video", src: "https://x/v.mp4", link: "https://example.com", spans: [] })!.link).toBeUndefined();
  });

  it("a patch is made consistent", () => {
    const base = clean(img({ w: 300, h: 100, align: "left", wrap: true }));
    expect(normaliseMedia(base, { width: 50 })).toMatchObject({ width: 50, w: undefined, h: undefined });
    expect(normaliseMedia(base, { w: 10 }).w).toBe(20);
    expect(normaliseMedia(base, { h: undefined })).toMatchObject({ h: undefined, fit: undefined });
    expect(normaliseMedia(base, { align: undefined }).wrap).toBeUndefined();
    expect(normaliseMedia(clean(img()), { wrap: true })).toMatchObject({ wrap: true, align: "left" });
    expect(normaliseMedia(clean(img()), { link: "nope nope" }).link).toBeUndefined();
  });

  it("writes sizes, wrapping and the link into HTML", () => {
    const d = doc(img({ w: 640, h: 360, fit: "cover", align: "left", wrap: true, link: "https://example.com/" }) as never);
    const html = toHTML(d, { wrap: false });
    expect(html).toContain('data-wrap=""');
    expect(html).toContain('data-w="640"');
    expect(html).toContain("height:360px");
    expect(html).toContain("object-fit:cover");
    expect(html).toContain('<a class="se-media-link" href="https://example.com/"');
    const mail = toHTML(d, { mode: "inline" });
    expect(mail).toContain("float:left");
    expect(mail).not.toContain("class=");
  });

  it("email widths never pass the message", () => {
    const mail = toHTML(doc(img({ w: 2000 }) as never), { mode: "inline" });
    expect(mail).toContain("width:2000px;max-width:100%");
  });
});

describe("media patches", () => {
  it("a percent preset drops the fixed height and its fit", () => {
    const base = cleanBlock({ type: "image", src: "https://x/a.png", w: 300, h: 100, fit: "cover", spans: [] })!;
    expect(normaliseMedia(base, { width: 50 })).toMatchObject({ width: 50, w: undefined, h: undefined, fit: undefined });
  });
});
