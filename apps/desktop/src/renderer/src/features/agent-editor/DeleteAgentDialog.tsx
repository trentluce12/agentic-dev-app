import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

export interface DeleteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  agentName: string;
}

export function DeleteAgentDialog({
  open,
  onOpenChange,
  projectPath,
  agentName,
}: DeleteAgentDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await window.api.agents.delete(projectPath, agentName);
      queryClient.removeQueries({ queryKey: ['agents', projectPath, agentName] });
      await queryClient.invalidateQueries({ queryKey: ['agents', projectPath] });
      onOpenChange(false);
      navigate({ to: '/agents', search: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const relativePath = `.claude/agents/${agentName}.md`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete agent?</DialogTitle>
          <DialogDescription>
            This permanently removes <span className="font-mono">{agentName}</span> from disk.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          {relativePath}
        </div>
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
