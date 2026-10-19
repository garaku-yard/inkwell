# Interactive Fiction runtime contract

Inkwell Interactive Fiction projects use a deliberately small, deterministic
dialect. The editor, Play view, diagnostics, and SugarCube Twee exporter all use
the same parser and evaluator in `client/lib/interactive-fiction/runtime.ts`.

## Values and variables

Runtime values are strings, numbers, or booleans. Variable names begin with a
letter or underscore and contain letters, digits, or underscores. The Story
tools dialog declares initial values and types before the Start passage runs.
Character profiles remain reference material and never become runtime state.
Text literals must use single or double quotes.

Assignments use:

```text
{set $has_key:boolean to true}
{set $gold:number to 10}
{set $mood:string to "uneasy"}
{set $copy to $gold}
```

The type annotation is optional. If a variable was declared in Story tools,
assignments must preserve its type.

## Conditions

Expressions support variable references, literals, parentheses, numeric
`+`, `-`, `*`, `/`, string `+`, `not`, `and`, `or`, and `==`, `!=`, `<`,
`<=`, `>`, `>=` comparisons:

```text
{if $has_key and $gold >= 10: [[Open the vault -> Vault]] else: [[Go back -> Hall]]}
```

The false branch is optional. Undefined variables and invalid syntax stop that
element and appear in Play plus Story tools diagnostics; they never silently
select a branch.

## Named event triggers

A Trigger block gives a passage a stable event name and an ordered list of
actions. Event names begin with a letter and may contain letters, numbers,
dot, colon, dash, or underscore. Actions can reveal writing, apply the same
`{set ...}` statements as passage entry, or evaluate the same `{if ...}`
conditions. Play lists the active passage's events explicitly; firing one runs
its actions in order against the current variable state. Triggers fire once by
default and can be marked repeatable.

Plain prose beginning with `TRIGGER —` remains prose. Diagnostics flag it and
the editor offers an explicit conversion so planning copy is never mistaken
for executable logic. Conversion preserves the note and creates an empty
action for the writer to finish; it does not guess which following paragraphs
belong to the event.

## Links and passages

Links use `[[Passage]]`, `[[Visible label -> Passage]]`, or
`[[Passage|tooltip]]`. Passage names match case-insensitively. Renaming a
passage rewrites exact link targets across the project while preserving labels.
Story tools selects the Start passage and stores passage tags, colors, typed
initial variables, and named test states in scene metadata so they survive
local storage, cloud sync, and `.iw` archives.

## Twee 3 / SugarCube

Export targets Twee 3 with SugarCube 2.36.1. Assignments compile to `<<set>>`
and conditionals to `<<if>>` / `<<else>>`. Once-only Trigger blocks compile to
`<<linkreplace>>`; repeatable triggers use `<<link>>` with `<<append>>`, so the
exported story keeps an actionable preview. Each also carries an ignored
encoded marker for lossless Inkwell re-import. Initial variables compile into
`StoryInit`; the selected
start passage receives the `Start` tag. Passage tags and Inkwell colors are
emitted in the header. IFIDs are stable for a project, so identical project
state produces identical source and repeatable tests.
