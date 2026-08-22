import { randomUUID } from "node:crypto";
import type { AirwallexRequestIds, InvoiceDraft } from "../types.js";

const TTL_MS = 60 * 60 * 1000;
const drafts = new Map<string, InvoiceDraft>();

export function threadKey(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

function sweep(): void {
  const now = Date.now();
  for (const [key, draft] of drafts) {
    if (now - draft.updatedAt > TTL_MS) {
      drafts.delete(key);
    }
  }
}

function newRequestIds(): AirwallexRequestIds {
  return {
    customer: randomUUID(),
    invoice: randomUUID(),
    lineItems: randomUUID(),
    finalize: randomUUID(),
  };
}

export function getDraft(channel: string, threadTs: string): InvoiceDraft | undefined {
  sweep();
  return drafts.get(threadKey(channel, threadTs));
}

export function getDraftById(draftId: string): InvoiceDraft | undefined {
  sweep();
  for (const draft of drafts.values()) {
    if (draft.draftId === draftId) return draft;
  }
  return undefined;
}

export function upsertDraft(
  partial: Omit<InvoiceDraft, "draftId" | "requestIds" | "updatedAt"> & {
    draftId?: string;
    requestIds?: AirwallexRequestIds;
  },
): InvoiceDraft {
  sweep();
  const key = threadKey(partial.channel, partial.threadTs);
  const existing = drafts.get(key);
  const draft: InvoiceDraft = {
    ...partial,
    draftId: partial.draftId ?? existing?.draftId ?? randomUUID(),
    requestIds: partial.requestIds ?? existing?.requestIds ?? newRequestIds(),
    updatedAt: Date.now(),
  };
  drafts.set(key, draft);
  return draft;
}

export function saveDraft(draft: InvoiceDraft): InvoiceDraft {
  const next = { ...draft, updatedAt: Date.now() };
  drafts.set(threadKey(draft.channel, draft.threadTs), next);
  return next;
}

export function deleteDraft(channel: string, threadTs: string): void {
  drafts.delete(threadKey(channel, threadTs));
}
