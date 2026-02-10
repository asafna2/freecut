import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShaderGraphBuilder,
  GraphCompiler,
  NodeRegistry,
  registerBuiltinNodes,
} from './index';

describe('Shader Graph Integration', () => {
  let registry: NodeRegistry;
  let compiler: GraphCompiler;

  beforeEach(() => {
    registry = new NodeRegistry();
    registerBuiltinNodes(registry);
    compiler = new GraphCompiler();
  });

  it('should build and compile a complete effect chain', () => {
    const graph = new ShaderGraphBuilder();

    // Build graph using registry
    graph.addNode(registry.create('texture-source', 'src-1'));
    graph.addNode(registry.create('brightness', 'brightness-1', { brightness: 0.2 }));
    graph.addNode(registry.create('contrast', 'contrast-1', { contrast: 0.1 }));
    graph.addNode(registry.create('saturation', 'saturation-1', { saturation: 0.3 }));
    graph.addNode(registry.create('output', 'out-1'));

    // Connect nodes
    graph.connect('src-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'contrast-1', 'input');
    graph.connect('contrast-1', 'output', 'saturation-1', 'input');
    graph.connect('saturation-1', 'output', 'out-1', 'input');

    // Compile
    const passes = compiler.compile(graph.toGraph());

    // Verify passes
    expect(passes.length).toBeGreaterThanOrEqual(3);
    expect(passes[passes.length - 1].output).toBe('screen');

    // Check uniforms
    const brightnessPass = passes.find((p) => p.nodes.includes('brightness-1'));
    expect(brightnessPass?.uniforms.brightness).toBe(0.2);
  });

  it('should handle blur in effect chain', () => {
    const graph = new ShaderGraphBuilder();

    graph.addNode(registry.create('texture-source', 'src-1'));
    graph.addNode(registry.create('blur', 'blur-1', { radius: 5 }));
    graph.addNode(registry.create('output', 'out-1'));

    graph.connect('src-1', 'output', 'blur-1', 'input');
    graph.connect('blur-1', 'output', 'out-1', 'input');

    const passes = compiler.compile(graph.toGraph());

    const blurPass = passes.find((p) => p.nodes.includes('blur-1'));
    expect(blurPass).toBeDefined();
    expect(blurPass?.uniforms.radius).toBe(5);
  });

  it('should allow updating node params after creation', () => {
    const graph = new ShaderGraphBuilder();

    graph.addNode(registry.create('texture-source', 'src-1'));
    graph.addNode(registry.create('brightness', 'brightness-1'));
    graph.addNode(registry.create('output', 'out-1'));

    graph.connect('src-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'out-1', 'input');

    // Update brightness
    graph.updateNodeParams('brightness-1', { brightness: 0.75 });

    const passes = compiler.compile(graph.toGraph());
    const brightnessPass = passes.find((p) => p.nodes.includes('brightness-1'));
    expect(brightnessPass?.uniforms.brightness).toBe(0.75);
  });

  it('should serialize and deserialize graph', () => {
    const graph = new ShaderGraphBuilder('test-graph');

    graph.addNode(registry.create('texture-source', 'src-1'));
    graph.addNode(registry.create('brightness', 'brightness-1', { brightness: 0.5 }));
    graph.addNode(registry.create('output', 'out-1'));

    graph.connect('src-1', 'output', 'brightness-1', 'input');
    graph.connect('brightness-1', 'output', 'out-1', 'input');

    // Serialize
    const json = graph.toJSON();

    // Deserialize
    const restored = ShaderGraphBuilder.fromJSON(json);

    expect(restored.getNodes().length).toBe(3);
    expect(restored.getConnections().length).toBe(2);
    expect(restored.getNode('brightness-1')?.params.brightness.value).toBe(0.5);
  });
});
