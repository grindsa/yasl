import { join, resolve } from "node:path";

/** Shared data root (YAML lists, archive, push state). */
export function dataRoot(): string {
  const override = process.env.DATA_DIR?.trim();
  if (override) return resolve(/*turbopackIgnore: true*/ override);
  return join(process.cwd(), "data");
}

export function groupDataDir(groupId: string): string {
  return join(dataRoot(), "groups", groupId);
}
