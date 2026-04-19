import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useState } from 'react';

export interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  onKeepMine: () => void;
  onLoadDisk: () => void;
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  agentName,
  onKeepMine,
  onLoadDisk,
}: ConflictResolutionDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleKeepMine = () => {
    setConfirmDiscard(false);
    onKeepMine();
    onOpenChange(false);
  };

  const handleLoadDiskClick = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    onLoadDisk();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmDiscard(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>External change detected</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{agentName}</span> changed on disk while you have unsaved
            edits. Choose how to proceed.
          </DialogDescription>
        </DialogHeader>

        {confirmDiscard && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Loading the disk version will discard your in-memory edits. Click "Load disk version"
            again to confirm.
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={handleKeepMine}>
            Keep my changes
          </Button>
          <Button type="button" variant="destructive" onClick={handleLoadDiskClick}>
            {confirmDiscard ? 'Confirm load disk version' : 'Load disk version'}
          </Button>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button type="button" variant="outline" disabled>
                    Open in external diff
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>External diff view — coming in a later release.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
