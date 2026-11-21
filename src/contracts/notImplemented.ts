/**
 * Owner: Shared (Step 0)
 * Purpose: stubs throw NotImplementedError until their owner implements them; golden tests skip those.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented yet: ${what}`);
    this.name = "NotImplementedError";
  }
}
export function todo(what: string): never {
  throw new NotImplementedError(what);
}
