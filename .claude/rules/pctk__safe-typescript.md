---
paths:
  - "**/*.{ts,tsx}"
---

# TypeScript seguro

TypeScript's types are a compile-time promise with no runtime enforcement — they're erased
before your code ever executes, so they catch a shape mismatch you wrote yourself and catch
nothing about a value that arrived from outside your code. This convention is the discipline that
keeps that gap from becoming a production incident, stated as guidelines rather than enforced
rules. What it does state is a posture:
**wherever safety and convenience pull in different directions, safety wins**, even at the cost
of a stricter signature, an extra runtime check, or a slower path to green.

Treat every `.ts`/`.tsx` file this convention touches as code that runs unattended, against inputs and
callers you don't fully control. A type annotation is not a guarantee about anything that crossed
a process boundary to get there — a database column nullable in reality but not in the type, a
JSON body that merely claims to match a DTO, a third-party response shaped however that API
actually feels like shaping it today. This is the project-agnostic floor: formatting, naming, and
any project- or framework-specific convention belong to other conventions layered on top of this one.

## Boundary

A type is a claim about shape, not a check that the shape is real. The compiler enforces it only
against code you wrote; anything that crossed a process boundary to reach you — an HTTP body, a
queue message, a third-party API response, a database read — is untrusted data wearing a type
annotation, not verified data. Validate it at the boundary with an actual runtime check or schema
validator before treating it as the type says it is; a DTO typed `{ amount: number }` is not a
`number` until something checks it at runtime, because TypeScript's types don't survive
compilation. This holds even when the value merely passed through JSON.parse or an ORM — parsing
succeeded is not the same claim as shape is trustworthy. And because TypeScript compiles to
JavaScript, every JavaScript-level trust violation still applies here too: never evaluate
untrusted text as code, never mutate a built-in prototype from data you don't control, and treat
`with` as removed from the language.

## Vouching

`any`, a type assertion (`as T`), and a non-null assertion (`!`) all do the same thing: they tell
the compiler to stop checking and trust you instead, and none of the three leaves a runtime trace
behind if you were wrong — the program doesn't error at the assertion, it corrupts state or throws
somewhere later and harder to trace back. Treat all three as a last resort, not a convenience for
getting past a red squiggle. When a shape is genuinely unknown until runtime, reach for `unknown`
and narrow it with a real type guard rather than `any`; when a value could plausibly be `null` or
`undefined`, write the check (`if (x == null) throw ...`) rather than asserting it away with `!`.
A file leaning on `any`/`as`/`!` in more than one or two well-justified spots is a sign the
underlying data shape was never actually modeled, not a normal texture of TypeScript code. Prefer
a specific, narrow type over a wide one wherever the value's actual range of legal states is
known — a union of literal strings over a bare `string`, a discriminated union over a boolean
flag — because a wider type is a wider set of "vouched for but never checked" possibilities.

## Strict by default

Write every file as if the strictest compiler settings were already on, regardless of what the
project's current `tsconfig.json` actually enforces — explicit parameter and return types where
inference doesn't already supply one, explicit handling of `null`/`undefined`, no silent `any`
from an unannotated parameter. A looser config that happens to compile today is not a guarantee it
stays that way, and code written to the stricter bar keeps working when it tightens. Every promise
crossing a function or module boundary has its rejection handled — a floating promise is a silent
failure whether or not the linter is currently configured to block it.

`async`/`await` is the default for handling a promise, with rejections caught in `try`/`catch`
around the `await` — not `.then()`/`.catch()`. Reach for `.then()`/`.catch()` only when there's a
concrete reason `async`/`await` can't express the same logic — parallel fan-out over a dynamic
list of promises feeding `Promise.all`, a fluent chain built for its own sake doesn't count — and
say what that reason is at the call site (a comment or the surrounding code should make it
obvious why this one spot isn't `await`ed), since a `.then()`/`.catch()` with no stated reason
reads as the default having been skipped rather than a deliberate exception to it.

## Loud failure

An error that happens and isn't surfaced didn't stop happening — it just stopped being visible to
whoever could have fixed it. Throw real `Error` objects (or a typed subclass) inside `try`/`catch`
rather than returning a sentinel value or swallowing the failure, so a caller can't mistake "it
failed" for "it succeeded with a weird result." Prefer `Promise`/`async`-`await` over raw callbacks
for anything asynchronous, since a callback gives failure no obvious channel to travel back
through. When a check can't be completed — a validation call times out, a config value is
missing — the default behavior denies or degrades, it doesn't silently proceed as if the check had
passed.
