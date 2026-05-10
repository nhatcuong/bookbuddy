export type NoteBlock =
  | { type: 'thought'; text: string }
  | { type: 'quote'; text: string; location: string | null };

/**
 * Temporary helper for screens that don't yet have a proper block renderer.
 * Joins all block texts with blank lines between them.
 */
export function flattenBlocks(blocks: NoteBlock[]): string {
  return blocks.map(b => b.text).join('\n\n');
}
