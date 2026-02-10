import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectSettings,
  loader: async () => {
    // TODO: Load project for settings/editing
    return { project: null };
  },
});

function ProjectSettings() {
  // TODO: Implement project settings page
  return null;
}
