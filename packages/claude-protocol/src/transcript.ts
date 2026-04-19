/**
 * Transcript file schema (`~/.claude/projects/<slug>/<session>/transcript.jsonl`).
 *
 * One JSON object per line. Shape largely overlaps with stream-json but the
 * persisted form is normalized (no partial deltas).
 */

import type { ContentBlock } from './stream-json.ts';

export interface TranscriptUserEntry {
  type: 'user';
  role: 'user';
  content: string | ContentBlock[];
  timestamp: string;
}

export interface TranscriptAssistantEntry {
  type: 'assistant';
  role: 'assistant';
  content: ContentBlock[];
  timestamp: string;
  model?: string;
  stop_reason?: string | null;
}

export interface TranscriptToolResultEntry {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  timestamp: string;
  is_error?: boolean;
}

export interface TranscriptSystemEntry {
  type: 'system';
  subtype: string;
  timestamp: string;
  [key: string]: unknown;
}

export type TranscriptEntry =
  | TranscriptUserEntry
  | TranscriptAssistantEntry
  | TranscriptToolResultEntry
  | TranscriptSystemEntry;
