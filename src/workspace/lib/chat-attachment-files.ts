/**
 * Which files the chat accepts, kept free of imports so it is testable on its
 * own. The library holds stills and clips; both are attachable, and anything
 * else is refused by name instead of silently dropping out of the turn.
 */
export type ChatUploadState = 'uploading' | 'failed' | 'unsupported'

export function splitChatImageFiles<T extends { type: string }>(
  files: readonly T[],
): { supported: T[]; unsupported: T[] } {
  const attached = (type: string) => type.startsWith('image/') || type.startsWith('video/')
  return {
    supported: files.filter((file) => attached(file.type)),
    unsupported: files.filter((file) => !attached(file.type)),
  }
}

export function remainingChatAttachmentSlots(readyCount: number, uploadingCount: number): number {
  return Math.max(0, 12 - readyCount - uploadingCount)
}

export function canSendChatAttachments(
  hasText: boolean,
  readyCount: number,
  pendingStates: readonly ChatUploadState[],
): boolean {
  return pendingStates.length === 0 && (hasText || readyCount > 0)
}
