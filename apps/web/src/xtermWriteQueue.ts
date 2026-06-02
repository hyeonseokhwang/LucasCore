export type TerminalWriteKind = "replay" | "output" | "system";

export type TerminalWriteItem = {
  data: string;
  kind: TerminalWriteKind;
  stickToBottom: boolean;
  onDrained?: () => void;
};

export const XTERM_WRITE_CHUNK_BYTES = 4096;
export const XTERM_MAX_QUEUED_BYTES = 128 * 1024;

export function chunkTerminalWrite(data: string, chunkBytes = XTERM_WRITE_CHUNK_BYTES) {
  if (!data || chunkBytes <= 0) return [];

  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += chunkBytes) {
    chunks.push(data.slice(offset, offset + chunkBytes));
  }
  return chunks;
}

export function enqueueTerminalWriteItems(
  queue: TerminalWriteItem[],
  queuedBytes: number,
  data: string,
  options: { kind: TerminalWriteKind; stickToBottom?: boolean; onDrained?: () => void },
  limits: { chunkBytes?: number; maxQueuedBytes?: number } = {}
) {
  const nextQueue = [...queue];
  const chunkBytes = limits.chunkBytes ?? XTERM_WRITE_CHUNK_BYTES;
  const maxQueuedBytes = limits.maxQueuedBytes ?? XTERM_MAX_QUEUED_BYTES;
  const chunks = chunkTerminalWrite(data, chunkBytes);
  let nextQueuedBytes = queuedBytes;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    nextQueuedBytes += chunk.length;
    nextQueue.push({
      data: chunk,
      kind: options.kind,
      stickToBottom: options.stickToBottom ?? false,
      onDrained: index === chunks.length - 1 ? options.onDrained : undefined
    });
  }

  const dropped: TerminalWriteItem[] = [];
  while (nextQueuedBytes > maxQueuedBytes && nextQueue.length > 1) {
    const removed = nextQueue.shift();
    if (!removed) break;
    nextQueuedBytes -= removed.data.length;
    dropped.push(removed);
  }

  return {
    queue: nextQueue,
    queuedBytes: nextQueuedBytes,
    dropped
  };
}

export function shiftTerminalWriteItem(queue: TerminalWriteItem[], queuedBytes: number) {
  const [item, ...rest] = queue;
  if (!item) {
    return {
      item: undefined,
      queue,
      queuedBytes
    };
  }

  return {
    item,
    queue: rest,
    queuedBytes: Math.max(0, queuedBytes - item.data.length)
  };
}
