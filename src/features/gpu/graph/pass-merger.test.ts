import { describe, it, expect } from 'vitest';
import {
  PassMerger,
  createPassMerger,
  getNodeCategory,
  getPassCategory,
  canMergePasses,
  mergeTwoPasses,
  mergeShaderCode,
} from './pass-merger';
import type { CompiledPass } from './types';

describe('Pass Merger', () => {
  describe('getNodeCategory', () => {
    it('should identify color operations', () => {
      expect(getNodeCategory('brightness')).toBe('color');
      expect(getNodeCategory('contrast')).toBe('color');
      expect(getNodeCategory('saturation')).toBe('color');
      expect(getNodeCategory('opacity')).toBe('color');
      expect(getNodeCategory('brightness-contrast')).toBe('color');
    });

    it('should identify transform operations', () => {
      expect(getNodeCategory('scale')).toBe('transform');
      expect(getNodeCategory('rotate')).toBe('transform');
      expect(getNodeCategory('translate')).toBe('transform');
      expect(getNodeCategory('transform')).toBe('transform');
      expect(getNodeCategory('flip')).toBe('transform');
      expect(getNodeCategory('crop')).toBe('transform');
    });

    it('should identify blur operations', () => {
      expect(getNodeCategory('blur')).toBe('blur');
      expect(getNodeCategory('gaussian-blur')).toBe('blur');
      expect(getNodeCategory('fast-blur')).toBe('blur');
    });

    it('should identify blend operations', () => {
      expect(getNodeCategory('blend')).toBe('blend');
      expect(getNodeCategory('multiply-blend')).toBe('blend');
      expect(getNodeCategory('screen-blend')).toBe('blend');
    });

    it('should return unknown for unrecognized nodes', () => {
      expect(getNodeCategory('custom-effect')).toBe('unknown');
      expect(getNodeCategory('my-filter')).toBe('unknown');
    });
  });

  describe('getPassCategory', () => {
    it('should determine category from pass nodes', () => {
      const colorPass: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      expect(getPassCategory(colorPass)).toBe('color');
    });

    it('should return unknown for passes with no categorizable nodes', () => {
      const unknownPass: CompiledPass = {
        id: 'pass-0',
        nodes: ['custom-1'],
        shader: 'shader',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      expect(getPassCategory(unknownPass)).toBe('unknown');
    });
  });

  describe('canMergePasses', () => {
    it('should allow merging adjacent color passes', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: { brightness: 1.2 },
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'temp-2',
        uniforms: { contrast: 1.5 },
      };

      expect(canMergePasses(passA, passB)).toBe(true);
    });

    it('should not merge non-dependent passes', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['other-source'],
        output: 'temp-2',
        uniforms: {},
      };

      expect(canMergePasses(passA, passB)).toBe(false);
    });

    it('should not merge blend passes (multiple inputs)', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['blend-1'],
        shader: 'shader-b',
        inputs: ['temp-1', 'other-source'],
        output: 'temp-2',
        uniforms: {},
      };

      expect(canMergePasses(passA, passB)).toBe(false);
    });

    it('should not merge color and transform passes', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['scale-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'temp-2',
        uniforms: {},
      };

      expect(canMergePasses(passA, passB)).toBe(false);
    });
  });

  describe('mergeTwoPasses', () => {
    it('should combine pass nodes', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: { brightness: 1.2 },
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'screen',
        uniforms: { contrast: 1.5 },
      };

      const merged = mergeTwoPasses(passA, passB);

      expect(merged.nodes).toEqual(['brightness-1', 'contrast-1']);
    });

    it('should use first pass inputs and last pass output', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'screen',
        uniforms: {},
      };

      const merged = mergeTwoPasses(passA, passB);

      expect(merged.inputs).toEqual(['source']);
      expect(merged.output).toBe('screen');
    });

    it('should namespace uniforms to avoid conflicts', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: { amount: 1.2 },
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'screen',
        uniforms: { amount: 1.5 },
      };

      const merged = mergeTwoPasses(passA, passB);

      expect(merged.uniforms.pass0_amount).toBe(1.2);
      expect(merged.uniforms.pass1_amount).toBe(1.5);
    });

    it('should create a merged ID', () => {
      const passA: CompiledPass = {
        id: 'pass-0',
        nodes: ['brightness-1'],
        shader: 'shader-a',
        inputs: ['source'],
        output: 'temp-1',
        uniforms: {},
      };

      const passB: CompiledPass = {
        id: 'pass-1',
        nodes: ['contrast-1'],
        shader: 'shader-b',
        inputs: ['temp-1'],
        output: 'screen',
        uniforms: {},
      };

      const merged = mergeTwoPasses(passA, passB);

      expect(merged.id).toBe('merged-pass-0-pass-1');
    });
  });

  describe('mergeShaderCode', () => {
    it('should combine shader code', () => {
      const combined = mergeShaderCode('// shader A', '// shader B');

      expect(combined).toContain('// shader A');
      expect(combined).toContain('// shader B');
    });
  });

  describe('PassMerger.merge', () => {
    let merger: PassMerger;

    beforeEach(() => {
      merger = createPassMerger();
    });

    it('should return same passes if nothing can be merged', () => {
      const passes: CompiledPass[] = [
        {
          id: 'pass-0',
          nodes: ['brightness-1'],
          shader: 'shader',
          inputs: ['source'],
          output: 'temp-1',
          uniforms: {},
        },
        {
          id: 'pass-1',
          nodes: ['scale-1'], // Different category
          shader: 'shader',
          inputs: ['temp-1'],
          output: 'screen',
          uniforms: {},
        },
      ];

      const result = merger.merge(passes);

      expect(result.passes.length).toBe(2);
      expect(result.mergedCount).toBe(0);
    });

    it('should merge adjacent color passes', () => {
      const passes: CompiledPass[] = [
        {
          id: 'pass-0',
          nodes: ['brightness-1'],
          shader: 'shader-a',
          inputs: ['source'],
          output: 'temp-1',
          uniforms: { brightness: 1.2 },
        },
        {
          id: 'pass-1',
          nodes: ['contrast-1'],
          shader: 'shader-b',
          inputs: ['temp-1'],
          output: 'temp-2',
          uniforms: { contrast: 1.5 },
        },
        {
          id: 'pass-2',
          nodes: ['saturation-1'],
          shader: 'shader-c',
          inputs: ['temp-2'],
          output: 'screen',
          uniforms: { saturation: 0.8 },
        },
      ];

      const result = merger.merge(passes);

      expect(result.passes.length).toBe(1);
      expect(result.mergedCount).toBe(2);
      expect(result.originalCount).toBe(3);
    });

    it('should handle empty passes list', () => {
      const result = merger.merge([]);

      expect(result.passes.length).toBe(0);
      expect(result.mergedCount).toBe(0);
    });

    it('should handle single pass', () => {
      const passes: CompiledPass[] = [
        {
          id: 'pass-0',
          nodes: ['brightness-1'],
          shader: 'shader',
          inputs: ['source'],
          output: 'screen',
          uniforms: {},
        },
      ];

      const result = merger.merge(passes);

      expect(result.passes.length).toBe(1);
      expect(result.mergedCount).toBe(0);
    });
  });

  describe('PassMerger.analyze', () => {
    let merger: PassMerger;

    beforeEach(() => {
      merger = createPassMerger();
    });

    it('should analyze passes and return merge info', () => {
      const passes: CompiledPass[] = [
        {
          id: 'pass-0',
          nodes: ['brightness-1'],
          shader: 'shader',
          inputs: ['source'],
          output: 'temp-1',
          uniforms: {},
        },
        {
          id: 'pass-1',
          nodes: ['contrast-1'],
          shader: 'shader',
          inputs: ['temp-1'],
          output: 'screen',
          uniforms: {},
        },
      ];

      const analysis = merger.analyze(passes);

      expect(analysis.length).toBe(2);
      expect(analysis[0].category).toBe('color');
      expect(analysis[0].canMerge).toBe(true);
      expect(analysis[1].dependencies.has('pass-0')).toBe(true);
    });
  });

  describe('PassMerger.getOptimizationStats', () => {
    let merger: PassMerger;

    beforeEach(() => {
      merger = createPassMerger();
    });

    it('should return optimization statistics', () => {
      const passes: CompiledPass[] = [
        {
          id: 'pass-0',
          nodes: ['brightness-1'],
          shader: 'shader',
          inputs: ['source'],
          output: 'temp-1',
          uniforms: {},
        },
        {
          id: 'pass-1',
          nodes: ['contrast-1'],
          shader: 'shader',
          inputs: ['temp-1'],
          output: 'temp-2',
          uniforms: {},
        },
        {
          id: 'pass-2',
          nodes: ['scale-1'],
          shader: 'shader',
          inputs: ['temp-2'],
          output: 'screen',
          uniforms: {},
        },
      ];

      const stats = merger.getOptimizationStats(passes);

      expect(stats.totalPasses).toBe(3);
      expect(stats.mergeablePasses).toBe(2); // brightness and contrast are mergeable
      expect(stats.estimatedReduction).toBe(1); // brightness + contrast can merge
    });
  });
});
