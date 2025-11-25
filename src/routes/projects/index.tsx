import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import { ProjectList } from '@/features/projects/components/project-list';
import { ProjectForm } from '@/features/projects/components/project-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/features/projects/stores/project-store';
import { useProjectActions } from '@/features/projects/hooks/use-project-actions';
import { useProjectsLoading, useProjectsError } from '@/features/projects/hooks/use-project-selectors';
import { cleanupBlobUrls } from '@/features/preview/utils/media-resolver';
import type { Project } from '@/types/project';
import type { ProjectFormData } from '@/features/projects/utils/validation';
import type { ImportProgress } from '@/features/project-bundle/types/bundle';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndex,
  // Clean up any media blob URLs when returning to projects page
  beforeLoad: () => {
    cleanupBlobUrls();
  },
  loader: async () => {
    // Load projects from IndexedDB into store
    const { loadProjects } = useProjectStore.getState();
    await loadProjects();
    return null;
  },
});

function ProjectsIndex() {
  const navigate = useNavigate();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const isLoading = useProjectsLoading();
  const error = useProjectsError();
  const { loadProjects, updateProject } = useProjectActions();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Handle import file selection
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input for next selection
    event.target.value = '';

    // Validate file extension
    if (!file.name.endsWith('.vedproj')) {
      setImportError('Please select a valid .vedproj file');
      setImportDialogOpen(true);
      return;
    }

    setImportError(null);
    setImportProgress({ percent: 0, stage: 'validating' });
    setImportDialogOpen(true);

    try {
      const { importProjectBundle } = await import(
        '@/features/project-bundle/services/bundle-import-service'
      );

      const result = await importProjectBundle(file, {}, (progress) => {
        setImportProgress(progress);
      });

      // Reload projects list
      await loadProjects();

      // Close dialog and navigate to the imported project
      setImportDialogOpen(false);
      setImportProgress(null);

      navigate({ to: '/editor/$projectId', params: { projectId: result.project.id } });
    } catch (err) {
      console.error('Import failed:', err);
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setImportProgress(null);
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
  };

  const handleEditSubmit = async (data: ProjectFormData) => {
    if (!editingProject) return;

    setIsSubmitting(true);
    try {
      await updateProject(editingProject.id, data);
      setEditingProject(null);
    } catch (error) {
      console.error('Failed to update project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="panel-header border-b border-border">
          <div className="max-w-[1920px] mx-auto px-6 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
                Projects
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your video editing projects
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" className="gap-2" onClick={handleImportClick}>
                <Upload className="w-4 h-4" />
                Import Project
              </Button>
              <Link to="/projects/new">
                <Button size="lg" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Project
                </Button>
              </Link>
            </div>

            {/* Hidden file input for import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".vedproj"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="max-w-[1920px] mx-auto px-6 py-4">
            <div className="panel-bg border border-destructive/50 rounded-lg p-4 text-destructive">
              <p className="font-medium">Error loading projects</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="max-w-[1920px] mx-auto px-6 py-16 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading projects...</p>
            </div>
          </div>
        ) : (
          /* Projects List */
          <div className="max-w-[1920px] mx-auto px-6 py-8">
            <ProjectList onEditProject={handleEditProject} />
          </div>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project Settings</DialogTitle>
          </DialogHeader>
          {editingProject && (
            <ProjectForm
              onSubmit={handleEditSubmit}
              defaultValues={{
                name: editingProject.name,
                description: editingProject.description,
                width: editingProject.metadata.width,
                height: editingProject.metadata.height,
                fps: editingProject.metadata.fps,
              }}
              isEditing={true}
              isSubmitting={isSubmitting}
              project={editingProject}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Import Project Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open && !importProgress) {
          setImportDialogOpen(false);
          setImportError(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importError ? 'Import Failed' : 'Importing Project'}
            </DialogTitle>
            {!importError && importProgress && (
              <DialogDescription>
                {importProgress.stage === 'validating' && 'Validating bundle...'}
                {importProgress.stage === 'importing' && `Importing media${importProgress.currentFile ? `: ${importProgress.currentFile}` : '...'}`}
                {importProgress.stage === 'linking' && 'Creating project...'}
                {importProgress.stage === 'complete' && 'Import complete!'}
              </DialogDescription>
            )}
          </DialogHeader>

          {importError ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{importError}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setImportDialogOpen(false);
                  setImportError(null);
                }}
              >
                Close
              </Button>
            </div>
          ) : importProgress ? (
            <div className="space-y-4">
              <Progress value={importProgress.percent} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                {Math.round(importProgress.percent)}%
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
