# Editor toolset audit

**Date:** 2026-09-23  
**Scope:** the nine Inkwell writing surfaces: Screenplay, Prose, Memoir,
Poetry, Lyrics, Comic, TTRPG, Interactive Fiction, and Vault.

## Decision

Inkwell has a sound format-native editor architecture, but the present claim
that every editor is complete is too broad. Most editors have the minimum
semantic blocks needed to store their medium. Several still lack the craft,
revision, and production tools expected in a professional writing application.

We will assess each editor in three layers:

1. **Document vocabulary** — the semantic blocks in the manuscript: a poetic
   line, screenplay scene heading, comic panel, or interactive-fiction choice.
2. **Writing and revision tools** — the aids around those blocks: rhyme and
   meter analysis, character and point-of-view metadata, diagnostics, goals,
   templates, revision history, and keyboard workflows.
3. **Production and interchange** — valid industry output, pagination,
   title/front matter, submission settings, and collaboration handoff.

This prevents a wide toolbar from becoming a substitute for a capable editor.
Craft concepts such as enjambment, a sonnet, point of view, or pacing are not
necessarily new block types. Many belong in inspectors, templates, analysis,
or document metadata.

## Cross-editor findings

The shared `PagedSheets`, tool rail, comments, real-time editing, imports, and
`.iw` archive are a strong foundation. The next shared foundation should add:

- inline marks: emphasis, strong emphasis, underline where the format permits,
  links, and small caps;
- semantic document metadata and front matter rather than encoding metadata as
  body text;
- an editor command palette with searchable commands and keyboard shortcuts;
- reusable format templates and project-level style settings;
- revision snapshots, compare/restore, and named variants;
- a common diagnostics surface for warnings that never alter prose silently;
- format-aware PDF and DOCX output settings with a print preview;
- accessibility semantics and full keyboard operation for every tool.

These capabilities should be shared infrastructure, with each format opting
into only the commands and marks that make sense.

## Format audits

### Poetry — correct primitives, incomplete toolset

**Current vocabulary:** Line and Stanza Break.

Those are the right minimum semantic primitives. A poetic line is a deliberate
unit, and its ending, indentation, and relationship to the next line carry
meaning. The Poetry Foundation's references on the
[poetic line](https://www.poetryfoundation.org/education/glossary/line) and
[lineation](https://www.poetryfoundation.org/articles/70144/learning-the-poetic-line)
support keeping line and stanza structure explicit. Adding buttons named
“caesura” or “enjambment” would confuse critical concepts with stored blocks.

**Missing writing tools:**

- per-line indentation, hanging indentation, alignment, and deliberate blank
  space, including preservation across export;
- inline emphasis and small caps;
- poem section/sequence dividers, epigraphs, dedications, and notes;
- form templates and non-blocking constraint tracking for sonnets, villanelles,
  sestinas, haiku, and user-defined forms; the
  [sonnet](https://www.poetryfoundation.org/education/glossary/sonnet) is a good
  example of a form made from constraints, not a new content element;
- syllable count, stress/meter assistance, rhyme scheme, repeated-word and
  sound-pattern views, all advisory and dismissible;
- named variants and a side-by-side revision comparison;
- optional line numbering and stanza/page keep controls;
- submission-ready DOCX and PDF presets, with manuscript headers and one poem
  per requested page. Poetry Society guidance confirms that real submissions
  commonly require conventional typography and document files
  ([submission guidance](https://ypn.poetrysociety.org.uk/features/how-to-get-your-work-out-there/)).

**Assessment:** the data model is an appropriate seed; the authoring and output
layers are early. Priority: **high**.

### Lyrics — separate it from Poetry

**Current vocabulary:** Line, Stanza Break, Section, and Chords. Lyrics is a
boolean mode inside `PoetryEditor`, and section labels export as generic
ChordPro comments.

Lyrics should share a line editor with Poetry, but it needs its own vocabulary
and inspector:

- semantic Verse, Chorus, Pre-Chorus, Bridge, Intro, Outro, Tag, and custom
  sections, including “repeat chorus” without duplicating its text;
- song metadata: writer/composer, artist, album, copyright, key, tempo, time
  signature, duration, capo, and tuning;
- chord validation, transposition, chord diagrams, and optional Nashville
  numbers;
- tab and chord-grid blocks, page/column controls, and rehearsal marks;
- section navigation, rhyme/repetition analysis, and alternate lyric variants;
- ChordPro import/export that uses native environments and directives rather
  than flattening sections to comments. ChordPro defines
  [verse/chorus/bridge, tab, and grid environments](https://www.chordpro.org/chordpro/directives-env/)
  plus [metadata and layout directives](https://www.chordpro.org/beta/chordpro-directives/).

**Assessment:** usable for simple chord sheets, not yet a full songwriting
surface. Priority: **high**.

### Interactive Fiction — good authoring shell, incomplete runtime

**Current vocabulary:** Body, Choice, Conditional, Set Variable, and Author
Note, plus passage search, graph/list views, characters, Twee interchange, and
a Play view.

The main gap is correctness: Play currently omits `set` elements and displays
conditionals without evaluating them. A writer can author logic that the
preview does not execute. The editor needs:

- a declared variable model with types, initial values, references, and a
  searchable inspector;
- an actual expression parser/evaluator shared by editing diagnostics, Play,
  and export tests;
- passage tags and colors, start-passage selection, metadata, and automatic
  inbound-link updates when a passage is renamed;
- unreachable-passage, dead-end, broken-link, undefined-variable, and
  impossible-condition diagnostics;
- a runtime debugger with variable watch, execution history, reset, save slots,
  and named test states;
- a deliberate story-format/dialect contract for Twee export rather than an
  ambiguous private syntax;
- story stylesheet, script, and media resources; reusable macros/snippets.

Twine treats story formats as distinct runtime contracts
([story formats](https://www.twinery.org/cookbook/introduction/story_formats.html)),
and exposes variables, passage tags/colors, link-aware renaming, JavaScript,
CSS, and images as normal parts of authoring
([variables](https://www.twinery.org/cookbook/terms/terms_variables.html),
[passages](https://www.twinery.org/cookbook/introduction/passages.html),
[renaming](https://twinery.org/reference/en/editing-stories/linking-passages.html),
[tagging](https://twinery.org/reference/en/editing-stories/tagging.html)).

**Assessment:** strong structural editor; Play cannot yet validate the story it
authors. Priority: **high**.

**Resolution (2026-09-23, #405):** the correctness gap above is closed. Play
and deterministic SugarCube export now share the documented expression
contract; typed initial state, variable watch, execution history, passage
metadata, exact-link rename, named entry-state tests, and the listed structural
and logic diagnostics ship. Story stylesheet/script/media resources, reusable
macros, and a broader save-slot workflow remain future depth work.

### Screenplay — solid drafting core, production work remains

**Current vocabulary:** Scene Heading, Action, Character, Parenthetical,
Dialogue, Transition, and Shot. Note, Outline, Act, Lyrics, Sequence, and Dual
Dialogue exist only as “coming soon” configuration.

The active set covers the standard screenplay body. Final Draft describes the
same principal elements and keyboard-driven transitions between them
([formatting elements](https://www.finaldraft.com/learn/screenplay-formatting-elements/),
[element behavior](https://kb.finaldraft.com/hc/en-us/articles/27646947570196-What-are-script-elements)).
Professional depth now requires:

- title page and document metadata;
- structured character extensions such as V.O., O.S., and CONT'D;
- dual dialogue, lyrics, notes, act/sequence structure, and reusable TV
  templates;
- automatic MORE/CONT'D, scene numbers, locked pages, revision colors/sets,
  page locks, and production reports;
- keyboard flow and autocomplete covering every enabled element;
- production-aware PDF/FDX round trips and explicit warnings for unsupported
  constructs. Final Draft's title-page and production conventions are useful
  compatibility targets
  ([screenplay format](https://www.finaldraft.com/learn/how-to-format-a-screenplay/)).

**Assessment:** good drafting editor; partial production editor. Priority:
**medium-high**.

### Comic — useful script vocabulary, invalid production promise

**Current vocabulary:** Panel, Character, Balloon, Caption, SFX, and
Transition.

This is a good generic base because comics do not have one universal script
format. It needs:

- splash and double-page-spread page intent;
- numbered lettering items, balloon type and character extensions, locator vs
  narrative captions, and artist/letterer notes;
- per-balloon and per-panel word-count guidance, kept as warnings;
- page-turn and pacing views, title/cast/recap pages, and page renumbering;
- script PDF/DOCX templates for writer-to-artist/letterer handoff.

Dark Horse's published script guide demonstrates page/panel numbering,
ordered dialogue/caption/SFX, and practical balloon/panel word-count guidance
([Dark Horse script format PDF](https://images.darkhorse.com/darkhorse08/company/submissions/scriptguide.pdf)).
Professional sample scripts also show why templates must be configurable
([Comics Experience samples](https://comicsexperience.com/scripts/)).

**Correctness issue — resolved 2026-09-23 (#406):** the former CBZ exporter
wrote `.txt` entries into a `.cbz` archive. Inkwell now exports formatted
comic-script PDF and DOCX. CBZ is reserved for a future workflow with
rendered/imported page artwork to package.

**Assessment:** reasonable drafting base; export is misleading and likely
non-interoperable. Priority: **high for export correction**, medium afterward.

### Prose — sound structure, thin long-form workflow

**Current vocabulary:** Paragraph, Dialogue, Chapter/H2/H3 headings, Stinger,
and Scene Break.

Add:

- shared inline formatting plus block quote/extract, epigraph, letter/document,
  footnote/endnote, image, and caption support;
- book front/back matter, chapter numbering, section ordering, and compile
  controls;
- scene metadata for synopsis, point of view, characters, location, date/time,
  status, notes, and word-count goals;
- manuscript DOCX/PDF presets and book-quality EPUB validation;
- find/replace across the manuscript, revision compare, and variant scenes.

**Assessment:** capable clean-draft surface; incomplete novel production and
editorial workflow. Priority: **medium**.

### Memoir — must stop being an alias for Prose

Memoir currently uses the Prose surface unchanged. It should inherit Prose's
tools and add:

- event date/range, age, place, people, and source metadata;
- chronological and manuscript-order timelines;
- source/citation records, interview/transcript links, image/document evidence,
  and private fact-check notes;
- privacy/sensitivity flags and name-change tracking;
- chronology conflict and unsupported-claim review views.

**Assessment:** generic prose today, not a distinct memoir workflow. Priority:
**medium**.

### TTRPG — promising generic blocks, needs system and book layers

**Current vocabulary:** Body, H2, Stat Block, Table, Random Table, Designer
Note, and Rule Box.

Add:

- H3/H4, boxed read-aloud text distinct from designer notes, sidebars, figures,
  maps, captions, and cross-references;
- semantic encounter, NPC, creature, item, spell/power, feat, hazard/trap, and
  adventure-location blocks through configurable system packs;
- dice-expression validation and rollable references;
- columns, callout themes, appendices, glossary/index, and print layout;
- a system-neutral core with opt-in schema/template packs. The structured
  creature, encounter, item, spell, and rules material in the official
  [D&D SRD 5.2](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf)
  illustrates the need, but must not become Inkwell's universal schema.

**Assessment:** good system-neutral start; incomplete publishing tool. Priority:
**medium**.

### Vault — mature core, improve authoring ergonomics

**Current capabilities:** CodeMirror Markdown live preview, wiki links,
backlinks, tags, attachments, rename sweep, folder tree, and graph.

Add:

- command palette and formatting commands for common Markdown actions;
- outline/table of contents, front-matter/properties editor, and templates;
- task/query affordances and bulk link/tag refactors;
- publishing/export profiles where they serve a concrete workflow.

**Assessment:** the strongest editor; remaining gaps are speed and discoverability.
Priority: **low-medium**.

## Delivery order

### 0. Correct misleading output and finish launch gates

- ~~Replace text-in-CBZ with honest comic-script PDF/DOCX; reserve CBZ for
  art.~~ **Done 2026-09-23 (#406).**
- Reconcile product/release documentation with shipped behavior.
- ~~Finish hosted character CRUD/tool parity.~~ **Done 2026-09-23 (#410).**
- Finish the current security/operations launch tasks.

### 1. Build the shared editor capability foundation

- inline marks, semantic metadata, command palette, diagnostics API, revision
  snapshots/variants, and export profiles;
- keep the saved schema extensible and backward compatible;
- design keyboard and accessibility behavior with the components.

### 2. Close the largest authoring gaps

- split Poetry and Lyrics into distinct configurations over shared line-editing
  infrastructure;
- ship poetry layout/form/revision/submission tools;
- make Lyrics ChordPro-native;
- ~~Finish Interactive Fiction variables, runtime evaluation, tags, and
  diagnostics.~~ **Done 2026-09-23 (#405).**

### 3. Add professional production workflows

- screenplay title/revision/production features;
- comic lettering, pacing, and handoff features;
- prose compile/front matter and memoir timeline/sources.

### 4. Expand specialist publishing and knowledge workflows

- TTRPG system packs and book layout;
- Vault command palette, properties, queries, and publishing profiles.

## Acceptance principles

- A tool earns its place by representing format semantics or removing repeated
  work; it is not added merely to make a toolbar look full.
- Analysis is advisory. Inkwell never rewrites creative choices silently.
- Every persisted construct must survive `.iw` export/import and cloud sync.
- Every production export has a fixture opened by at least one independent
  consumer or validator.
- Each format has a keyboard-first path for inserting, changing, navigating,
  and rearranging its elements.
- The app describes an editor as “complete” only when all three layers in this
  audit are complete; until then status notes say exactly which layer ships.
