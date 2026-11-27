/**
 * The owner's note on one picture. Kept free of imports so the rules are
 * testable on their own: what counts as a change, what is too long, and what a
 * save sends. The bridge saves it against the exact revision the note was read
 * at, so two tabs cannot silently overwrite each other.
 */

export const OWNER_NOTE_LIMIT = 2_000

export type OwnerNoteDraft = {
  mediaId: string | number
  /** The note as it is on the server. */
  saved: string
  /** The note as it is in the box. */
  draft: string
  /** The exact media revision the saved note was read at. */
  expectedHash: string
}

export type OwnerNoteRequest = {
  mediaId: string | number
  note: string
  expectedHash: string
}

/** Longer notes are cut, never rejected: losing what the owner typed is worse. */
export const normalizeOwnerNote = (value: unknown): string =>
  String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, OWNER_NOTE_LIMIT)

/** A note is only saved when it actually differs from what is on the server. */
export const ownerNoteChanged = (draft: OwnerNoteDraft): boolean =>
  normalizeOwnerNote(draft.draft) !== normalizeOwnerNote(draft.saved)

/**
 * The save to send, or null when there is nothing to send. An empty box is a
 * real change: it clears a note the owner no longer wants.
 */
export const ownerNoteRequest = (draft: OwnerNoteDraft): OwnerNoteRequest | null => {
  if (!ownerNoteChanged(draft)) return null
  const hash = String(draft.expectedHash || '').trim()
  if (!/^sha256:[0-9a-f]{64}$/.test(hash)) return null
  return {
    mediaId: draft.mediaId,
    note: normalizeOwnerNote(draft.draft),
    // The save is against the revision the box was loaded from, not the one
    // returned by the last save, so a note cannot land on unseen content.
    expectedHash: hash,
  }
}
