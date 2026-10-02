# Editor standards audit

Audited 2026-09-28. This is a source and code review, not a certification of every exported file. A format is ready for a specific market only after its output is checked against that market's current submission rules.

## Architecture decision

Keep separate writing surfaces for prose, verse, screenplay, comics, interactive fiction, tabletop RPGs, and Markdown vaults. Keep novel and memoir together in `ProseEditor`, and poetry and lyrics together in `PoetryEditor`, with distinct format controls. They already share `ProjectShell`, `EditorWorkspace`, `PagedSheets`, document state, autosave, inline editing, comments, and navigation. A single universal editor would need many category branches for incompatible units (paragraphs, lines, screenplay cues, panels, passages, rules blocks), pagination, and exports. The present problem is scattered controls and insufficient export verification, rather than excessive shared abstraction.

Do not merge editor components to solve a standards problem. Extract another shared primitive only after at least two formats need the same behavior and its invariants can be tested. Keep the canonical project content independent of submission layout; add explicit export profiles where a market requires them.

## Reference hierarchy

1. A destination's current submission specification wins for a particular submission.
2. A published interchange specification wins for a file format (EPUB, ChordPro, Twee).
3. A professional association or publisher guide supplies a useful default when there is no universal specification.

Sources: [Academy of American Poets submission advice](https://poets.org/text/writing-and-publishing-faq), [SFWA submission advice](https://sfwa.org/2025/10/21/story-submission-101/), [Academy screenplay format guide](https://www.oscars.org/nicholl/screenwriting-resources), [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/).

## Format matrix

| Editor | Reference target | Existing support | Gap / acceptance gate |
| --- | --- | --- | --- |
| Novel and memoir | [SFWA manuscript guidance](https://sfwa.org/2025/10/21/story-submission-101/), [literary agency example](https://madeleinemilburn.com/submissions/), and each agent/publisher's rules | Shared `ProseEditor`; chapter/paragraph structure; TXT, Markdown, PDF, DOCX, EPUB | Add configurable submission profile for title page, byline/contact, headers, spacing, and page numbering. Validate EPUB with EPUBCheck and at least two readers. Current unit tests only inspect ZIP entries and fragments. |
| Poetry | [Academy of American Poets](https://poets.org/text/writing-and-publishing-faq), [Poetry Society competition FAQ](https://npc.poetrysociety.org.uk/faqs/), [Poetry Foundation on visual poetry](https://www.poetryfoundation.org/articles/158477/on-visual-poetry) | Line, stanza, prose paragraph, and section units; indentation, whole-poem alignment, advisory form tools; PDF/DOCX/TXT. The first export pass preserves PDF bold/italic/underline, epigraphs, and hanging continuations for long lines. A representative PDF and DOCX were rendered and inspected. | Verify larger multi-page fixtures and rendering in Microsoft Word. Spatial poems still need an explicit wide-page/positioning policy; the current indentation is bounded to keep text on the page. Plain TXT is readable but does not preserve prose-paragraph semantics on reimport. |
| Lyrics | [ChordPro specification](https://www.chordpro.org/chordpro/directives-env/) | Song sections, chords, tab/grid, transpose; ChordPro import/export | Round-trip a corpus containing section environments, directives, chords, tabs, and grids through an independent ChordPro processor. Document the supported subset; do not promise arbitrary directives work until verified. |
| Screenplay | [Academy Nicholl format guide](https://www.oscars.org/nicholl/screenwriting-resources) and [entry rules](https://www.oscars.org/nicholl/about) | Screenplay element vocabulary; Courier PDF; FDX import/export | Product branding and an invented terminal `FADE OUT.` were removed from the PDF in this audit. Review title page, page count, widow/orphan and dialogue splitting, and anonymous-submission profile. FDX importer drops unknown paragraph types and inline styles; round-trip representative Final Draft files. |
| Comic script | [Dark Horse script guide](https://images.darkhorse.com/darkhorse08/company/submissions/scriptguide.pdf); [Image Comics submission rules](https://imagecomics.com/submissions) | Pages, panels, dialogue, captions, SFX; PDF/DOCX | Verify publisher-specific numbering, script headers, and balloon ordering. A finished comic script is not an Image Comics proposal: that publisher asks for a cover letter, synopsis, sample art, and cover mock-up. Keep proposal packaging distinct from script export. |
| Interactive fiction | [IFTF Twee 3 specification](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md) | Passage graph, variables, play state, Twee import/export | Validate emitted Twee with an independent compiler. Current exporter uses a `Start` **tag** to identify the starting passage; the specification defines `StoryData.start` and a special passage named `Start`, not a start tag. Header tag names containing spaces are also outside the specified tag grammar. |
| Tabletop RPG | Destination-specific publishing rules, e.g. [Dungeon Masters Guild creator guidance](https://help.dmsguild.com/hc/en-us/categories/12776810252951) | Structured rules, stat blocks, tables; Markdown/TXT | Choose a target before claiming publication readiness. Presently no formatted PDF/DOCX output in the editor. Check table readability, links, and print/digital layouts against that target. |
| Vault notes | [CommonMark](https://spec.commonmark.org/) for plain Markdown, plus explicit Inkwell wiki-link extension | Markdown editor, local files, links, backlinks | Keep Markdown portable and document extension behavior. Use fixture files to check that save/reopen leaves source unchanged and links resolve consistently. This is a note format rather than a publisher submission format. |

## Priority and verification

1. **Submission correctness:** define screenplay author/anonymous profiles; verify large and spatial poetry layouts; make prose manuscript profiles configurable. Use rendered PDF/DOCX fixtures, not archive signature checks alone.
2. **Interchange conformance:** validate EPUB with EPUBCheck; compile and reimport representative Twee with an independent tool; round-trip ChordPro and FDX with external applications. Record known unsupported features instead of silently dropping them.
3. **Workflow completeness:** refine spatial-poetry support if those writers are in scope; add a publisher-specific comic proposal workflow and RPG output only for named destinations.
4. **Architecture:** keep the current family split, reduce duplicated orchestration only when a shared behavior has stable tests, and make per-format capabilities discoverable in the UI.

The pass condition for each format is a reproducible fixture covering edit, save/reopen, export, independent validation or opening, and reimport where applicable. This audit does not mark any family fully conformant yet.
