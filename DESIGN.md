---
name: Toybox Director
description: A modelmaker's workbench for directing small objects into cinematic scenes.
colors:
  paper: "#f7f6f2"
  panel: "#eeede6"
  white: "#fdfcf9"
  ink: "#33372f"
  line: "#dfdfd5"
  orange: "#b9492b"
  orange-hover: "#a43c22"
  sage-text: "#606954"
  inspector: "#f3f3ec"
  field-surface: "#fafcf4"
  field-border: "#dbe4cd"
  field-focus: "#fffef9"
  field-focus-border: "#a9b694"
  focus-ring: "#c45534"
typography:
  headline:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-.9px"
  library-heading:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-.35px"
  title:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  label-strong:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  inset: "4px"
  field: "5px"
  control: "6px"
  card: "7px"
  surface: "8px"
spacing:
  tight: "4px"
  compact: "6px"
  control: "8px"
  related: "10px"
  group: "12px"
  section-compact: "16px"
  section: "20px"
  wide: "24px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "#fffdf8"
    typography: "{typography.label-strong}"
    rounded: "{rounded.card}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.orange-hover}"
  button-neutral:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.card}"
    padding: "9px 13px"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "#62665b"
    typography: "{typography.label-strong}"
    rounded: "{rounded.card}"
    padding: "9px 13px"
  button-danger:
    backgroundColor: "#faeee7"
    textColor: "#9c432b"
    typography: "{typography.label-strong}"
    rounded: "{rounded.card}"
    padding: "9px 13px"
  button-danger-hover:
    backgroundColor: "#f4dfd4"
    textColor: "#87351f"
  button-icon:
    textColor: "#777b6f"
    rounded: "{rounded.control}"
    width: "31px"
    height: "31px"
  button-text:
    textColor: "{colors.sage-text}"
    typography: "{typography.label}"
  field:
    backgroundColor: "{colors.field-surface}"
    textColor: "{colors.sage-text}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "8px 9px"
  viewport-tabs:
    backgroundColor: "#eeeee6"
    rounded: "{rounded.control}"
    padding: "3px"
  stage-tag:
    backgroundColor: "#f7f5edda"
    textColor: "{colors.sage-text}"
    typography: "{typography.label}"
    rounded: "{rounded.inset}"
    padding: "6px 8px"
  render-card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.surface}"
    padding: "15px"
  prop-row:
    backgroundColor: "#f9faf3"
    textColor: "{colors.sage-text}"
    rounded: "{rounded.control}"
    padding: "8px 7px"
---

# Design System: Toybox Director

## Overview

**Creative North Star: "The modelmaker's workbench"**

Toybox places a miniature stage inside a quiet, practical workshop. Warm paper, soft sage, fine borders, compact controls, and a self-hosted sans family give the studio a calm, tactile character. The imagery carries the dramatic color; the surrounding tools remain legible and restrained.

The visual personality belongs to a working instrument: an editable scene title, visible selection, measured playback, and closely related controls. Spacious scenic content and dense tooling coexist. The project-level film view gives the preview and cut assembly a shared working area, while project and render shelves use the same quiet materials. On phones, Stage and Director become separate views of the same workspace, and film editing follows the page vertically.

This v0.2 record is derived from the shipped CSS, React components, and retained screenshots, including `.impeccable/review/film-desktop-final.png` and `.impeccable/review/film-mobile-final.png`. The brief supplies the workbench name; no approved comparison comp or independently retained concept roll is asserted.

**Key Characteristics:**

- Warm paper surfaces with sage tooling and burnt orange actions.
- Compact Manrope text with weight and spacing doing most of the hierarchy work.
- A large scenic viewport, fine separators, and softly rounded control groups.
- A project-level film workspace with an adjacent preview and clip assembly on desktop.
- Explicit selected states and persistent access to stage direction on mobile.

## Colors

The palette combines warm off-whites and green-tinted neutrals with a dark burnt orange accent. Frontmatter records reusable source values; names below describe their use.

### Primary

- **Burnt orange** (`orange`) identifies the main render action, brand detail, active top-level navigation, and playback affordances. Its darker hover variant is `orange-hover`.
- **Orange focus** (`focus-ring`) marks keyboard focus independently of selection.

### Secondary

- **Sage text** (`sage-text`) carries the recurring secondary copy, field values, inspector controls, and stage annotations. Selected navigation also uses pale sage fills and darker green text; these remain contextual state treatments rather than a universal success fill.

### Neutral

- **Warm paper** (`paper`) is the main canvas and modal surface.
- **Workshop panel** (`panel`) separates the project rail; **inspector** is its lighter companion on the opposite side.
- **Soft white** (`white`) raises buttons and selected scene cards through tone.
- **Ink** (`ink`) is the main text; recurring secondary text uses sage.
- **Hairline** (`line`) separates major regions.
- **Field surface**, **field border**, and their focus variants distinguish editable areas without a heavy inset treatment.

### Named Rules

**The Scenic Color Rule.** Let the stage, reference images, and output carry broad color; keep the surrounding workbench in paper and sage tones.

**The Visible Selection Rule.** Pair selection color with a border, underline, indicator, checkmark, or explicit selected state.

## Typography

**Headline and Body Font:** Manrope, with Arial and sans-serif fallbacks. The application self-hosts regular and bold font files.

**Character:** One compact, rounded sans family connects the studio name, editable titles, labels, and detailed controls. The hierarchy is deliberately compressed; there is no recurring editorial display scale.

### Hierarchy

- **Headline:** The editable scene title uses the frontmatter headline role. Responsive scene-title sizes range from 23 to 25px. The film heading names the project at a comparable size (25px desktop, 24px mobile); its slight weight and tracking differences remain component-specific. The larger wordmark and reference captions are also component-specific treatments.
- **Library heading:** Render and film workspace headings use a shared 15px bold role, reduced to 14px in compact desktop layouts and restored to 15px on mobile.
- **Title:** Reusable section and help headings use a bold 12px role. Dense inspector headings often use the 11px strong label role.
- **Body:** The root and longer explanatory text use 12px. Dense supporting copy and field values use the 11px label role with contextual line-height, commonly 1.6–1.8.
- **Label:** Regular labels explain controls; strong labels identify actions and named items. Sentence case is the normal voice.
- **Numerals:** Timecodes, seeds, frame times, clip indexes, trim points, and film duration use tabular numerals. They retain Manrope rather than introducing a separate mono face.

### Named Rules

**The Quiet Hierarchy Rule.** Use weight, spacing, and placement to separate controls before adding another typeface or a large heading.

## Layout

The desktop scene studio is a three-part workbench: project rail, flexible stage, and director inspector. The source grid uses 214px and 296px outer columns with a flexible center, beneath a 68px header. The rail and inspector remain sticky below the header; the inspector scrolls internally and keeps its render action at the bottom. The center workspace uses 24px horizontal padding.

Film edit is a project-level workspace. It occupies both the center and inspector columns, hides the scene inspector, and replaces scene actions with the project title and a Direct a scene return action. Inside it, the preview and playback controls sit beside take selection, clip ordering, and trimming. The desktop grid is `minmax(0, 1.15fr) minmax(300px, 1fr)` with a 22px column gap; the heading and export row span both columns. The preview is bounded to `clamp(180px, 29vh, 300px)` and the clip list scrolls within 150px, keeping the working controls together. These dimensions describe this shipped film surface, not a universal panel template.

Output and film content occupy bounded desktop viewports with internal scrolling. Output uses one card column, becoming two at 1750px. Libraries share a compact heading, explanatory copy, and a divider before their content.

The reusable spacing rhythm is tight within controls, moderate between related items, and wider between sections. Values in frontmatter record the recurring steps; the source does not enforce a strict arithmetic scale. Fine borders separate regions more often than large gaps.

The stage toolbar, viewport, playback strip, and three equal frame columns form a continuous editing sequence. The viewport adapts to available height with a desktop minimum of 310px and maximum of 570px. These are current studio composition values, not mandatory dimensions for every future surface.

Responsive behavior is explicit:

- At 1700px and above, the outer columns become 234px and 316px and the center gains 32px horizontal padding.
- At 1220px and below, the outer columns reduce to 198px and 276px.
- At 1160px and below, the four viewport tabs become equal-width grid cells and library padding reduces from 20px to 16px.
- At 1020px and below, the project rail collapses to a 70px icon and thumbnail strip.
- Between 761px and 1000px, the film preview and assembly stack into one column; the clip list remains bounded at 180px.
- At 760px and below, the layout becomes a single column with a 59px header and a fixed Stage/Director switch. A scene selector replaces the project rail, inspector tabs stay sticky, and stage tool targets become 40px square. The mobile viewport uses `clamp(275px, calc(100dvh - 550px), 450px)` to leave room for the frame strip. The render action follows the inspector content.
- At 760px and below, Output and Film edit use normal page flow with 14px internal padding. Film preview, playback controls, take picker, clip list, trim fields, and export follow in that order. The clip list loses its height cap; row actions wrap below clip information, trim inputs form two columns, and Export film expands across the available width. Major library actions and trim fields use 40px targets. The fixed Stage/Director switch remains available; Director returns from Film edit to scene direction.
- At 390px and below, gutters and frame thumbnails tighten further; at 380px and below, viewport-tab icons disappear and library padding reduces to 12px.

Preserve normal page scrolling and the bottom safe-area allowance on mobile. Do not infer a universal 40px target from this build: some desktop controls remain smaller.

**The Working Scope Rule.** Match the working area and heading to the object being edited: scene tools surround a scene; the film uses the project title and the full available workspace.

## Elevation & Depth

Depth comes primarily from adjacent warm surfaces, one-pixel borders, and the rendered stage itself. Shadows in the interface are soft and local: subtle seating for selected items, stronger separation for transient overlays. They do not imitate the miniature scene's lighting.

### Shadow Vocabulary

- **Selected scene:** `0 2px 3px #353a2c04`.
- **Selected viewport tab:** `0 1px 2px #30352309`.
- **Dialog:** `0 25px 100px #292e2333`, paired with a dimmed backdrop and 3px blur.
- **Toast:** `0 5px 25px #38412e29`.
- **Preparation overlay:** `0 18px 70px #29352129`, paired with a dimmed, blurred backdrop while opening, saving, or preparing work.

These are component treatments, not a general elevation ladder.

### Named Rules

**The Paper Separation Rule.** Establish persistent regions with tone and fine borders; reserve substantial shadow for transient overlays.

## Shapes

The recurring form is a softly rounded rectangle with a fine border. Inner thumbnails and indicators use the inset radius; fields use the field radius; control groups use the control radius; buttons and small selection cards use the card radius; larger reusable containers use the surface radius.

Small circles represent status, radio selection, the playhead, and checkmarks. The stage and image cards clip their contents. Icons are stroked SVGs from Lucide; the workspace letter is a monogram, not an icon vocabulary. Dialogs are more rounded than working controls, but their isolated radius is not promoted into the base scale.

## Components

### Buttons

Compact and definite. The primary button uses burnt orange, warm white text, a matching border, and the primary hover value. Neutral buttons use soft white with a muted border. Subtle buttons remain transparent; text buttons remove the enclosure. Icon buttons use small rounded hit regions and a tonal hover fill. Confirmed destructive actions use a pale clay surface, warm border, and dark rust text; the paired Keep action remains neutral.

The main render button expands to the inspector width and uses an end-aligned arrow. Disabled buttons use reduced opacity and a not-allowed cursor. The common keyboard focus treatment is an orange two-pixel outline offset by three pixels.

Color, border, and shadow transitions last 150ms with ease timing. Loading icons rotate over 1.2s; toasts enter over 200ms. The reduced-motion query removes normal transitions and spinner animation.

### Chips

The stage tag is a compact translucent paper label with a fine border, a small status dot, and regular sentence-case text. Numerical badges are small inset counters attached to navigation or props. These treatments convey status and counts; they are not promotional eyebrows.

### Cards / Containers

Scene cards and render cards use the surface radius. Render shelf cards use soft white against the workshop panel, with a title and status row above media, progress, or an error. Scene selection introduces a soft white surface and faint shadow; frame selection uses a warm border, pale peach background, and checkmark. The three storyboard cards maintain equal widths and corresponding frame positions.

World options combine an image, two lines of text, and a radio indicator. Their selected state is warm, while prop selection is sage. Preserve each component's role-specific state treatment.

### Inputs / Fields

Editable fields use pale green-white surfaces, fine green borders, and compact rounded corners. On focus, the border darkens and the surface becomes warmer and brighter. Multiline direction fields use more generous line-height for reading and editing.

The scene name and note are visually integrated into the workspace. Their enclosure appears on hover or focus. Inline camera and duration selectors align their labels with values; seeds and frame times use tabular numerals.

### Navigation

Top-level navigation uses a thin orange active underline. The project rail uses a sage selected fill. The four viewport tabs—Your stage, Look reference, Output, and Film edit—sit in a rounded tonal group with a soft white selected button. Output can carry a small activity dot while work is in the queue. The workspace control, project breadcrumb, Projects rail item, and mobile folder button open the project shelf. Inspector tabs use a sage underline, while mobile Stage/Director navigation uses a pale sage selected surface.

Use these observed patterns for their corresponding depth of navigation; do not replace them with one universal tab treatment.

### Stage and storyboard

The live 3D stage is the studio's signature surface. Its upper annotations identify mode, camera, and frame; lower controls manipulate the view. The three-frame strip registers the same scene across beginning, middle, and end, supported by a small playback ruler.

Keep concept stills, stage/world previews, and completed output visibly distinguished. Reference artwork remains labelled as concept imagery. A real render's progress, failure, and download state belong in Output.

### Project and render shelves

Project rows pair a small world thumbnail with the project name, scene count, saved date, and an explicit Open now marker. Hover and focus tint the opening action; deletion uses an inline Delete/Keep confirmation. New project is primary and Import project is neutral. The shelf represents autosaved projects on this device; the dialog explains that export moves a project elsewhere.

Output is a durable render shelf with a This project / All projects filter and refresh control. Each card names its render and displays a written status: sage for completed, amber for active work, clay for failure, and quiet neutral for cancellation. Status text and icons carry meaning alongside color. Completed media exposes Download and, for video, Add to film. Active jobs expose Stop render; failed or canceled shots expose Try again. Deletion asks to remove the render and file together. Keep these actions next to the item they affect.

Queue preparation uses a centered progress overlay with a labelled spinner. Batch preparation offers Stop adding shots. The overlay, written job states, and inline errors make waiting and failure visible without presenting placeholder media as completed work.

### Film assembly

The film editor continues the workbench materials: sage tooling, a media-led preview, numbered clip rows, and a burnt orange export action. A selected clip uses the same warm-border and pale-peach family as selected storyboard frames; its index and text change with the enclosure. Reorder and remove controls stay attached to each row. In and Out fields sit in a separate pale sage group and use tabular numerals.

Play cut and Assemble scenes sit below the preview; a take selector and Add take sit above the list. A compact count-and-duration chip summarizes the edit. The export row states the output format and that the finished film appears on the render shelf. Empty or unavailable media shows an explanatory state with an Open render shelf action. Keep stage previews, source takes, and assembled films explicitly identified.

## Do's and Don'ts

### Do:

- **Do** let scenic content provide the strongest visual color.
- **Do** keep controls compact, with fine borders and the recorded paper and sage palette.
- **Do** give selected items a visible structural cue as well as a color change.
- **Do** use tabular numerals for time, frame timing, and seeds.
- **Do** retain Stage and Director access when the workbench collapses to mobile.
- **Do** label concept imagery and distinguish previews from completed renders.
- **Do** match scene and project headings to the current editing scope.
- **Do** keep film preview, clip assembly, and export controls together on desktop and in readable page order on mobile.
- **Do** pair render status colors with written states and keep recovery actions beside the affected render.

### Don't:

- **Don't** use the burnt orange primary-action treatment as a general panel background.
- **Don't** apply modal shadows to persistent rails, fields, or the whole workspace.
- **Don't** turn component-specific uppercase labels or isolated pale text values into new global typography roles.
- **Don't** present concept artwork or a stage preview as a completed generated shot.

Not canonized: isolated low-contrast text colors, the single uppercase scene-list label, unused custom properties, and scene-specific artwork/geometry are not reusable system rules. No craft-floor refusal is adopted as house style.

