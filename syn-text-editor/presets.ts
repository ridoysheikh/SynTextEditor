/**
 * Presets: what an editor allows (its schema) and the toolbar that goes with it. "full" is a word processor;
 * "basic" is text weight and lists, for comments and descriptions. Pass `formats` / `toolbar` to mix your own.
 */
import { ALL_FORMATS, type Format } from "./core/model";

/** Every control the toolbar knows, by id. */
export type ToolId =
  | "undo" | "redo" | "block" | "font" | "size"
  | "bold" | "italic" | "underline" | "strike" | "code" | "sub" | "sup"
  | "color" | "highlight"
  | "align" | "bullet" | "ordered" | "check" | "outdent" | "indent"
  | "quote" | "codeblock" | "link" | "image" | "video" | "file" | "media" | "table" | "hr"
  | "painter" | "clear" | "find" | "preview" | "fullscreen";
/** Groups of tools; a divider between groups. */
export type ToolbarLayout = ToolId[][];

export type PresetName = "full" | "standard" | "basic" | "minimal";
export interface Preset { formats: Format[]; toolbar: ToolbarLayout; statusbar: boolean }

export const PRESETS: Record<PresetName, Preset> = {
  full: {
    formats: ALL_FORMATS,
    toolbar: [
      ["undo", "redo"],
      ["block", "font", "size"],
      ["bold", "italic", "underline", "strike", "code", "sub", "sup"],
      ["color", "highlight"],
      ["align", "bullet", "ordered", "check", "outdent", "indent"],
      ["link", "media", "table", "hr"],
      ["painter", "clear"],
      ["find", "preview", "fullscreen"],
    ],
    statusbar: true,
  },
  standard: {
    formats: [
      "bold", "italic", "underline", "strike", "code", "color", "highlight", "link", "size",
      "h1", "h2", "h3", "quote", "bullet", "ordered", "indent", "align", "hr", "image",
    ],
    toolbar: [
      ["undo", "redo"],
      ["block", "size"],
      ["bold", "italic", "underline", "strike"],
      ["color", "highlight"],
      ["align", "bullet", "ordered"],
      ["link", "image", "hr"],
      ["clear"],
    ],
    statusbar: false,
  },
  basic: {
    formats: ["bold", "italic", "underline", "strike", "bullet", "ordered", "indent", "link"],
    toolbar: [["bold", "italic", "underline", "strike"], ["bullet", "ordered"], ["link"]],
    statusbar: false,
  },
  minimal: {
    formats: ["bold", "italic", "link"],
    toolbar: [["bold", "italic", "link"]],
    statusbar: false,
  },
};

/** The format a tool needs; a tool whose format the schema lacks is left off the toolbar. */
export const TOOL_FORMAT: Partial<Record<ToolId, Format | Format[]>> = {
  bold: "bold", italic: "italic", underline: "underline", strike: "strike", code: "code", sub: "script", sup: "script",
  color: "color", highlight: "highlight", font: "font", size: "size", align: "align",
  bullet: "bullet", ordered: "ordered", check: "check", outdent: "indent", indent: "indent",
  quote: "quote", codeblock: "code", link: "link", image: "image", video: "video", file: "file",
  media: ["image", "video", "file"], table: "table", hr: "hr",
  block: ["h1", "h2", "h3", "h4", "quote", "code"],
};
