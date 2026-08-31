---
paths:
  - "**/*.{js,jsx,mjs,cjs}"
  - "**/*.{ts,tsx}"
---

# JavaScript seguro

JavaScript ships to production with no compiler catching your mistakes and no runtime
sandbox limiting the blast radius unless you build both out of discipline. This convention is
that discipline, stated as guidelines rather than enforced rules. What it does state is a
posture: **wherever safety and convenience pull in different directions, safety wins**,
even at the cost of terser code, a familiar pattern, or a faster path to done.

Treat every piece of JavaScript this convention touches as code that runs unattended, against
inputs and callers you don't fully control — a build script reading `argv`, a Node
service parsing a request body, a browser script rendering a value a user typed. That
holds whether the code is five lines or five thousand, and regardless of framework. This
is the project-agnostic floor: formatting, naming, and any project- or framework-specific
rule belong to other conventions layered on top of this one, not to this one.

## Boundary

Every value that enters from outside code you wrote and control — URL and query
parameters, request bodies, form inputs, file contents, environment variables,
third-party API responses, `postMessage` events — is untrusted until it's been validated
for the boundary it just crossed and encoded for the context it's about to enter.
Validate at the point of entry; encode at the point of use, and encode for *where the
value lands* (HTML body, HTML attribute, URL, JS string, CSS, a SQL/NoSQL query) rather
than once, generically.

Never build a query or a JSON payload by concatenating untrusted input into a string —
parameterize the query, use `JSON.parse` to read structured data instead of `eval`, and
construct objects instead of stitching text. Never let untrusted text reach a function
that evaluates strings as code — `eval`, `new Function`, a string-argument
`setTimeout`/`setInterval`, `document.write` — these compile data into behavior and
defeat any Content Security Policy meant to stop exactly that. Client-side checks are UX,
never a security boundary: anything enforced only in the browser can be replayed with a
modified value before it reaches you, so every check that exists for security reasons —
not usability — gets re-run server-side, unconditionally. When HTML must come from a
user, sanitize it with a dedicated, actively maintained sanitizer; never hand-roll a
blocklist of dangerous substrings.

## Closed by default

Configuration and defaults start locked down and get opened deliberately — never the
reverse. A cookie carrying anything sensitive gets `httpOnly` (no script access),
`secure` (HTTPS only), and `sameSite=strict`/`lax` (CSRF containment) unless there's a
specific, documented reason to drop one. All network communication runs over TLS;
plaintext HTTP is an active interception risk, not a performance shortcut. A Content
Security Policy that actually restricts inline scripts, the `eval` family, and
third-party origins beats no policy, even an imperfect one. An external script or style
loaded from a CDN gets a subresource-integrity hash pinned to it — an unpinned third-party
resource is a supply-chain backdoor with a friendly UI. Cross-window communication uses
`postMessage` with an explicit `targetOrigin` (never `*`), and the receiver verifies
`event.origin` before trusting anything in the message. Anything cryptographic — hashing,
tokens, randomness that must be unpredictable — uses a vetted, current primitive from a
maintained library; never a hand-rolled algorithm, and never `Math.random()` where
unpredictability actually matters.

## Least privilege

Grant and check access at the narrowest point capable of enforcing it, and re-verify
server-side even when a client already gated the UI for it. Session and auth state get
validated on every request that needs them, not cached as "already checked" from an
earlier step in the same flow. Guard any object built from external input — a merge, a
recursive clone, a `JSON.parse`'d payload written onto existing state — against prototype
pollution: build dictionaries with `Object.create(null)` or `Map`, never an unvetted
recursive merge that can reach `__proto__`/`constructor`/`prototype`. Code you don't fully
trust — a plugin, a user-supplied script, a third-party widget — runs isolated from your
own privileges: a Worker, an iframe with a restrictive `sandbox` attribute, a `vm`
context, not the same execution environment as everything else.

## Supply chain

Every dependency is code that runs in your process with your privileges, so it earns the
same scrutiny as code you'd write yourself: is it actively maintained, does it carry
known unpatched vulnerabilities, is its name a plausible typosquat of something more
popular. Fewer, well-known, actively maintained dependencies beat a sprawl of small
packages, each one an additional point of failure and an expansion of what you're
implicitly trusting. Dependency and vulnerability scanning runs in CI, not only on a
developer's machine before a commit — a check that sometimes runs is a check you can't
rely on. Anything interpreted at runtime that isn't part of your own source tree — a
downloaded script, a dynamically fetched module, a config file evaluated as code — gets
its integrity pinned or verified before it runs.

## Loud failure

An error that happens and isn't surfaced didn't stop happening — it just stopped being
visible to whoever could have fixed it. Prefer strict mode and code that throws or
rejects over code that silently continues on bad state. Every promise crossing a function
or module boundary has its rejection handled — an awaited call inside `try`/`catch`, an
explicit `.catch()`, or a deliberate return to a caller that will handle it — because an
unhandled rejection is a silent failure in Node and a console-only whisper in the
browser. Log enough to reconstruct what happened, but never log secrets, tokens, full
request bodies, or anything else that turns the log stream into a second copy of the data
you're trying to protect. When a check can't be completed — a validation call times out,
a config value is missing — the default behavior denies or degrades, it doesn't silently
allow.

## Boring code

Prefer the obvious, slightly verbose implementation over the clever one: every layer of
cleverness is a layer a future reader — human or agent — has to see through before they
can tell whether it's safe. Optimize the parts measured to matter, not the parts that
look slow; a micro-optimization that costs readability is a bad trade almost every time,
and a premature one is a bet placed before you know you need it. Anything that acquires a
resource — an event listener, a timer, a subscription, an open connection — releases it
on every exit path, including the error path; unbind before rebinding rather than
stacking handlers. Where operations can run concurrently against shared state, treat the
interleaving as adversarial — a read-then-write is not atomic just because it looks like
one line of code.
