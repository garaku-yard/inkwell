# 0011 — Identity Model B: `(username, user_tag)` is unique, not username

**Status:** Accepted

## Context

Globally-unique usernames force name-squatting and a poor sign-up experience —
every good handle is taken, and users get pushed into `john_writer_2847`.

## Decision

Adopt **Model B**: the **`(username, user_tag)` pair** is unique, not the username
alone — a Discord-style `username#tag` scheme. Many users can share the display
name `john`; the tag disambiguates. `Register` drops the username-exists check and
retries tag generation on collision. `GetUserByUsername` (now ambiguous) was
removed; `ErrUserTagTaken` was added. Identity migration `000003` swaps the
constraint.

## Alternatives considered & why not

- **Globally-unique usernames.** Rejected: name-squatting and the ugly-suffix
  sign-up problem; a bad first impression for a writing tool that wants to feel
  personal.
- **Email-only identity (no handles).** Rejected: the product wants human-readable
  handles for collaboration and mentions (`@username#tag` invites), which email
  addresses don't provide cleanly.

## Consequences

- Invites and collaboration resolve on `@username#tag`, not bare username.
- The now-ambiguous `GetUserByUsername` lookup is gone; look-ups go by the pair or
  by email (`GetUserByEmail` exists for email-invite push).
- The new-project / invite UI surfaces the `username#tag` validation.
