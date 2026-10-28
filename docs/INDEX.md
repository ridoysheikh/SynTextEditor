# SynTextEditor documentation

`@syntext/react` — a rich text editor for React and Next.js whose document is data, not HTML.

| Page | What's in it |
|---|---|
| [Getting started](getting-started.md) | Install, the two stylesheets, a first editor, showing documents, Next.js and server rendering |
| [Configuration](configuration.md) | Every option of `useSynTextEditor(config)`, with defaults |
| [Theming](theming.md) | Every `--se-*` variable with its light, dark, compact and comfortable values; theme modes, density, wrapper-class themes, Tailwind |
| [Customization](customization.md) | Presets and formats, toolbar layouts and tool ids, building your own toolbar, per-part classes and styles, palettes, custom web fonts (`fonts: { add }`, `src`), the class-name reference |
| [Your own components](components.md) | Every UI part as a replaceable slot: wrap the default or draw your own (buttons, tooltips, menus, dialogs, sliders, colour picker, toolbar, single tools), live |
| [The right-click menu](context-menu.md) | Default rows per target, turning it off, choosing rows by id, your own rows and submenus, opening it from code |
| [Storage and media](storage.md) | The four operations, REST endpoints, response shapes, upload limits, examples for Next.js routes and S3 |
| [API reference](api.md) | The instance, events, hooks, components, the viewer, HTML functions, keyboard shortcuts |
| [The document model](document-model.md) | Blocks, spans and marks; validating on a server; HTML in and out |

The demo app (`pnpm dev`) shows each of these live: a word processor, a basic comment box, a minimal field,
theming (including density), live controlled options with a custom right-click menu, the viewer with HTML
output, and a host-built toolbar.
