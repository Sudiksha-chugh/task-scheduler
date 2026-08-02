const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { processEventResult } = require('../processor/eventProcessor');
const {
  Project,
  Job,
  Execution,
  WorkflowDefinition,
  WorkflowRun,
  NodeExecution,
} = require('../../../api-service/src/models');

describe('Event Processor & DAG Integration Tests', () => {
  let replSet;
  let project;
  let jobA;
  let jobB;
  let jobC;
  let jobD;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    await Promise.all([
      Project.init(),
      Job.init(),
      Execution.init(),
      WorkflowDefinition.init(),
      WorkflowRun.init(),
      NodeExecution.init(),
    ]);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  }, 60000);

  beforeEach(async () => {
    await NodeExecution.deleteMany({});
    await WorkflowRun.deleteMany({});
    await WorkflowDefinition.deleteMany({});
    await Execution.deleteMany({});
    await Job.deleteMany({});
    await Project.deleteMany({});

    project = await Project.create({
      name: 'DAG Test Project',
      slug: 'dag-test-project',
      tenant: new mongoose.Types.ObjectId(),
    });

    jobA = await Job.create({
      project: project._id,
      name: 'Job A',
      targetUrl: 'https://example.com/a',
      scheduleType: 'MANUAL',
    });

    jobB = await Job.create({
      project: project._id,
      name: 'Job B',
      targetUrl: 'https://example.com/b',
      scheduleType: 'MANUAL',
    });

    jobC = await Job.create({
      project: project._id,
      name: 'Job C',
      targetUrl: 'https://example.com/c',
      scheduleType: 'MANUAL',
    });

    jobD = await Job.create({
      project: project._id,
      name: 'Job D',
      targetUrl: 'https://example.com/d',
      scheduleType: 'MANUAL',
    });
  });

  it('correctly discards a stale fencing token', async () => {
    const execution = await Execution.create({
      job: jobA._id,
      status: 'RUNNING',
      fencingToken: 5,
      attempts: [],
    });

    const mockBullJob = {
      data: {
        executionId: execution._id.toString(),
        fencingToken: 4, // Stale token (current is 5)
        status: 'SUCCESS',
        httpStatusCode: 200,
      },
    };

    const res = await processEventResult(mockBullJob);

    expect(res.status).toBe('REJECTED');
    expect(res.reason).toBe('stale_fencing_token');

    // Verify Execution was NOT updated
    const updatedExecution = await Execution.findById(execution._id);
    expect(updatedExecution.status).toBe('RUNNING');
    expect(updatedExecution.attempts).toHaveLength(0);
  });

  it('executes a 2-node linear workflow (Node A -> Node B)', async () => {
    const dagDef = {
      nodes: [
        { id: 'nodeA', jobId: jobA._id.toString() },
        { id: 'nodeB', jobId: jobB._id.toString() },
      ],
      edges: [{ source: 'nodeA', target: 'nodeB' }],
    };

    const wfDef = await WorkflowDefinition.create({
      project: project._id,
      name: 'Linear 2-Node Workflow',
      definition: dagDef,
    });

    const wfRun = await WorkflowRun.create({
      workflowDefinition: wfDef._id,
      status: 'RUNNING',
      definition: dagDef,
    });

    const execA = await Execution.create({ job: jobA._id, status: 'RUNNING', fencingToken: 1 });
    const nodeA = await NodeExecution.create({
      workflowRun: wfRun._id,
      nodeId: 'nodeA',
      job: jobA._id,
      execution: execA._id,
      status: 'RUNNING',
    });

    const enqueuedPayloads = [];
    const options = {
      onEnqueue: async (payload) => {
        enqueuedPayloads.push(payload);
      },
    };

    // Complete Node A
    const resA = await processEventResult(
      {
        data: {
          executionId: execA._id.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    expect(resA.status).toBe('SUCCESS');

    // Node A updated to SUCCESS
    const updatedNodeA = await NodeExecution.findById(nodeA._id);
    expect(updatedNodeA.status).toBe('SUCCESS');

    // Node B enqueued automatically via fan-out
    expect(enqueuedPayloads).toHaveLength(1);
    const nodeBExecutionDoc = await NodeExecution.findOne({
      workflowRun: wfRun._id,
      nodeId: 'nodeB',
    });
    expect(nodeBExecutionDoc).not.toBeNull();
    expect(nodeBExecutionDoc.status).toBe('PENDING');

    // Complete Node B
    const execBId = nodeBExecutionDoc.execution;
    await Execution.findByIdAndUpdate(execBId, { status: 'RUNNING', fencingToken: 1 });

    const resB = await processEventResult(
      {
        data: {
          executionId: execBId.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    expect(resB.status).toBe('SUCCESS');

    // Node B updated to SUCCESS
    const updatedNodeB = await NodeExecution.findById(nodeBExecutionDoc._id);
    expect(updatedNodeB.status).toBe('SUCCESS');

    // Entire WorkflowRun is now SUCCESS
    const updatedWfRun = await WorkflowRun.findById(wfRun._id);
    expect(updatedWfRun.status).toBe('SUCCESS');
  });

  it('executes a 3-way fan-out (Node A -> Node B, Node C, Node D)', async () => {
    const dagDef = {
      nodes: [
        { id: 'nodeA', jobId: jobA._id.toString() },
        { id: 'nodeB', jobId: jobB._id.toString() },
        { id: 'nodeC', jobId: jobC._id.toString() },
        { id: 'nodeD', jobId: jobD._id.toString() },
      ],
      edges: [
        { source: 'nodeA', target: 'nodeB' },
        { source: 'nodeA', target: 'nodeC' },
        { source: 'nodeA', target: 'nodeD' },
      ],
    };

    const wfDef = await WorkflowDefinition.create({
      project: project._id,
      name: '3-Way Fan-out Workflow',
      definition: dagDef,
    });

    const wfRun = await WorkflowRun.create({
      workflowDefinition: wfDef._id,
      status: 'RUNNING',
      definition: dagDef,
    });

    const execA = await Execution.create({ job: jobA._id, status: 'RUNNING', fencingToken: 1 });
    await NodeExecution.create({
      workflowRun: wfRun._id,
      nodeId: 'nodeA',
      job: jobA._id,
      execution: execA._id,
      status: 'RUNNING',
    });

    const enqueuedPayloads = [];
    const options = {
      onEnqueue: async (payload) => {
        enqueuedPayloads.push(payload);
      },
    };

    // Complete Node A
    await processEventResult(
      {
        data: {
          executionId: execA._id.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    // Node B, Node C, and Node D should all be enqueued in parallel (3-way fan-out)
    expect(enqueuedPayloads).toHaveLength(3);

    const childNodes = await NodeExecution.find({
      workflowRun: wfRun._id,
      nodeId: { $in: ['nodeB', 'nodeC', 'nodeD'] },
    });
    expect(childNodes).toHaveLength(3);
    expect(childNodes.every((n) => n.status === 'PENDING')).toBe(true);
  });

  it('waits for all predecessors in a fan-in (Node B, Node C -> Node D)', async () => {
    const dagDef = {
      nodes: [
        { id: 'nodeB', jobId: jobB._id.toString() },
        { id: 'nodeC', jobId: jobC._id.toString() },
        { id: 'nodeD', jobId: jobD._id.toString() },
      ],
      edges: [
        { source: 'nodeB', target: 'nodeD' },
        { source: 'nodeC', target: 'nodeD' },
      ],
    };

    const wfDef = await WorkflowDefinition.create({
      project: project._id,
      name: 'Fan-in Workflow',
      definition: dagDef,
    });

    const wfRun = await WorkflowRun.create({
      workflowDefinition: wfDef._id,
      status: 'RUNNING',
      definition: dagDef,
    });

    const execB = await Execution.create({ job: jobB._id, status: 'RUNNING', fencingToken: 1 });
    await NodeExecution.create({
      workflowRun: wfRun._id,
      nodeId: 'nodeB',
      job: jobB._id,
      execution: execB._id,
      status: 'RUNNING',
    });

    const execC = await Execution.create({ job: jobC._id, status: 'RUNNING', fencingToken: 1 });
    await NodeExecution.create({
      workflowRun: wfRun._id,
      nodeId: 'nodeC',
      job: jobC._id,
      execution: execC._id,
      status: 'RUNNING',
    });

    const enqueuedPayloads = [];
    const options = {
      onEnqueue: async (payload) => {
        enqueuedPayloads.push(payload);
      },
    };

    // 1. Complete Node B (Node C is still running/incomplete)
    await processEventResult(
      {
        data: {
          executionId: execB._id.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    // Node D should NOT be enqueued yet (waiting for Node C)
    expect(enqueuedPayloads).toHaveLength(0);
    const nodeDCheck1 = await NodeExecution.findOne({
      workflowRun: wfRun._id,
      nodeId: 'nodeD',
    });
    expect(nodeDCheck1).toBeNull();

    // 2. Complete Node C (all predecessors of Node D now complete)
    await processEventResult(
      {
        data: {
          executionId: execC._id.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    // Now Node D is enqueued!
    expect(enqueuedPayloads).toHaveLength(1);
    const nodeDDoc = await NodeExecution.findOne({
      workflowRun: wfRun._id,
      nodeId: 'nodeD',
    });
    expect(nodeDDoc).not.toBeNull();
    expect(nodeDDoc.status).toBe('PENDING');

    // Complete Node D
    const execDId = nodeDDoc.execution;
    await Execution.findByIdAndUpdate(execDId, { status: 'RUNNING', fencingToken: 1 });

    await processEventResult(
      {
        data: {
          executionId: execDId.toString(),
          fencingToken: 1,
          status: 'SUCCESS',
          httpStatusCode: 200,
        },
      },
      options,
    );

    // Entire WorkflowRun is now SUCCESS
    const updatedWfRun = await WorkflowRun.findById(wfRun._id);
    expect(updatedWfRun.status).toBe('SUCCESS');
  });
});
