/**
 * Shared IPC channel names + request/response shapes.
 *
 * Imported by both main (for handlers) and renderer (for typed invoke).
 * Keep this file free of Node- or DOM-specific imports — only plain types.
 */

import type { HookPayload } from '@agentic-dev-app/claude-protocol';
import type { AgentFrontmatter, AgentValidationIssue, Settings } from '@agentic-dev-app/schemas';

export interface ProjectSummary {
  path: string;
  name: string;
  hasClaudeDir: boolean;
  agentCount: number;
  openedAt: number;
}

export interface AgentSummary {
  path: string;
  relativePath: string;
  name: string;
  description: string;
  tier?: 'orchestrator' | 'lead' | 'implementer';
  tools: string[];
  model?: string;
  hasIssues: boolean;
}

export interface AgentFile {
  path: string;
  relativePath: string;
  frontmatter: AgentFrontmatter;
  body: string;
  issues: AgentValidationIssue[];
  mtimeMs: number;
}

export interface SessionLaunchRequest {
  projectPath: string;
  prompt: string;
  agent?: string;
  allowedTools?: string[];
  permissionMode?: string;
}

export interface SessionSummary {
  id: string;
  claudeSessionId: string | null;
  projectPath: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  endedAt: number | null;
}

export type IpcChannel =
  | 'app:getVersion'
  | 'projects:open'
  | 'projects:recent'
  | 'projects:scan'
  | 'agents:list'
  | 'agents:read'
  | 'agents:write'
  | 'agents:delete'
  | 'settings:read'
  | 'settings:write'
  | 'commands:list'
  | 'commands:read'
  | 'commands:write'
  | 'sessions:launch'
  | 'sessions:cancel'
  | 'sessions:list';

export type IpcEvent =
  | { channel: 'session:event'; sessionId: string; payload: unknown }
  | { channel: 'session:status'; sessionId: string; status: SessionSummary['status'] }
  | { channel: 'hook:received'; sessionId: string; payload: HookPayload }
  | { channel: 'fs:agentChanged'; projectPath: string; agentPath: string }
  | { channel: 'fs:settingsChanged'; projectPath: string };

export interface IpcApi {
  app: {
    getVersion: () => Promise<string>;
  };
  projects: {
    open: () => Promise<ProjectSummary | null>;
    recent: () => Promise<ProjectSummary[]>;
    scan: (projectPath: string) => Promise<ProjectSummary>;
  };
  agents: {
    list: (projectPath: string) => Promise<AgentSummary[]>;
    read: (projectPath: string, agentName: string) => Promise<AgentFile>;
    write: (
      projectPath: string,
      agentName: string,
      file: Omit<AgentFile, 'issues' | 'mtimeMs'>,
    ) => Promise<AgentFile>;
    delete: (projectPath: string, agentName: string) => Promise<void>;
  };
  settings: {
    read: (projectPath: string) => Promise<Settings>;
    write: (projectPath: string, settings: Settings) => Promise<Settings>;
  };
  sessions: {
    launch: (req: SessionLaunchRequest) => Promise<SessionSummary>;
    cancel: (sessionId: string) => Promise<void>;
    list: (projectPath: string) => Promise<SessionSummary[]>;
  };
  onEvent: (listener: (event: IpcEvent) => void) => () => void;
}
