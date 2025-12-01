import { useCallback, useMemo } from 'react';
import { Sparkles, Plus, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TimelineItem } from '@/types/timeline';
import type {
  ItemEffect,
  CSSFilterType,
  CSSFilterEffect,
  GlitchEffect,
  GlitchVariant,
} from '@/types/effects';
import { CSS_FILTER_CONFIGS, GLITCH_CONFIGS, EFFECT_PRESETS } from '@/types/effects';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';
import {
  PropertySection,
  PropertyRow,
  SliderInput,
} from '@/features/editor/components/properties-sidebar/components';

interface EffectsSectionProps {
  items: TimelineItem[];
}

/**
 * Effects section - CSS filters and glitch effects for visual items.
 * Only shown when selection includes video, image, text, or shape clips.
 */
export function EffectsSection({ items }: EffectsSectionProps) {
  const addEffect = useTimelineStore((s) => s.addEffect);
  const updateEffect = useTimelineStore((s) => s.updateEffect);
  const removeEffect = useTimelineStore((s) => s.removeEffect);
  const toggleEffect = useTimelineStore((s) => s.toggleEffect);

  // Gizmo store for live effect preview
  const setEffectsPreview = useGizmoStore((s) => s.setEffectsPreview);
  const clearEffectsPreview = useGizmoStore((s) => s.clearEffectsPreview);

  // Filter to visual items only (exclude audio)
  const visualItems = useMemo(
    () => items.filter((item) => item.type !== 'audio'),
    [items]
  );

  // Memoize item IDs for stable callback dependencies
  const itemIds = useMemo(() => visualItems.map((item) => item.id), [visualItems]);

  // Get effects from first selected item (for display)
  // Multi-select shows first item's effects
  const effects: ItemEffect[] = visualItems[0]?.effects ?? [];

  // Add a CSS filter effect
  const handleAddFilter = useCallback(
    (filterType: CSSFilterType) => {
      const config = CSS_FILTER_CONFIGS[filterType];
      itemIds.forEach((id) => {
        addEffect(id, {
          type: 'css-filter',
          filter: filterType,
          value: config.default,
        } as CSSFilterEffect);
      });
    },
    [itemIds, addEffect]
  );

  // Add a glitch effect
  const handleAddGlitch = useCallback(
    (variant: GlitchVariant) => {
      itemIds.forEach((id) => {
        addEffect(id, {
          type: 'glitch',
          variant,
          intensity: 0.5,
          speed: 1,
          seed: Math.floor(Math.random() * 10000),
        } as GlitchEffect);
      });
    },
    [itemIds, addEffect]
  );

  // Apply a preset (adds multiple effects)
  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = EFFECT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      itemIds.forEach((id) => {
        preset.effects.forEach((effect) => {
          addEffect(id, effect);
        });
      });
    },
    [itemIds, addEffect]
  );

  // Update effect value with live preview
  const handleEffectChange = useCallback(
    (effectId: string, newValue: number) => {
      const effect = effects.find((e) => e.id === effectId);
      if (!effect) return;

      itemIds.forEach((id) => {
        if (effect.effect.type === 'css-filter') {
          updateEffect(id, effectId, {
            effect: { ...effect.effect, value: newValue } as CSSFilterEffect,
          });
        } else if (effect.effect.type === 'glitch') {
          updateEffect(id, effectId, {
            effect: { ...effect.effect, intensity: newValue } as GlitchEffect,
          });
        }
      });
      queueMicrotask(() => clearEffectsPreview());
    },
    [effects, itemIds, updateEffect, clearEffectsPreview]
  );

  // Live preview during drag
  const handleEffectLiveChange = useCallback(
    (effectId: string, newValue: number) => {
      const effect = effects.find((e) => e.id === effectId);
      if (!effect) return;

      const previews: Record<string, ItemEffect[]> = {};
      itemIds.forEach((id) => {
        const item = visualItems.find((i) => i.id === id);
        if (item) {
          previews[id] = (item.effects ?? []).map((e) => {
            if (e.id !== effectId) return e;
            if (e.effect.type === 'css-filter') {
              return { ...e, effect: { ...e.effect, value: newValue } as CSSFilterEffect };
            } else if (e.effect.type === 'glitch') {
              return { ...e, effect: { ...e.effect, intensity: newValue } as GlitchEffect };
            }
            return e;
          });
        }
      });
      setEffectsPreview(previews);
    },
    [effects, itemIds, visualItems, setEffectsPreview]
  );

  // Toggle effect visibility
  const handleToggle = useCallback(
    (effectId: string) => {
      itemIds.forEach((id) => toggleEffect(id, effectId));
    },
    [itemIds, toggleEffect]
  );

  // Check if all effects are enabled
  const allEffectsEnabled = useMemo(
    () => effects.length > 0 && effects.every((e) => e.enabled),
    [effects]
  );

  // Toggle all effects on/off
  const handleToggleAll = useCallback(() => {
    const newEnabled = !allEffectsEnabled;
    itemIds.forEach((id) => {
      effects.forEach((effect) => {
        // Only toggle if current state differs from target
        if (effect.enabled !== newEnabled) {
          toggleEffect(id, effect.id);
        }
      });
    });
  }, [itemIds, effects, allEffectsEnabled, toggleEffect]);

  // Remove effect
  const handleRemove = useCallback(
    (effectId: string) => {
      itemIds.forEach((id) => removeEffect(id, effectId));
    },
    [itemIds, removeEffect]
  );

  if (visualItems.length === 0) return null;

  return (
    <PropertySection title="Effects" icon={Sparkles} defaultOpen={true}>
      {/* Add Effect Dropdown + Toggle All */}
      <div className="px-2 pb-2 flex gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Effect
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {/* Color Adjustments */}
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Color Adjustments
            </div>
            {Object.entries(CSS_FILTER_CONFIGS).map(([key, config]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => handleAddFilter(key as CSSFilterType)}
              >
                {config.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            {/* Glitch Effects */}
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Glitch Effects
            </div>
            {Object.entries(GLITCH_CONFIGS).map(([key, config]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => handleAddGlitch(key as GlitchVariant)}
              >
                {config.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            {/* Presets */}
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Presets
            </div>
            {EFFECT_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
              >
                {preset.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {effects.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={handleToggleAll}
            title={allEffectsEnabled ? 'Disable all effects' : 'Enable all effects'}
          >
            {allEffectsEnabled ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Active Effects List */}
      {effects.map((effect) => {
        if (effect.effect.type === 'css-filter') {
          const config = CSS_FILTER_CONFIGS[effect.effect.filter];
          return (
            <PropertyRow key={effect.id} label={config.label}>
              <div className="flex items-center gap-1 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleToggle(effect.id)}
                  title={effect.enabled ? 'Disable effect' : 'Enable effect'}
                >
                  {effect.enabled ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-muted-foreground" />
                  )}
                </Button>
                <SliderInput
                  value={effect.effect.value}
                  onChange={(v) => handleEffectChange(effect.id, v)}
                  onLiveChange={(v) => handleEffectLiveChange(effect.id, v)}
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  unit={config.unit}
                  disabled={!effect.enabled}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleRemove(effect.id)}
                  title="Remove effect"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </PropertyRow>
          );
        }

        if (effect.effect.type === 'glitch') {
          const config = GLITCH_CONFIGS[effect.effect.variant];
          return (
            <PropertyRow key={effect.id} label={config.label}>
              <div className="flex items-center gap-1 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleToggle(effect.id)}
                  title={effect.enabled ? 'Disable effect' : 'Enable effect'}
                >
                  {effect.enabled ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-muted-foreground" />
                  )}
                </Button>
                <SliderInput
                  value={effect.effect.intensity}
                  onChange={(v) => handleEffectChange(effect.id, v)}
                  onLiveChange={(v) => handleEffectLiveChange(effect.id, v)}
                  min={0}
                  max={1}
                  step={0.01}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  disabled={!effect.enabled}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleRemove(effect.id)}
                  title="Remove effect"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </PropertyRow>
          );
        }

        return null;
      })}

      {/* Empty state */}
      {effects.length === 0 && (
        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
          No effects applied. Click "Add Effect" to get started.
        </div>
      )}
    </PropertySection>
  );
}
