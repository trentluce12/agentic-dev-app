/**
 * Event shapes emitted by `claude -p --output-format stream-json --include-partial-messages`.
 *
 * The CLI emits newline-delimited JSON; each line is a complete event object.
 * These types cover the common surface — unknown event types should be treated
 * as opaque `UnknownStreamEvent` rather than errors (forward-compat).
 */

export interface StreamEventBase {
  type: string;
  session_id?: string;
}

export interface SystemInitEvent extends StreamEventBase {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model?: string;
  plugins?: unknown[];
  cwd?: string;
}

export interface SystemCompactEvent extends StreamEventBase {
  type: 'system';
  subtype: 'compact_boundary';
  compactMetadata?: Record<string, unknown>;
}

export interface SystemApiRetryEvent extends StreamEventBase {
  type: 'system';
  subtype: 'api_retry';
  attempt: number;
  max_retries: number;
}

export type SystemEvent = SystemInitEvent | SystemCompactEvent | SystemApiRetryEvent;

export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface InputJsonDelta {
  type: 'input_json_delta';
  partial_json: string;
}

export type ContentDelta = TextDelta | InputJsonDelta;

export interface StreamContentEvent extends StreamEventBase {
  type: 'stream_event';
  event: {
    type:
      | 'message_start'
      | 'content_block_start'
      | 'content_block_delta'
      | 'content_block_stop'
      | 'message_delta'
      | 'message_stop';
    index?: number;
    content_block?: ContentBlock;
    delta?: ContentDelta;
  };
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface AssistantMessageEvent extends StreamEventBase {
  type: 'assistant';
  message: {
    id: string;
    role: 'assistant';
    content: ContentBlock[];
    model?: string;
    stop_reason?: string | null;
  };
}

export interface UserMessageEvent extends StreamEventBase {
  type: 'user';
  message: {
    role: 'user';
    content: string | ContentBlock[];
  };
}

export interface ResultEvent extends StreamEventBase {
  type: 'result';
  subtype?: string;
  is_error?: boolean;
  session_id: string;
  result?: string;
  total_cost_usd?: number;
  usage?: Record<string, number>;
  num_turns?: number;
}

export interface UnknownStreamEvent extends StreamEventBase {
  type: string;
  [key: string]: unknown;
}

export type StreamEvent =
  | SystemEvent
  | StreamContentEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | ResultEvent
  | UnknownStreamEvent;

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}
