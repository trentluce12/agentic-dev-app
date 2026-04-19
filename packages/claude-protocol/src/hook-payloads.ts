/**
 * Payload shapes for Claude Code hook events. All share the base envelope
 * (session_id, transcript_path, cwd, permission_mode, hook_event_name) plus
 * event-specific fields.
 */

export interface HookEnvelope {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  hook_event_name: string;
}

export interface SessionStartPayload extends HookEnvelope {
  hook_event_name: 'SessionStart';
  source?: 'new' | 'resume' | 'continue';
  model?: string;
  agent_type?: string;
}

export interface UserPromptSubmitPayload extends HookEnvelope {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface PreToolUsePayload extends HookEnvelope {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUsePayload extends HookEnvelope {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

export interface PostToolUseFailurePayload extends HookEnvelope {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  error: string;
  is_interrupt?: boolean;
}

export interface PermissionRequestPayload extends HookEnvelope {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface SubagentStartPayload extends HookEnvelope {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type: string;
  parent_agent_id?: string;
}

export interface SubagentStopPayload extends HookEnvelope {
  hook_event_name: 'SubagentStop';
  agent_id: string;
  last_assistant_message?: string;
}

export interface StopPayload extends HookEnvelope {
  hook_event_name: 'Stop';
}

export interface NotificationPayload extends HookEnvelope {
  hook_event_name: 'Notification';
  message: string;
  title?: string;
}

export type HookPayload =
  | SessionStartPayload
  | UserPromptSubmitPayload
  | PreToolUsePayload
  | PostToolUsePayload
  | PostToolUseFailurePayload
  | PermissionRequestPayload
  | SubagentStartPayload
  | SubagentStopPayload
  | StopPayload
  | NotificationPayload;
