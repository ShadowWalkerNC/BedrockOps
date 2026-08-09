---
name: BedrockOps Console
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#383939'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1b1c1c'
  surface-container: '#1f2020'
  surface-container-high: '#292a2a'
  surface-container-highest: '#343535'
  on-surface: '#e3e2e2'
  on-surface-variant: '#c3c9b7'
  inverse-surface: '#e3e2e2'
  inverse-on-surface: '#303031'
  outline: '#8d9383'
  outline-variant: '#43493b'
  surface-tint: '#a4d575'
  primary: '#a4d575'
  on-primary: '#1b3700'
  primary-container: '#709d45'
  on-primary-container: '#173000'
  inverse-primary: '#3f6915'
  secondary: '#dac2af'
  on-secondary: '#3c2d20'
  secondary-container: '#574637'
  on-secondary-container: '#ccb4a1'
  tertiary: '#00dddd'
  on-tertiary: '#003737'
  tertiary-container: '#00a1a1'
  on-tertiary-container: '#002f2f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#bff28e'
  primary-fixed-dim: '#a4d575'
  on-primary-fixed: '#0e2000'
  on-primary-fixed-variant: '#2a5000'
  secondary-fixed: '#f7deca'
  secondary-fixed-dim: '#dac2af'
  on-secondary-fixed: '#26190d'
  on-secondary-fixed-variant: '#544435'
  tertiary-fixed: '#00fbfb'
  tertiary-fixed-dim: '#00dddd'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#004f4f'
  background: '#121414'
  on-background: '#e3e2e2'
  surface-variant: '#343535'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  gutter: 16px
  margin: 24px
---

## Brand & Style

The design system adopts a **Minecraft-inspired Professional** aesthetic, blending the blocky, material-driven world of Minecraft with the structured precision of an enterprise operations console. The UI should evoke the feeling of a high-tech command center built within a deep-slate bunker—utilitarian, resilient, and grounded.

The style is a hybrid of **Brutalism** and **Low-Poly Tonalism**. While it draws from a blocky source material, it introduces a subtle "micro-rounding" to reflect modern software precision. Surfaces are treated like "blocks," using layered shades of stone and dirt to define hierarchy. Interaction states should feel mechanical and binary, reflecting the logic-driven nature of Redstone engineering.

## Colors

The palette is rooted in the natural materials of the overworld and the deep dark.

- **Primary (Grass Green):** Used for "Success" states, active connections, and primary action buttons.
- **Secondary (Dirt/Bark Brown):** Used for navigation sidebars, header backgrounds, and structural containers.
- **Tertiary (Diamond Blue):** Reserved for high-importance highlights, data visualization spikes, and active focus states.
- **Neutral (Stone Gray):** The standard for borders, inactive text, and disabled states.
- **Background (Deepslate):** A very dark, slightly textured gray (#121414) provides the foundation for the entire console.
- **Accent (Gold):** Used exclusively for warnings, critical alerts, or "VIP" system status.

## Typography

This design system uses a strategic mix of three typefaces to balance character with legibility:

1. **Space Grotesk (Headlines):** Its geometric, slightly quirky construction mirrors the "blocky" aesthetic while remaining modern and professional.
2. **Inter (Body):** Used for all long-form data, logs, and descriptions to ensure maximum readability in an operations context.
3. **JetBrains Mono (Labels & Stats):** Provides the "Console" feel. Used for badges, system metrics, IDs, and button labels to emphasize the technical nature of the tool.

All headers should use `text-transform: uppercase` sparingly to denote section breaks, mimicking the look of official Minecraft UI screens.

## Layout & Spacing

The layout is strictly **Fixed-Grid** based on an 8px modular scale, reflecting the grid-based world of the source material. 

- **Sidebar:** Fixed at 280px, styled in `secondary_color_hex` (Dirt Brown) with a 2px inner border to simulate a block face.
- **Grid:** Use a 12-column layout for the main dashboard. Components should "snap" to the grid with zero gaps between adjacent cards, using 2px borders to differentiate them.
- **Margins:** Consistent 24px padding around the main viewport to provide breathing room against the dark deepslate background.

## Elevation & Depth

Elevation is conveyed through **Inset/Outset Borders** and **Tonal Layering** rather than soft shadows.

- **Level 0 (Background):** Deepslate (#121414).
- **Level 1 (Containers):** Stone Gray. Use a 2px solid border of #4A4A4A on the top and left, and #121212 on the bottom and right to create a subtle "block" extrusion.
- **Level 2 (Active/Hover):** When a block is interacted with, change the border to Diamond Blue (#00FFFF).
- **Floating Elements (Modals):** Use a thick 4px border in #000000 with no blur. A semi-transparent black overlay (#000000CC) should dim the background to maintain focus.

## Shapes

The shape language is **Softly Rounded (8px)**. 

While the aesthetic remains "blocky," every UI element—from buttons to input fields to window containers—features an 8px (0.5rem) corner radius. This softens the brutalist edges of the design, making the "blocks" feel like high-quality molded plastic or polished stone rather than raw, sharp-edged cubes. To differentiate between elements, use "stepped" borders: a 2px border for standard components and a 4px border for the primary viewport or high-level containers.

## Components

### Buttons
- **Primary:** Solid #5B8731 (Grass Green) background. Text in white #FFFFFF. 2px dark green bottom border for a "pressed" feel. Corner radius is 8px.
- **Secondary:** Transparent background with 2px #7A7A7A (Stone) border.
- **Interaction:** On hover, the background brightens by 10%. On click, the element shifts 2px downward.

### Cards & Modules
Cards should look like inventory slots. Use a dark background (#252525) with an 8px corner radius and a 2px inset border (#121212). Headers for cards should have a solid #4A3A2C (Dirt) background strip.

### Inputs & Text Fields
Inputs are recessed with an 8px corner radius. Use a black background (#000000) with a 2px top/left border in #121212 to create an "etched" look. Use JetBrains Mono for the input text.

### Status Badges
- **Online:** Grass Green square icon + text.
- **Warning:** Gold-Yellow border + bold text.
- **Critical:** Redstone Red (#CC0000) background.

### Progress Bars
Constructed of discrete segments. Instead of a smooth fill, the bar should fill in 5% or 10% "blocks." Use Diamond Blue for system progress and Grass Green for health/resource metrics.