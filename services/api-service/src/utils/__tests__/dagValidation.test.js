const {
  getNodeJobId,
  hasCycle,
  getEntryNodeIds,
  validateWorkflowDefinition,
} = require('../dagValidation');

describe('dagValidation', () => {
  describe('hasCycle', () => {
    it('detects a simple cycle', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ];

      expect(hasCycle(nodes, edges)).toBe(true);
    });

    it('returns false for a valid DAG', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ];

      expect(hasCycle(nodes, edges)).toBe(false);
    });
  });

  describe('getEntryNodeIds', () => {
    it('returns nodes without incoming edges', () => {
      const definition = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'c' },
        ],
      };

      expect(getEntryNodeIds(definition)).toEqual(['a']);
    });
  });

  describe('validateWorkflowDefinition', () => {
    it('throws when a cycle is present', () => {
      expect(() =>
        validateWorkflowDefinition({
          nodes: [
            { id: 'a', data: { jobId: 'job-a' } },
            { id: 'b', data: { jobId: 'job-b' } },
          ],
          edges: [
            { source: 'a', target: 'b' },
            { source: 'b', target: 'a' },
          ],
        }),
      ).toThrow('CYCLE_DETECTED');
    });

    it('accepts a valid React Flow definition', () => {
      expect(() =>
        validateWorkflowDefinition({
          nodes: [
            { id: 'a', data: { jobId: 'job-a' } },
            { id: 'b', data: { jobId: 'job-b' } },
          ],
          edges: [{ source: 'a', target: 'b' }],
        }),
      ).not.toThrow();
    });
  });

  describe('getNodeJobId', () => {
    it('reads jobId from React Flow node data', () => {
      expect(getNodeJobId({ id: 'a', data: { jobId: '123' } })).toBe('123');
      expect(getNodeJobId({ id: 'a', jobId: '456' })).toBe('456');
    });
  });
});
