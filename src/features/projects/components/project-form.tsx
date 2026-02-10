import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Link } from '@tanstack/react-router';
import {
  projectFormSchema,
  type ProjectFormData,
  DEFAULT_PROJECT_VALUES,
  RESOLUTION_PRESETS,
  FPS_PRESETS,
  getAspectRatio,
} from '../utils/validation';

interface ProjectFormProps {
  onSubmit: (data: ProjectFormData) => Promise<void> | void;
  onCancel?: () => void;
  defaultValues?: Partial<ProjectFormData>;
  isEditing?: boolean;
  isSubmitting?: boolean;
}

export function ProjectForm({
  onSubmit,
  onCancel,
  defaultValues,
  isEditing = false,
  isSubmitting = false,
}: ProjectFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: defaultValues || DEFAULT_PROJECT_VALUES,
    mode: 'onChange',
  });

  const width = watch('width');
  const height = watch('height');
  const fps = watch('fps');

  const handleResolutionChange = (value: string) => {
    const preset = RESOLUTION_PRESETS.find((p) => p.value === value);
    if (preset) {
      setValue('width', preset.width, { shouldValidate: true });
      setValue('height', preset.height, { shouldValidate: true });
    }
  };

  const currentResolution = `${width}x${height}`;
  const aspectRatio = getAspectRatio(width, height);

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="panel-header border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
            {isEditing ? 'Edit Project' : 'Create New Project'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? 'Update your project settings'
              : 'Set up your video editing workspace'}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Project Details */}
          <div className="panel-bg border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h2 className="text-lg font-medium text-foreground">Project Details</h2>
            </div>

            <div className="space-y-5">
              {/* Project Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                  Project Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  {...register('name')}
                  className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  placeholder="Enter project name..."
                />
                {errors.name && (
                  <p className="mt-1.5 text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  {...register('description')}
                  className="w-full px-3 py-2 bg-secondary border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none"
                  placeholder="Brief description of your project..."
                />
                {errors.description && (
                  <p className="mt-1.5 text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Video Settings */}
          <div className="panel-bg border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h2 className="text-lg font-medium text-foreground">Video Settings</h2>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* Resolution */}
              <div>
                <label htmlFor="resolution" className="block text-sm font-medium text-foreground mb-2">
                  Resolution
                </label>
                <Select value={currentResolution} onValueChange={handleResolutionChange}>
                  <SelectTrigger id="resolution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(errors.width || errors.height) && (
                  <p className="mt-1.5 text-sm text-destructive">
                    {errors.width?.message || errors.height?.message}
                  </p>
                )}
              </div>

              {/* Frame Rate */}
              <div>
                <label htmlFor="fps" className="block text-sm font-medium text-foreground mb-2">
                  Frame Rate
                </label>
                <Select
                  value={fps.toString()}
                  onValueChange={(value) => setValue('fps', Number(value), { shouldValidate: true })}
                >
                  <SelectTrigger id="fps">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FPS_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value.toString()}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.fps && (
                  <p className="mt-1.5 text-sm text-destructive">{errors.fps.message}</p>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="mt-6 px-4 py-3 bg-secondary/50 border border-border rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-mono">Preview:</span>
                <div className="text-right">
                  <span className="text-sm font-mono text-primary font-medium">
                    {width}×{height} @ {fps}fps
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">({aspectRatio})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            {onCancel ? (
              <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link to="/projects">
                <Button type="button" variant="outline" size="lg" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Link>
            )}
            <Button type="submit" size="lg" className="min-w-[160px]" disabled={!isValid || isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Project' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
