/**
 * Shader Graph Builder
 *
 * Manages the construction and manipulation of shader node graphs.
 */

import type { ShaderNode, Connection, ShaderGraph } from './types';

let connectionIdCounter = 0;

export class ShaderGraphBuilder {
  private nodes: Map<string, ShaderNode> = new Map();
  private connections: Connection[] = [];
  private graphId: string;

  constructor(id?: string) {
    this.graphId = id ?? `graph-${Date.now()}`;
  }

  // === Node Management ===

  addNode(node: ShaderNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }
    this.nodes.set(node.id, { ...node });
  }

  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) {
      return false;
    }

    // Remove all connections involving this node
    this.connections = this.connections.filter(
      (conn) => conn.from.nodeId !== nodeId && conn.to.nodeId !== nodeId
    );

    return this.nodes.delete(nodeId);
  }

  getNode(nodeId: string): ShaderNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodes(): ShaderNode[] {
    return Array.from(this.nodes.values());
  }

  updateNodeParams(nodeId: string, params: Record<string, unknown>): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    for (const [key, value] of Object.entries(params)) {
      if (node.params[key]) {
        node.params[key].value = value;
      }
    }
  }

  // === Connection Management ===

  connect(
    fromNodeId: string,
    fromOutput: string,
    toNodeId: string,
    toInput: string
  ): string {
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);

    if (!fromNode) throw new Error(`Source node "${fromNodeId}" not found`);
    if (!toNode) throw new Error(`Target node "${toNodeId}" not found`);

    if (!fromNode.outputs[fromOutput]) {
      throw new Error(`Output "${fromOutput}" not found on node "${fromNodeId}"`);
    }
    if (!toNode.inputs[toInput]) {
      throw new Error(`Input "${toInput}" not found on node "${toNodeId}"`);
    }

    // Check for existing connection to this input
    const existingConn = this.connections.find(
      (c) => c.to.nodeId === toNodeId && c.to.input === toInput
    );
    if (existingConn) {
      // Remove existing connection to this input
      this.connections = this.connections.filter((c) => c.id !== existingConn.id);
    }

    const connection: Connection = {
      id: `conn-${++connectionIdCounter}`,
      from: { nodeId: fromNodeId, output: fromOutput },
      to: { nodeId: toNodeId, input: toInput },
    };

    // Check for cycles before adding
    if (this.wouldCreateCycle(connection)) {
      throw new Error('Connection would create a cycle in the graph');
    }

    this.connections.push(connection);
    return connection.id;
  }

  disconnect(connectionId: string): boolean {
    const index = this.connections.findIndex((c) => c.id === connectionId);
    if (index === -1) return false;
    this.connections.splice(index, 1);
    return true;
  }

  getConnections(): Connection[] {
    return [...this.connections];
  }

  getInputConnections(nodeId: string): Connection[] {
    return this.connections.filter((c) => c.to.nodeId === nodeId);
  }

  getOutputConnections(nodeId: string): Connection[] {
    return this.connections.filter((c) => c.from.nodeId === nodeId);
  }

  // === Topology ===

  /**
   * Check if adding a connection would create a cycle
   */
  private wouldCreateCycle(newConnection: Connection): boolean {
    // Check if target of new connection can reach source (which would create cycle)
    const visited = new Set<string>();

    const canReach = (start: string, target: string): boolean => {
      if (start === target) return true;
      if (visited.has(start)) return false;

      visited.add(start);

      // Find all nodes that this node outputs TO
      const outgoing = this.connections.filter((c) => c.from.nodeId === start);
      for (const conn of outgoing) {
        if (canReach(conn.to.nodeId, target)) return true;
      }

      return false;
    };

    // Check if from can reach to (which would mean adding to->from creates cycle)
    return canReach(newConnection.to.nodeId, newConnection.from.nodeId);
  }

  /**
   * Get nodes in topological order (dependencies first)
   */
  getTopologicallySorted(): ShaderNode[] {
    const result: ShaderNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error('Cycle detected in graph');
      }

      visiting.add(nodeId);

      // Visit all nodes that this node depends on (inputs)
      const inputConns = this.getInputConnections(nodeId);
      for (const conn of inputConns) {
        visit(conn.from.nodeId);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) result.push(node);
    };

    // Visit all nodes
    for (const nodeId of this.nodes.keys()) {
      visit(nodeId);
    }

    return result;
  }

  /**
   * Find source nodes (no inputs connected)
   */
  getSourceNodes(): ShaderNode[] {
    return this.getNodes().filter((node) => {
      const inputConns = this.getInputConnections(node.id);
      const requiredInputs = Object.values(node.inputs).filter((i) => i.required);
      return requiredInputs.length === 0 || inputConns.length === 0;
    });
  }

  /**
   * Find output nodes (no outputs connected)
   */
  getOutputNodes(): ShaderNode[] {
    return this.getNodes().filter((node) => {
      return this.getOutputConnections(node.id).length === 0 && node.type === 'output';
    });
  }

  // === Serialization ===

  toJSON(): { id: string; nodes: ShaderNode[]; connections: Connection[] } {
    return {
      id: this.graphId,
      nodes: this.getNodes(),
      connections: this.getConnections(),
    };
  }

  toGraph(): ShaderGraph {
    return {
      id: this.graphId,
      nodes: new Map(this.nodes),
      connections: [...this.connections],
    };
  }

  static fromJSON(data: {
    id: string;
    nodes: ShaderNode[];
    connections: Connection[];
  }): ShaderGraphBuilder {
    const builder = new ShaderGraphBuilder(data.id);
    for (const node of data.nodes) {
      builder.addNode(node);
    }
    for (const conn of data.connections) {
      builder.connections.push(conn);
    }
    return builder;
  }
}
