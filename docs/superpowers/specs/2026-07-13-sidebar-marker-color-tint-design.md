# Sidebar Marker Color Tint Design

## Goal

Make every sidebar marker preview use the same visual structure as the existing red example: a saturated color strip on the left and a lighter tint across the preview body.

## Scope

- Change only marker previews in the sidebar.
- Preserve editor and reading-mode annotation colors.
- Preserve stored color values, color swatches, inheritance, and interaction behavior.
- Keep `none` backgrounds theme-neutral.

## Design

Each highlight background selector owns reusable CSS color variables alongside its existing document background. Sidebar previews consume those variables through generic selectors:

- The left `::before` strip uses the full marker accent color.
- The preview body uses `color-mix()` to blend the marker accent with Obsidian's current theme background.
- Light and strong variants of the same hue share the same sidebar accent, while their document rendering and sidebar swatches remain distinct.
- A future color only needs to define its background and accent variables in the central color selector. It does not need additional sidebar-specific strip or tint rules.

The existing per-color sidebar rules are removed after the generic rules cover all current colors.

## Compatibility

Obsidian 1.8.7 runs on an Electron/Chromium version that supports CSS `color-mix()`. Mixing with `var(--background-primary)` keeps the tint appropriate in both light and dark themes.

## Verification

- Add source-level regression assertions for the shared variables and generic sidebar selectors.
- Verify no per-color sidebar preview background selectors remain.
- Run the full test suite and production build.
- Install the generated plugin files into both configured Obsidian vaults.

## Acceptance Criteria

- Blue, green, orange, yellow, purple, gray, and red marker previews all show a visible saturated left strip.
- The preview body is visibly lighter than the strip.
- Editor and reading-mode annotation colors do not change.
- Adding a new color does not require a new sidebar-specific style block.
