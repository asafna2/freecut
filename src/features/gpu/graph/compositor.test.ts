import { describe, it, expect, beforeEach } from 'vitest';
import {
  Compositor,
  createCompositor,
  createCompositorWithLayers,
  CompositorLayer,
  CompositionSettings,
} from './compositor';

describe('Compositor', () => {
  let compositor: Compositor;

  beforeEach(() => {
    compositor = createCompositor();
  });

  describe('settings', () => {
    it('should have default settings', () => {
      const settings = compositor.getSettings();

      expect(settings.width).toBe(1920);
      expect(settings.height).toBe(1080);
    });

    it('should allow setting composition dimensions', () => {
      compositor.setSettings({ width: 1280, height: 720 });

      const settings = compositor.getSettings();
      expect(settings.width).toBe(1280);
      expect(settings.height).toBe(720);
    });

    it('should allow setting background color', () => {
      compositor.setSettings({
        width: 1920,
        height: 1080,
        backgroundColor: [0, 0, 0, 1],
      });

      const settings = compositor.getSettings();
      expect(settings.backgroundColor).toEqual([0, 0, 0, 1]);
    });
  });

  describe('layer management', () => {
    it('should add layers', () => {
      const layer: CompositorLayer = {
        id: 'layer-1',
        name: 'Background',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      };

      compositor.addLayer(layer);

      expect(compositor.getLayer('layer-1')).toEqual(layer);
    });

    it('should remove layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });

      const removed = compositor.removeLayer('layer-1');

      expect(removed).toBe(true);
      expect(compositor.getLayer('layer-1')).toBeUndefined();
    });

    it('should update layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });

      compositor.updateLayer('layer-1', { opacity: 0.5, blendMode: 'multiply' });

      const layer = compositor.getLayer('layer-1');
      expect(layer?.opacity).toBe(0.5);
      expect(layer?.blendMode).toBe('multiply');
    });

    it('should get all layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 1,
      });

      const layers = compositor.getLayers();

      expect(layers.length).toBe(2);
    });

    it('should clear all layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });

      compositor.clear();

      expect(compositor.getLayers().length).toBe(0);
    });
  });

  describe('z-ordering', () => {
    beforeEach(() => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 1,
      });
      compositor.addLayer({
        id: 'layer-3',
        sourceId: 'video-3',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 2,
      });
    });

    it('should order layers by z-index', () => {
      const ordered = compositor.getOrderedLayers();

      expect(ordered[0].id).toBe('layer-1');
      expect(ordered[1].id).toBe('layer-2');
      expect(ordered[2].id).toBe('layer-3');
    });

    it('should exclude invisible layers from ordering', () => {
      compositor.updateLayer('layer-2', { visible: false });

      const ordered = compositor.getOrderedLayers();

      expect(ordered.length).toBe(2);
      expect(ordered.map((l) => l.id)).not.toContain('layer-2');
    });

    it('should move layer to top', () => {
      compositor.moveLayerToTop('layer-1');

      const ordered = compositor.getOrderedLayers();
      expect(ordered[ordered.length - 1].id).toBe('layer-1');
    });

    it('should move layer to bottom', () => {
      compositor.moveLayerToBottom('layer-3');

      const ordered = compositor.getOrderedLayers();
      expect(ordered[0].id).toBe('layer-3');
    });

    it('should set layer z-index', () => {
      compositor.setLayerZIndex('layer-1', 10);

      const layer = compositor.getLayer('layer-1');
      expect(layer?.zIndex).toBe(10);
    });
  });

  describe('build', () => {
    it('should build empty compositor', () => {
      const result = compositor.build();

      expect(result.layerOrder.length).toBe(0);
    });

    it('should build single layer compositor', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });

      const result = compositor.build();

      expect(result.layerOrder).toEqual(['layer-1']);
      expect(result.graph).toBeDefined();
    });

    it('should build multi-layer compositor', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: true,
        opacity: 1.0,
        blendMode: 'multiply',
        zIndex: 1,
      });

      const result = compositor.build();

      expect(result.layerOrder).toEqual(['layer-1', 'layer-2']);
    });

    it('should create blend nodes for multiple layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: true,
        opacity: 1.0,
        blendMode: 'screen',
        zIndex: 1,
      });

      const result = compositor.build();
      const graphJson = result.graph.toJSON();

      // Should have source nodes and blend node
      const nodeNames = graphJson.nodes.map((n) => n.name);
      expect(nodeNames).toContain('Texture Source');
      expect(nodeNames).toContain('blend');
    });

    it('should apply transform to layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
        transform: {
          scaleX: 0.5,
          scaleY: 0.5,
          rotation: 45,
        },
      });

      const result = compositor.build();
      const graphJson = result.graph.toJSON();

      // Should have transform node
      const nodeNames = graphJson.nodes.map((n) => n.name);
      expect(nodeNames).toContain('transform');
    });

    it('should apply opacity to layers', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 0.5,
        blendMode: 'normal',
        zIndex: 0,
      });

      const result = compositor.build();
      const graphJson = result.graph.toJSON();

      // Should have opacity node
      const nodeNames = graphJson.nodes.map((n) => n.name);
      expect(nodeNames).toContain('Opacity');
    });
  });

  describe('statistics', () => {
    it('should report empty stats', () => {
      const stats = compositor.getStats();

      expect(stats.totalLayers).toBe(0);
      expect(stats.visibleLayers).toBe(0);
      expect(stats.blendOperations).toBe(0);
    });

    it('should report layer counts', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: false,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 1,
      });

      const stats = compositor.getStats();

      expect(stats.totalLayers).toBe(2);
      expect(stats.visibleLayers).toBe(1);
      expect(stats.blendOperations).toBe(0);
    });

    it('should calculate blend operations', () => {
      compositor.addLayer({
        id: 'layer-1',
        sourceId: 'video-1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 0,
      });
      compositor.addLayer({
        id: 'layer-2',
        sourceId: 'video-2',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 1,
      });
      compositor.addLayer({
        id: 'layer-3',
        sourceId: 'video-3',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        zIndex: 2,
      });

      const stats = compositor.getStats();

      expect(stats.blendOperations).toBe(2); // 3 layers = 2 blends
    });
  });

  describe('createCompositorWithLayers', () => {
    it('should create compositor with initial layers', () => {
      const layers: CompositorLayer[] = [
        {
          id: 'layer-1',
          sourceId: 'video-1',
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          zIndex: 0,
        },
        {
          id: 'layer-2',
          sourceId: 'video-2',
          visible: true,
          opacity: 1.0,
          blendMode: 'normal',
          zIndex: 1,
        },
      ];

      const comp = createCompositorWithLayers(layers);

      expect(comp.getLayers().length).toBe(2);
    });

    it('should apply initial settings', () => {
      const settings: CompositionSettings = { width: 4096, height: 2160 };

      const comp = createCompositorWithLayers([], settings);

      expect(comp.getSettings().width).toBe(4096);
      expect(comp.getSettings().height).toBe(2160);
    });
  });
});
