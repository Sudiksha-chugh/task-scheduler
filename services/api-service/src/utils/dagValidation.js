function getNodeJobId(node) {
  if (!node) return null;
  return node.data?.jobId || node.jobId || null;
}

function hasCycle(nodes = [], edges = []) {
  const adj = {};
  nodes.forEach((n) => {
    adj[String(n.id)] = [];
  });

  edges.forEach((e) => {
    const source = String(e.source);
    const target = String(e.target);
    if (adj[source] && adj[target] !== undefined) {
      adj[source].push(target);
    }
  });

  const visited = {};

  function dfs(nodeId) {
    visited[nodeId] = 1;
    for (const neighbor of adj[nodeId] || []) {
      if (visited[neighbor] === 1) {
        return true;
      }
      if (!visited[neighbor] && dfs(neighbor)) {
        return true;
      }
    }
    visited[nodeId] = 2;
    return false;
  }

  for (const node of nodes) {
    const nodeId = String(node.id);
    if (!visited[nodeId] && dfs(nodeId)) {
      return true;
    }
  }

  return false;
}

function getEntryNodeIds(definition = {}) {
  const nodes = definition.nodes || [];
  const edges = definition.edges || [];
  const hasIncoming = new Set(edges.map((edge) => String(edge.target)));

  return nodes
    .filter((node) => !hasIncoming.has(String(node.id)))
    .map((node) => String(node.id));
}

function validateWorkflowDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Workflow definition is required');
  }

  const nodes = definition.nodes;
  const edges = definition.edges;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Workflow definition must include at least one node');
  }

  if (!Array.isArray(edges)) {
    throw new Error('Workflow definition must include an edges array');
  }

  const nodeIds = new Set(nodes.map((node) => String(node.id)));

  for (const node of nodes) {
    if (!node.id) {
      throw new Error('Each workflow node must have an id');
    }
    if (!getNodeJobId(node)) {
      throw new Error(`Workflow node "${node.id}" is missing a jobId`);
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(String(edge.source)) || !nodeIds.has(String(edge.target))) {
      throw new Error('Workflow edges must reference valid node ids');
    }
  }

  if (hasCycle(nodes, edges)) {
    throw new Error('CYCLE_DETECTED');
  }
}

module.exports = {
  getNodeJobId,
  hasCycle,
  getEntryNodeIds,
  validateWorkflowDefinition,
};
