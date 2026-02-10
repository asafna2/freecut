import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraphBuilder } from './shader-graph';
import type { ShaderNode } from './types';

describe('ShaderGraphBuilder', () => {
  let graph: ShaderGraphBuilder;

  const createSourceNode = (id: string): ShaderNode => ({
    id,
    type: 'source',
    name: 'Source',
    inputs: {},
    outputs: {
      output: { name: 'output', type: 'texture' },
    },
    params: {},
  });

  const createEffectNode = (id: string, name: string): ShaderNode => ({
    id,
    type: 'effect',
    name,
    inputs: {
      input: { name: 'input', type: 'texture', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'texture' },
    },
    params: {
      value: { type: 'number', value: 0, default: 0, min: -1, max: 1 },
    },
  });

  const createOutputNode = (id: string): ShaderNode => ({
    id,
    type: 'output',
    name: 'Output',
    inputs: {
      input: { name: 'input', type: 'texture', required: true },
    },
    outputs: {},
    params: {},
  });

  beforeEach(() => {
    graph = new ShaderGraphBuilder();
  });

  describe('node management', () => {
    it('should add nodes', () => {
      const source = createSourceNode('source-1');
      graph.addNode(source);

      expect(graph.getNode('source-1')).toEqual(source);
      expect(graph.getNodes()).toHaveLength(1);
    });

    it('should remove nodes', () => {
      const source = createSourceNode('source-1');
      graph.addNode(source);
      graph.removeNode('source-1');

      expect(graph.getNode('source-1')).toBeUndefined();
    });

    it('should update node params', () => {
      const effect = createEffectNode('effect-1', 'Brightness');
      graph.addNode(effect);

      graph.updateNodeParams('effect-1', { value: 0.5 });

      expect(graph.getNode('effect-1')?.params.value.value).toBe(0.5);
    });
  });

  describe('connections', () => {
    it('should connect nodes', () => {
      const source = createSourceNode('source-1');
      const effect = createEffectNode('effect-1', 'Brightness');

      graph.addNode(source);
      graph.addNode(effect);
      graph.connect('source-1', 'output', 'effect-1', 'input');

      const connections = graph.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].from.nodeId).toBe('source-1');
      expect(connections[0].to.nodeId).toBe('effect-1');
    });

    it('should disconnect nodes', () => {
      const source = createSourceNode('source-1');
      const effect = createEffectNode('effect-1', 'Brightness');

      graph.addNode(source);
      graph.addNode(effect);
      const connId = graph.connect('source-1', 'output', 'effect-1', 'input');
      graph.disconnect(connId);

      expect(graph.getConnections()).toHaveLength(0);
    });

    it('should remove connections when node is removed', () => {
      const source = createSourceNode('source-1');
      const effect = createEffectNode('effect-1', 'Brightness');

      graph.addNode(source);
      graph.addNode(effect);
      graph.connect('source-1', 'output', 'effect-1', 'input');
      graph.removeNode('source-1');

      expect(graph.getConnections()).toHaveLength(0);
    });
  });

  describe('topology', () => {
    it('should get topologically sorted nodes', () => {
      const source = createSourceNode('source-1');
      const effect1 = createEffectNode('effect-1', 'Brightness');
      const effect2 = createEffectNode('effect-2', 'Contrast');
      const output = createOutputNode('output-1');

      graph.addNode(source);
      graph.addNode(effect1);
      graph.addNode(effect2);
      graph.addNode(output);

      graph.connect('source-1', 'output', 'effect-1', 'input');
      graph.connect('effect-1', 'output', 'effect-2', 'input');
      graph.connect('effect-2', 'output', 'output-1', 'input');

      const sorted = graph.getTopologicallySorted();

      // Source should come first, output should come last
      expect(sorted[0].id).toBe('source-1');
      expect(sorted[sorted.length - 1].id).toBe('output-1');
    });

    it('should detect cycles', () => {
      const effect1 = createEffectNode('effect-1', 'Brightness');
      const effect2 = createEffectNode('effect-2', 'Contrast');

      // Make effect2 also output to effect1's input
      effect1.inputs.input2 = { name: 'input2', type: 'texture', required: false };

      graph.addNode(effect1);
      graph.addNode(effect2);

      graph.connect('effect-1', 'output', 'effect-2', 'input');

      // This would create a cycle
      expect(() => {
        graph.connect('effect-2', 'output', 'effect-1', 'input2');
      }).toThrow(/cycle/i);
    });
  });

  describe('serialization', () => {
    it('should export to JSON', () => {
      const source = createSourceNode('source-1');
      const effect = createEffectNode('effect-1', 'Brightness');

      graph.addNode(source);
      graph.addNode(effect);
      graph.connect('source-1', 'output', 'effect-1', 'input');

      const json = graph.toJSON();

      expect(json.nodes).toHaveLength(2);
      expect(json.connections).toHaveLength(1);
    });
  });
});
