import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 px-8 py-5">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Per-project <code className="font-mono">.claude/settings.json</code> editor and app
          preferences.
        </p>
      </header>
    </div>
  );
}
