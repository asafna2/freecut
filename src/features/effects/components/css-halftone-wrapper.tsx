/**
 * CSSHalftoneWrapper - Pure CSS halftone effect using blend modes and contrast filter.
 *
 * NOTE: Currently unused - halftone styles are applied directly via getHalftoneStyles()
 * in adjustment-wrapper.tsx and item-effect-wrapper.tsx. Kept as a standalone component
 * option for per-clip halftone if needed in the future.
 *
 * Technique:
 * - Radial gradient creates soft-edged dot pattern
 * - mix-blend-mode: multiply blends dots with content
 * - filter: contrast() creates the binary halftone threshold effect
 */

import React, { useMemo } from 'react';
import { getHalftoneStyles } from '../utils/effect-to-css';
import type { HalftoneEffect } from '@/types/effects';

interface CSSHalftoneWrapperProps {
  children: React.ReactNode;
  effect: HalftoneEffect | null;
  enabled: boolean;
}

export const CSSHalftoneWrapper: React.FC<CSSHalftoneWrapperProps> = ({
  children,
  effect,
  enabled,
}) => {
  // Default effect values when disabled
  const defaultEffect: HalftoneEffect = {
    type: 'canvas-effect',
    variant: 'halftone',
    patternType: 'dots',
    dotSize: 8,
    spacing: 10,
    angle: 45,
    intensity: 1,
    softness: 0.2,
    blendMode: 'multiply',
    inverted: false,
    backgroundColor: '#ffffff',
    dotColor: '#000000',
  };

  const resolvedEffect = effect ?? defaultEffect;

  const styles = useMemo(() => {
    if (!enabled) return null;
    return getHalftoneStyles(resolvedEffect);
  }, [enabled, resolvedEffect]);

  if (!enabled || !styles) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        ...styles.containerStyle,
        width: '100%',
        height: '100%',
      }}
    >
      {children}
      <div style={styles.overlayStyle} />
    </div>
  );
};

export default CSSHalftoneWrapper;
