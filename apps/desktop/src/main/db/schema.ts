import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  claudeSessionId: text('claude_session_id'),
  projectPath: text('project_path').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed', 'cancelled'] }).notNull(),
  linkedTicketId: text('linked_ticket_id'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  createdAt: integer('created_at').default(sql`(unixepoch() * 1000)`),
});

export const sessionEvents = sqliteTable('session_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  ts: integer('ts').notNull(),
  kind: text('kind').notNull(),
  agentId: text('agent_id'),
  parentAgentId: text('parent_agent_id'),
  toolName: text('tool_name'),
  payloadJson: text('payload_json'),
});

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  bodyMd: text('body_md'),
  status: text('status', { enum: ['todo', 'in_progress', 'review', 'done', 'cancelled'] })
    .notNull()
    .default('todo'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] })
    .notNull()
    .default('medium'),
  sprintId: text('sprint_id'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const sprints = sqliteTable('sprints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal'),
  startAt: integer('start_at').notNull(),
  endAt: integer('end_at').notNull(),
});

export const ticketSessions = sqliteTable('ticket_sessions', {
  ticketId: text('ticket_id').notNull(),
  sessionId: text('session_id').notNull(),
  linkedAt: integer('linked_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  graphJson: text('graph_json').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  sessionId: text('session_id'),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull().default(sql`(unixepoch() * 1000)`),
  endedAt: integer('ended_at'),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const recentProjects = sqliteTable('recent_projects', {
  path: text('path').primaryKey(),
  name: text('name').notNull(),
  openedAt: integer('opened_at').notNull().default(sql`(unixepoch() * 1000)`),
});
