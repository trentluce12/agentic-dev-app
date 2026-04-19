import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { agentNameSchema } from '@agentic-dev-app/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const newAgentFormSchema = z.object({
  name: agentNameSchema,
  description: z.string().min(1, 'description is required'),
  tier: z.enum(['orchestrator', 'lead', 'implementer']).optional(),
});

type NewAgentFormValues = z.infer<typeof newAgentFormSchema>;

export interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
}

const TIER_NONE = '__none';

export function NewAgentDialog({ open, onOpenChange, projectPath }: NewAgentDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<NewAgentFormValues>({
    resolver: zodResolver(newAgentFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onSubmit = async (values: NewAgentFormValues) => {
    setSubmitError(null);
    try {
      const frontmatter = {
        name: values.name,
        description: values.description,
        ...(values.tier !== undefined && { 'x-tier': values.tier }),
      };
      await window.api.agents.create(projectPath, values.name, frontmatter, '');
      await queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
      form.reset();
      onOpenChange(false);
      navigate({ to: '/agents', search: { name: values.name } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('agent already exists')) {
        form.setError('name', { type: 'manual', message: 'An agent with this name already exists.' });
      } else {
        setSubmitError(message);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          setSubmitError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-agent-name">Name</Label>
            <Input
              id="new-agent-name"
              placeholder="my-new-agent"
              autoComplete="off"
              spellCheck={false}
              {...form.register('name')}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, and hyphens. Must start alphanumeric.
            </p>
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-agent-description">Description</Label>
            <Textarea
              id="new-agent-description"
              placeholder="What does this agent do?"
              rows={3}
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-agent-tier">Tier (optional)</Label>
            <Controller
              control={form.control}
              name="tier"
              render={({ field }) => (
                <Select
                  value={field.value ?? TIER_NONE}
                  onValueChange={(v) => {
                    field.onChange(v === TIER_NONE ? undefined : v);
                  }}
                >
                  <SelectTrigger id="new-agent-tier">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TIER_NONE}>(no tier)</SelectItem>
                    <SelectItem value="orchestrator">Orchestrator</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="implementer">Implementer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {submitError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Create agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
