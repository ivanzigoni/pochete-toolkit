/**
 * Validates a service name against one already-resolved environment's own `services` list (see
 * types.ts's RawPortainerEnvironment / ConfiguredPortainerEnvironment) — there is no tool-wide
 * service list to load here, since environments don't share configuration.
 */
export function requireRegisteredServiceIn(registry: readonly string[], service: string): string {
  if (!registry.includes(service)) {
    throw new Error(
      `unknown service "${service}" — registered services: ${registry.join(', ')} (see config.json)`,
    );
  }
  return service;
}
