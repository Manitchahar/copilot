# Design System Specification: The Tactile Manuscript

## 1. Overview & Creative North Star
**Creative North Star: The Tactile Manuscript**
This design system moves away from the cold, industrial precision of modern software and embraces the soul of high-quality stationery and a well-worn library desk. It is an editorial-first experience where digital interfaces feel as intentional as a hand-bound book. 

To break the "template" look, designers must lean into **intentional asymmetry**. Do not feel forced to align every element to a rigid grid; allow for overlapping surfaces, a balanced white space (negative space is your primary structural tool), and a typography scale that prioritizes "The Reader" over "The User." The goal is an atmosphere of quiet, premium comfort—where every interaction feels like turning a heavy page of parchment.

## 2. Colors & Tonal Depth
The palette is rooted in organic, earthy tones: warm parchments, sun-baked terracotta, and deep moss greens.

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for sectioning or containment. Boundaries must be defined through **Tonal Transitions**. To separate a sidebar from a main feed, transition from `surface` (#FAF9F6) to `surface_container_low` (#F4F3F1). This creates a "soft edge" that mimics the way light hits physical paper.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface-container tiers to create a nested hierarchy:
*   **Base Layer:** `surface` or `surface_container_lowest`.
*   **Secondary Content:** `surface_container_low` for subtle grouping.
*   **Interactive Cards/Modules:** `surface_container_high` or `surface_container_highest` to pull the element "closer" to the reader.

### Glass & Gradient Rule
For main CTAs or featured headers, use subtle linear gradients transitioning from `primary` (#99462A) to `primary_container` (#D97757). To create floating navigation or overlays, apply **Glassmorphism**: use semi-transparent surface colors (e.g., `surface` at 80% opacity) with a high `backdrop-blur` (20px-40px). This ensures the UI feels integrated into the environment, not just pasted on top.

## 3. Typography
The typography is a dialogue between the intellectual heritage of the serif and the modern clarity of the sans-serif.

*   **Display & Headlines (Newsreader):** Use these for storytelling. The Newsreader serif provides a literary, authoritative voice. Headlines should be set with tighter letter-spacing but generous top-margin to let the "chapter" breathe.
*   **Body & Labels (Manrope):** Use Manrope for functional reading. To achieve the "comfortable" mandate, ensure body text utilizes a line-height of at least 1.6x. 
*   **Hierarchy as Brand:** Use `display-lg` (3.5rem) sparingly to create a "Hero Editorial" moment. Contrast this with `label-sm` in all-caps for metadata, mimicking the fine-print notes in a manuscript.

## 4. Elevation & Depth
In this design system, depth is a feeling, not a shadow.

*   **The Layering Principle:** Depth is achieved by stacking the surface tokens. A `surface_container_lowest` card sitting on a `surface_container_low` background creates a natural, soft lift.
*   **Ambient Shadows:** If a floating element (like a modal or FAB) requires a shadow, it must be an "Ambient Shadow." 
    *   **Blur:** High (30px - 60px).
    *   **Opacity:** Low (4% - 8%).
    *   **Color:** Use the `on_surface` (#1A1C1A) color as the shadow base rather than pure black to keep the warmth of the parchment.
*   **The Ghost Border Fallback:** If accessibility requires a stroke, use a "Ghost Border": the `outline_variant` token at 15% opacity. Never use 100% opaque borders.

## 5. Components & Primitives

### Roundedness Scale
To remove "industrial sharpness," utilize the high-radius tokens:
*   **Main Containers & Cards:** Use `xl` (3rem) or `lg` (2rem).
*   **Buttons & Tags:** Use `full` (9999px) for a soft, pebble-like feel.

### Buttons
*   **Primary:** A gradient from `primary` to `primary_container` with `on_primary` text. Use `full` roundness.
*   **Secondary:** `surface_container_high` background with `primary` colored text. No border.
*   **Tertiary:** Text-only in `primary`, using `title-sm` typography for weight.

### Cards & Lists
*   **Layout:** Strictly forbid divider lines between list items. Use balanced vertical spacing (e.g., `spacing.6` or `spacing.8`) to create separation.
*   **Interaction:** On hover, a card should transition from `surface_container_low` to `surface_container_high` with a subtle Ambient Shadow.

### Input Fields
*   **Styling:** Use `surface_container_highest` for the input track. The label should use `label-md` in `on_surface_variant`. 
*   **Focus State:** Instead of a heavy ring, use a 2px `primary` stroke on the bottom edge only, or a subtle increase in background brightness.

### High-End Editorial Additions
*   **The "Vignette" Container:** Use large, `full` radius containers that slightly clip off-screen to create an expansive, non-contained feel.
*   **The Marginalia:** Use `body-sm` in the `secondary` color for side-notes or captions, placed asymmetrically in the margins.

## 6. Do's and Don'ts

### Do:
*   **Embrace white space:** Use `spacing.16` and `20` to separate major content blocks.
*   **Layer tonally:** Put lighter surfaces on darker ones to create focus.
*   **Use Serif for impact:** Treat headlines like the title of a book.

### Don't:
*   **Don't use 1px borders:** They break the "Tactile Manuscript" illusion and feel like a generic web app.
*   **Don't use sharp corners:** Even for small elements, the minimum radius should be `md` (1.5rem).
*   **Don't crowd the text:** Maintain generous line-heights and margins to keep the reading experience "cozy."
*   **Don't use pure greys:** Always ensure neutrals are tinted with the parchment (#FAF9F6) or moss (#5C614D) tones.