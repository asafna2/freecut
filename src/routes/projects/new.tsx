import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ProjectForm } from '@/features/projects/components/project-form';
import { useCreateProject } from '@/features/projects/hooks/use-project-actions';
import type { ProjectFormData } from '@/features/projects/utils/validation';

export const Route = createFileRoute('/projects/new')({
  component: NewProject,
});

function NewProject() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createProject = useCreateProject();

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true);

    try {
      const result = await createProject(data);

      if (result.success && result.project) {
        // Navigate to editor with new project
        navigate({
          to: '/projects/$projectId/editor',
          params: { projectId: result.project.id },
        });
      } else {
        alert(`Failed to create project: ${result.error}`);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project. Please try again.');
      setIsSubmitting(false);
    }
  };

  return <ProjectForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
}
