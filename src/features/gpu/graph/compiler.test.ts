import { describe, it, expect, beforeEach } from 'vitest';
import { GraphCompiler } from './compiler';
import { ShaderGraphBuilder } from './shader-graph';
import { createTextureSourceNode } from './nodes/source-node';
import { createBrightnessNode, createContrastNode } from './nodes/effect-nodes';
import { createOutputNode } from './nodes/output-node';

describe('GraphCompiler', () => {
  let compiler: GraphCompiler;
  let graph: ShaderGraphBuilder;

  beforeEach(() => {
    compiler = new GraphCompiler();
    graph = new ShaderGraphBuilder();
  });

  it('should compile a simple linear graph', () => {
    // Source -> Brightness -> Output
    graph.addNode(createTextureSourceNode('source-1'));
    graph.addNode(createBrightnessNode('brightness-1'));
    graph.addNode(createOutputNode('output-1'));

    graph.connect('source-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'output-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    expect(passes.length).toBeGreaterThan(0);
    // Should have at least one effect pass
    expect(passes.some((p) => p.nodes.includes('brightness-1'))).toBe(true);
  });

  it('should compile a chain of effects', () => {
    // Source -> Brightness -> Contrast -> Output
    graph.addNode(createTextureSourceNode('source-1'));
    graph.addNode(createBrightnessNode('brightness-1'));
    graph.addNode(createContrastNode('contrast-1'));
    graph.addNode(createOutputNode('output-1'));

    graph.connect('source-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'contrast-1', 'input');
    graph.connect('contrast-1', 'output', 'output-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    // Effects should be in correct order
    const brightnessPass = passes.findIndex((p) => p.nodes.includes('brightness-1'));
    const contrastPass = passes.findIndex((p) => p.nodes.includes('contrast-1'));

    expect(brightnessPass).toBeLessThan(contrastPass);
  });

  it('should track input/output textures', () => {
    graph.addNode(createTextureSourceNode('source-1'));
    graph.addNode(createBrightnessNode('brightness-1'));
    graph.addNode(createOutputNode('output-1'));

    graph.connect('source-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'output-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    // Effect pass should have source as input
    const effectPass = passes.find((p) => p.nodes.includes('brightness-1'));
    expect(effectPass?.inputs).toContain('source-1');
  });

  it('should mark final pass as screen output', () => {
    graph.addNode(createTextureSourceNode('source-1'));
    graph.addNode(createOutputNode('output-1'));

    graph.connect('source-1', 'output', 'output-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    const lastPass = passes[passes.length - 1];
    expect(lastPass.output).toBe('screen');
  });

  it('should collect uniforms from node params', () => {
    graph.addNode(createTextureSourceNode('source-1'));
    graph.addNode(createBrightnessNode('brightness-1', { brightness: 0.5 }));
    graph.addNode(createOutputNode('output-1'));

    graph.connect('source-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'output-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    const effectPass = passes.find((p) => p.nodes.includes('brightness-1'));
    expect(effectPass?.uniforms.brightness).toBe(0.5);
  });
});
