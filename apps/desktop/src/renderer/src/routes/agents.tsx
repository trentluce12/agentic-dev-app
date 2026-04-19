import { AgentEditorPage } from '@/features/agent-editor/AgentEditorPage.tsx';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const agentsSearchSchema = z.object({ name: z.string().optional() });

export const Route = createFileRoute('/agents')({
  validateSearch: (search) => agentsSearchSchema.parse(search),
  component: AgentsRoute,
});

function AgentsRoute() {
  return <AgentEditorPage />;
}
