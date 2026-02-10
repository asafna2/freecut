import { describe, it, expect } from 'vitest';
import {
  createTransformNode,
  createScaleNode,
  createRotateNode,
  createTranslateNode,
  createFlipNode,
  createCropNode,
  getTransformFunctionsWGSL,
} from './transform-node';

describe('Transform Nodes', () => {
  describe('createTransformNode', () => {
    it('should create a transform node with default parameters', () => {
      const node = createTransformNode('transform-1');

      expect(node.id).toBe('transform-1');
      expect(node.type).toBe('transform');
      expect(node.name).toBe('transform');
    });

    it('should have input and output', () => {
      const node = createTransformNode('transform-1');

      expect(node.inputs.input).toBeDefined();
      expect(node.inputs.input.type).toBe('color');
      expect(node.inputs.input.required).toBe(true);
      expect(node.outputs.output).toBeDefined();
      expect(node.outputs.output.type).toBe('color');
    });

    it('should have all transform parameters', () => {
      const node = createTransformNode('transform-1');

      expect(node.params.scaleX).toBeDefined();
      expect(node.params.scaleY).toBeDefined();
      expect(node.params.rotation).toBeDefined();
      expect(node.params.translateX).toBeDefined();
      expect(node.params.translateY).toBeDefined();
      expect(node.params.anchorX).toBeDefined();
      expect(node.params.anchorY).toBeDefined();
    });

    it('should have sensible default values', () => {
      const node = createTransformNode('transform-1');

      expect(node.params.scaleX.value).toBe(1.0);
      expect(node.params.scaleY.value).toBe(1.0);
      expect(node.params.rotation.value).toBe(0.0);
      expect(node.params.translateX.value).toBe(0.0);
      expect(node.params.translateY.value).toBe(0.0);
      expect(node.params.anchorX.value).toBe(0.5);
      expect(node.params.anchorY.value).toBe(0.5);
    });

    it('should accept custom parameters', () => {
      const node = createTransformNode('transform-1', {
        scaleX: 2.0,
        scaleY: 1.5,
        rotation: 45,
        translateX: 0.1,
        translateY: -0.2,
        anchorX: 0.0,
        anchorY: 1.0,
      });

      expect(node.params.scaleX.value).toBe(2.0);
      expect(node.params.scaleY.value).toBe(1.5);
      expect(node.params.rotation.value).toBe(45);
      expect(node.params.translateX.value).toBe(0.1);
      expect(node.params.translateY.value).toBe(-0.2);
      expect(node.params.anchorX.value).toBe(0.0);
      expect(node.params.anchorY.value).toBe(1.0);
    });

    it('should have shader with transform functions', () => {
      const node = createTransformNode('transform-1');

      expect(node.shader).toBeDefined();
      expect(node.shader!.functions).toContain('apply_transform_2d');
      expect(node.shader!.main).toContain('apply_transform_2d');
    });
  });

  describe('createScaleNode', () => {
    it('should create a scale node', () => {
      const node = createScaleNode('scale-1');

      expect(node.name).toBe('scale');
      expect(node.type).toBe('transform');
    });

    it('should have scale parameters', () => {
      const node = createScaleNode('scale-1', { scaleX: 2.0, scaleY: 0.5 });

      expect(node.params.scaleX.value).toBe(2.0);
      expect(node.params.scaleY.value).toBe(0.5);
    });

    it('should support uniform scale', () => {
      const node = createScaleNode('scale-1', { uniform: 2.0 });

      expect(node.params.scaleX.value).toBe(2.0);
      expect(node.params.scaleY.value).toBe(2.0);
    });

    it('should have anchor point parameters', () => {
      const node = createScaleNode('scale-1', { anchorX: 0.0, anchorY: 0.0 });

      expect(node.params.anchorX.value).toBe(0.0);
      expect(node.params.anchorY.value).toBe(0.0);
    });
  });

  describe('createRotateNode', () => {
    it('should create a rotate node', () => {
      const node = createRotateNode('rotate-1');

      expect(node.name).toBe('rotate');
      expect(node.type).toBe('transform');
    });

    it('should accept rotation in degrees', () => {
      const node = createRotateNode('rotate-1', { rotation: 90 });

      expect(node.params.rotation.value).toBe(90);
    });

    it('should have anchor point for rotation center', () => {
      const node = createRotateNode('rotate-1', { anchorX: 0.0, anchorY: 0.0 });

      expect(node.params.anchorX.value).toBe(0.0);
      expect(node.params.anchorY.value).toBe(0.0);
    });

    it('should have shader with rotation matrix', () => {
      const node = createRotateNode('rotate-1');

      expect(node.shader!.functions).toContain('rotation_matrix');
    });
  });

  describe('createTranslateNode', () => {
    it('should create a translate node', () => {
      const node = createTranslateNode('translate-1');

      expect(node.name).toBe('translate');
      expect(node.type).toBe('transform');
    });

    it('should accept translation parameters', () => {
      const node = createTranslateNode('translate-1', {
        translateX: 0.5,
        translateY: -0.25,
      });

      expect(node.params.translateX.value).toBe(0.5);
      expect(node.params.translateY.value).toBe(-0.25);
    });

    it('should default to no translation', () => {
      const node = createTranslateNode('translate-1');

      expect(node.params.translateX.value).toBe(0.0);
      expect(node.params.translateY.value).toBe(0.0);
    });
  });

  describe('createFlipNode', () => {
    it('should create a flip node', () => {
      const node = createFlipNode('flip-1');

      expect(node.name).toBe('flip');
      expect(node.type).toBe('transform');
    });

    it('should accept horizontal flip parameter', () => {
      const node = createFlipNode('flip-1', { horizontal: true });

      expect(node.params.horizontal.value).toBe(true);
    });

    it('should accept vertical flip parameter', () => {
      const node = createFlipNode('flip-1', { vertical: true });

      expect(node.params.vertical.value).toBe(true);
    });

    it('should default to no flip', () => {
      const node = createFlipNode('flip-1');

      expect(node.params.horizontal.value).toBe(false);
      expect(node.params.vertical.value).toBe(false);
    });
  });

  describe('createCropNode', () => {
    it('should create a crop node', () => {
      const node = createCropNode('crop-1');

      expect(node.name).toBe('crop');
      expect(node.type).toBe('transform');
    });

    it('should have crop boundary parameters', () => {
      const node = createCropNode('crop-1', {
        left: 0.1,
        right: 0.9,
        top: 0.2,
        bottom: 0.8,
      });

      expect(node.params.left.value).toBe(0.1);
      expect(node.params.right.value).toBe(0.9);
      expect(node.params.top.value).toBe(0.2);
      expect(node.params.bottom.value).toBe(0.8);
    });

    it('should default to full frame (no crop)', () => {
      const node = createCropNode('crop-1');

      expect(node.params.left.value).toBe(0.0);
      expect(node.params.right.value).toBe(1.0);
      expect(node.params.top.value).toBe(0.0);
      expect(node.params.bottom.value).toBe(1.0);
    });
  });

  describe('getTransformFunctionsWGSL', () => {
    it('should return WGSL code with matrix functions', () => {
      const wgsl = getTransformFunctionsWGSL();

      expect(wgsl).toContain('fn rotation_matrix');
      expect(wgsl).toContain('fn scale_matrix');
      expect(wgsl).toContain('fn apply_transform_2d');
    });

    it('should include bounds checking function', () => {
      const wgsl = getTransformFunctionsWGSL();

      expect(wgsl).toContain('fn in_bounds');
    });

    it('should include degree to radian conversion', () => {
      const wgsl = getTransformFunctionsWGSL();

      expect(wgsl).toContain('fn deg_to_rad');
    });
  });

  describe('shader uniforms', () => {
    it('should have transform uniforms in full transform node', () => {
      const node = createTransformNode('transform-1');

      expect(node.shader!.uniforms).toHaveProperty('scaleX');
      expect(node.shader!.uniforms).toHaveProperty('scaleY');
      expect(node.shader!.uniforms).toHaveProperty('rotation');
      expect(node.shader!.uniforms).toHaveProperty('translateX');
      expect(node.shader!.uniforms).toHaveProperty('translateY');
    });

    it('should have crop uniforms in crop node', () => {
      const node = createCropNode('crop-1');

      expect(node.shader!.uniforms).toHaveProperty('left');
      expect(node.shader!.uniforms).toHaveProperty('right');
      expect(node.shader!.uniforms).toHaveProperty('top');
      expect(node.shader!.uniforms).toHaveProperty('bottom');
    });
  });
});
