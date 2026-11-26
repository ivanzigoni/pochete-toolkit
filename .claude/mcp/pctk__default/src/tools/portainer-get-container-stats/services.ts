export function requireRegisteredServiceIn(registry: readonly string[], service: string): string {
  if (!registry.includes(service)) {
    throw new Error(
      `unknown service "${service}" — registered services: ${registry.join(', ')} (see config.json)`,
    );
  }
  return service;
}
