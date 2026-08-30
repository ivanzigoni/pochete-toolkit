// Node module-customization-hooks loader: redirects bare `pg`/`mssql`/`undici` imports to the
// local fake implementations, for any process this loader is registered into. Registered via
// register-fake-drivers.mjs, itself loaded through NODE_OPTIONS="--import ..." so it applies to
// the real run.sh -> tsx -> src/index.ts server subprocess the bats/e2e-style tests spawn, without
// touching any production source file.

const FAKES = new Map([
  ['pg', new URL('./fake-pg.mjs', import.meta.url).href],
  ['mssql', new URL('./fake-mssql.mjs', import.meta.url).href],
  ['undici', new URL('./fake-undici.mjs', import.meta.url).href],
]);

export async function resolve(specifier, context, nextResolve) {
  const fake = FAKES.get(specifier);
  if (fake) {
    return { url: fake, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
