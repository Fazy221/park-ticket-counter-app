// RFC 4122 v4 UUID, generated locally without pulling in a crypto package.
// This only has to be unique per scan attempt - it's an idempotency key,
// not a security token - so Math.random()'s collision odds are more than
// good enough here, and it avoids adding expo-crypto as a dependency just
// for this one call site.
export function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
