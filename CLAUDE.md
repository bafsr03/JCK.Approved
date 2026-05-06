# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shopify **Horizon** theme (v3.5.1 by Shopify), exported from `aywb8y-2q.myshopify.com`. There is no local build step — JavaScript is delivered as native ES modules via browser import maps, and CSS is plain CSS. All editing is done directly on the source files; changes are pushed to Shopify via CLI.

## Development commands

```bash
# Preview locally (requires Shopify CLI and store authentication)
shopify theme dev --store aywb8y-2q.myshopify.com

# Push changes to the live theme
shopify theme push --store aywb8y-2q.myshopify.com

# Push to a specific theme (development/unpublished)
shopify theme push --theme <THEME_ID> --store aywb8y-2q.myshopify.com

# Pull current theme from Shopify
shopify theme pull --store aywb8y-2q.myshopify.com
```

If Shopify CLI is not installed: `npm install -g @shopify/cli`

## Architecture

### Directory layout

| Directory | Purpose |
|---|---|
| `layout/` | Root Liquid layouts (`theme.liquid`, `password.liquid`) |
| `templates/` | Per-page JSON templates (reference sections by ID) and a few `.liquid` templates |
| `sections/` | Shopify sections — Liquid files rendered inside templates |
| `snippets/` | Reusable Liquid partials, rendered via `{% render %}` |
| `assets/` | JS modules, CSS files, and SVG icons — served directly by Shopify CDN |
| `blocks/` | Shopify theme blocks (sub-section components) |
| `config/` | `settings_schema.json` (theme settings definition) and `settings_data.json` (stored values) |
| `locales/` | Translation strings in JSON |

### JavaScript module system

Modules live in `assets/` and are loaded via a browser-native import map declared in `snippets/scripts.liquid`. All internal imports use the `@theme/*` namespace:

```js
import { Component } from '@theme/component';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';
import { morph } from '@theme/morph';
```

**Core modules:**

- `component.js` — Base class for all custom elements. Extends `HTMLElement`. Provides:
  - `this.refs` — auto-populated from child elements with `ref="name"` attributes (use `ref="name[]"` for arrays)
  - Declarative event binding: `on:click="methodName"` attributes on HTML elements route events to component methods without explicit `addEventListener` calls
  - Declarative Shadow DOM support via `DeclarativeShadowElement`
  - `updatedCallback()` — called after Section Rendering API re-renders the component

- `events.js` — Typed custom events and the `ThemeEvents` namespace. Use these for cross-component communication:
  - `ThemeEvents.cartUpdate`, `ThemeEvents.variantUpdate`, `ThemeEvents.variantSelected`, etc.
  - Dispatch on `document`; listen on `document`

- `morph.js` — DOM diffing/morphing used to apply Section Rendering API responses without full re-renders. Use `morphSection()` from `section-renderer.js` rather than calling morph directly.

- `section-renderer.js` — Wraps Shopify's Section Rendering API. Call `sectionRenderer.renderSection(sectionId)` to re-fetch and morph a section after state changes (e.g., cart updates, variant changes).

- `section-hydration.js` — Lightweight hydration via `hydrate(sectionId)`. Only morphs nodes with `data-hydration-key` attributes, preserving other DOM state.

- `utilities.js` — Shared helpers: `requestIdleCallback`, `yieldToMainThread`, `isLowPowerDevice`, `supportsViewTransitions`, etc.

### Global objects

Two globals are available everywhere (declared in `assets/global.d.ts`):

- `Shopify` — Platform object injected by Shopify
- `Theme` — Injected by `snippets/scripts.liquid` at page load:
  - `Theme.routes` — Cart/search API URLs
  - `Theme.translations` — Liquid-rendered i18n strings for use in JS

### Liquid conventions

- `snippets/scripts.liquid` — Rendered in `<head>` via `theme.liquid`; loads the import map and all `<script type="module">` tags
- `snippets/stylesheets.liquid` — Loads `base.css` and other CSS
- `snippets/theme-styles-variables.liquid` — Generates CSS custom properties from theme settings (colors, fonts, spacing)
- `snippets/color-schemes.liquid` — Generates color scheme CSS classes
- Sections reference snippets with `{% render 'snippet-name', param: value %}`

### TypeScript checking (JSDoc)

`assets/jsconfig.json` enables strict JS type checking:
- `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` are on
- Use JSDoc `@param`, `@type`, `@typedef` annotations in JS files — they are enforced
- Path alias `@theme/*` maps to `assets/*`

### Adding a new web component

1. Create `assets/my-component.js` — export a class extending `Component`
2. Register it: `customElements.define('my-component', MyComponent)` at the bottom of the file
3. Add a `<script src="{{ 'my-component.js' | asset_url }}" type="module">` tag in `snippets/scripts.liquid`
4. Use the element in Liquid with `<my-component>...</my-component>`
