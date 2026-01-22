import { describe, it, expect } from 'vitest';
import {
  createBlendNode,
  createNormalBlendNode,
  createMultiplyBlendNode,
  createScreenBlendNode,
  createOverlayBlendNode,
  createAddBlendNode,
  createSubtractBlendNode,
  createDifferenceBlendNode,
  createDarkenBlendNode,
  createLightenBlendNode,
  createColorDodgeBlendNode,
  createColorBurnBlendNode,
  createHardLightBlendNode,
  createSoftLightBlendNode,
  getBlendFunctionsWGSL,
  BLEND_MODES,
} from './blend-node';

describe('Blend Nodes', () => {
  describe('createBlendNode', () => {
    it('should create a blend node with default mode', () => {
      const node = createBlendNode('blend-1');

      expect(node.id).toBe('blend-1');
      expect(node.type).toBe('blend');
      expect(node.name).toBe('blend');
    });

    it('should have base and blend inputs', () => {
      const node = createBlendNode('blend-1');

      expect(node.inputs.base).toBeDefined();
      expect(node.inputs.base.type).toBe('color');
      expect(node.inputs.base.required).toBe(true);
      expect(node.inputs.blend).toBeDefined();
      expect(node.inputs.blend.type).toBe('color');
      expect(node.inputs.blend.required).toBe(true);
    });

    it('should have color output', () => {
      const node = createBlendNode('blend-1');

      expect(node.outputs.output).toBeDefined();
      expect(node.outputs.output.type).toBe('color');
    });

    it('should accept blend mode parameter', () => {
      const node = createBlendNode('blend-1', { mode: 'multiply' });

      expect(node.params.mode.value).toBe('multiply');
    });

    it('should accept opacity parameter', () => {
      const node = createBlendNode('blend-1', { opacity: 0.5 });

      expect(node.params.opacity.value).toBe(0.5);
    });

    it('should have shader with blend functions', () => {
      const node = createBlendNode('blend-1', { mode: 'screen' });

      expect(node.shader).toBeDefined();
      expect(node.shader!.functions).toContain('blend_screen');
      expect(node.shader!.main).toContain('blend_screen');
    });
  });

  describe('blend mode nodes', () => {
    it('should create normal blend node', () => {
      const node = createNormalBlendNode('normal-1');
      expect(node.params.mode.value).toBe('normal');
      expect(node.shader!.main).toContain('blend_normal');
    });

    it('should create multiply blend node', () => {
      const node = createMultiplyBlendNode('mult-1');
      expect(node.params.mode.value).toBe('multiply');
      expect(node.shader!.main).toContain('blend_multiply');
    });

    it('should create screen blend node', () => {
      const node = createScreenBlendNode('screen-1');
      expect(node.params.mode.value).toBe('screen');
      expect(node.shader!.main).toContain('blend_screen');
    });

    it('should create overlay blend node', () => {
      const node = createOverlayBlendNode('overlay-1');
      expect(node.params.mode.value).toBe('overlay');
      expect(node.shader!.main).toContain('blend_overlay');
    });

    it('should create add blend node', () => {
      const node = createAddBlendNode('add-1');
      expect(node.params.mode.value).toBe('add');
      expect(node.shader!.main).toContain('blend_add');
    });

    it('should create subtract blend node', () => {
      const node = createSubtractBlendNode('sub-1');
      expect(node.params.mode.value).toBe('subtract');
      expect(node.shader!.main).toContain('blend_subtract');
    });

    it('should create difference blend node', () => {
      const node = createDifferenceBlendNode('diff-1');
      expect(node.params.mode.value).toBe('difference');
      expect(node.shader!.main).toContain('blend_difference');
    });

    it('should create darken blend node', () => {
      const node = createDarkenBlendNode('darken-1');
      expect(node.params.mode.value).toBe('darken');
      expect(node.shader!.main).toContain('blend_darken');
    });

    it('should create lighten blend node', () => {
      const node = createLightenBlendNode('lighten-1');
      expect(node.params.mode.value).toBe('lighten');
      expect(node.shader!.main).toContain('blend_lighten');
    });

    it('should create color dodge blend node', () => {
      const node = createColorDodgeBlendNode('dodge-1');
      expect(node.params.mode.value).toBe('color-dodge');
      expect(node.shader!.main).toContain('blend_color_dodge');
    });

    it('should create color burn blend node', () => {
      const node = createColorBurnBlendNode('burn-1');
      expect(node.params.mode.value).toBe('color-burn');
      expect(node.shader!.main).toContain('blend_color_burn');
    });

    it('should create hard light blend node', () => {
      const node = createHardLightBlendNode('hard-1');
      expect(node.params.mode.value).toBe('hard-light');
      expect(node.shader!.main).toContain('blend_hard_light');
    });

    it('should create soft light blend node', () => {
      const node = createSoftLightBlendNode('soft-1');
      expect(node.params.mode.value).toBe('soft-light');
      expect(node.shader!.main).toContain('blend_soft_light');
    });
  });

  describe('BLEND_MODES constant', () => {
    it('should export 13 blend modes', () => {
      expect(BLEND_MODES.length).toBe(13);
    });

    it('should include all standard blend modes', () => {
      expect(BLEND_MODES).toContain('normal');
      expect(BLEND_MODES).toContain('multiply');
      expect(BLEND_MODES).toContain('screen');
      expect(BLEND_MODES).toContain('overlay');
      expect(BLEND_MODES).toContain('add');
      expect(BLEND_MODES).toContain('subtract');
      expect(BLEND_MODES).toContain('difference');
      expect(BLEND_MODES).toContain('darken');
      expect(BLEND_MODES).toContain('lighten');
    });
  });

  describe('getBlendFunctionsWGSL', () => {
    it('should return WGSL code with all blend functions', () => {
      const wgsl = getBlendFunctionsWGSL();

      expect(wgsl).toContain('fn blend_normal');
      expect(wgsl).toContain('fn blend_multiply');
      expect(wgsl).toContain('fn blend_screen');
      expect(wgsl).toContain('fn blend_overlay');
      expect(wgsl).toContain('fn blend_add');
      expect(wgsl).toContain('fn blend_subtract');
      expect(wgsl).toContain('fn blend_difference');
      expect(wgsl).toContain('fn blend_darken');
      expect(wgsl).toContain('fn blend_lighten');
      expect(wgsl).toContain('fn blend_color_dodge');
      expect(wgsl).toContain('fn blend_color_burn');
      expect(wgsl).toContain('fn blend_hard_light');
      expect(wgsl).toContain('fn blend_soft_light');
    });

    it('should include alpha composite functions', () => {
      const wgsl = getBlendFunctionsWGSL();

      expect(wgsl).toContain('fn alpha_composite_over');
      expect(wgsl).toContain('fn alpha_composite_under');
    });
  });

  describe('opacity parameter', () => {
    it('should default to 1.0 opacity', () => {
      const node = createBlendNode('blend-1');
      expect(node.params.opacity.value).toBe(1.0);
    });

    it('should allow custom opacity for any blend mode', () => {
      const node = createMultiplyBlendNode('mult-1', { opacity: 0.7 });
      expect(node.params.opacity.value).toBe(0.7);
    });

    it('should have opacity in shader uniforms', () => {
      const node = createBlendNode('blend-1');
      expect(node.shader!.uniforms).toHaveProperty('opacity');
    });
  });
});
