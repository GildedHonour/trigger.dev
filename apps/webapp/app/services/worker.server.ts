import { z } from "zod";
import { env } from "~/env.server";
import { ZodWorker } from "~/platform/zodWorker.server";
import { IndexEndpointService } from "./endpoints/indexEndpoint.server";
import { integrationAuthRepository } from "./externalApis/integrationAuthRepository.server";
import { RegisterJobService } from "./jobs/registerJob.server";
import { StartRunService } from "./runs/startRun.server";
import { DeliverHttpSourceRequestService } from "./sources/deliverHttpSourceRequest.server";
import { StartQueuedRunsService } from "./runs/startQueuedRuns.server";
import { RunFinishedService } from "./runs/runFinished.server";
import {
  DynamicTriggerEndpointMetadataSchema,
  JobMetadataSchema,
  RegisterDynamicSchedulePayloadSchema,
  ScheduledPayloadSchema,
  SourceMetadataSchema,
} from "@trigger.dev/internal";
import { RegisterSourceService } from "./sources/registerSource.server";
import { ActivateSourceService } from "./sources/activateSource.server";
import { DeliverEventService } from "./events/deliverEvent.server";
import { InvokeDispatcherService } from "./events/invokeDispatcher.server";
import { RegisterDynamicTriggerService } from "./triggers/registerDynamicTrigger.server";
import { RegisterDynamicScheduleService } from "./triggers/registerDynamicSchedule.server";
import { DeliverScheduledEventService } from "./schedules/deliverScheduledEvent.server";
import { prisma } from "~/db.server";
import { MissingConnectionCreatedService } from "./runs/missingConnectionCreated.server";
import { IntegrationConnectionCreatedService } from "./externalApis/integrationConnectionCreated.server";
import { sendEmail } from "./email.server";
import { DeliverEmailSchema } from "@/../../packages/emails/src";
import { PerformRunExecutionService } from "./runs/performRunExecution.server";
import { PerformTaskOperationService } from "./tasks/performTaskOperation.server";

const workerCatalog = {
  organizationCreated: z.object({ id: z.string() }),
  indexEndpoint: z.object({
    id: z.string(),
    source: z.enum(["MANUAL", "API", "INTERNAL", "HOOK"]).optional(),
    sourceData: z.any().optional(),
    reason: z.string().optional(),
  }),
  scheduleEmail: DeliverEmailSchema,
  githubAppInstallationDeleted: z.object({ id: z.string() }),
  githubPush: z.object({
    branch: z.string(),
    commitSha: z.string(),
    repository: z.string(),
  }),
  stopVM: z.object({ id: z.string() }),
  startInitialProjectDeployment: z.object({ id: z.string() }),
  startRun: z.object({ id: z.string() }),
  performRunExecution: z.object({
    id: z.string(),
  }),
  performTaskOperation: z.object({
    id: z.string(),
  }),
  runFinished: z.object({ id: z.string() }),
  deliverHttpSourceRequest: z.object({ id: z.string() }),
  refreshOAuthToken: z.object({
    organizationId: z.string(),
    connectionId: z.string(),
  }),
  registerJob: z.object({
    endpointId: z.string(),
    job: JobMetadataSchema,
  }),
  registerSource: z.object({
    endpointId: z.string(),
    source: SourceMetadataSchema,
  }),
  registerDynamicTrigger: z.object({
    endpointId: z.string(),
    dynamicTrigger: DynamicTriggerEndpointMetadataSchema,
  }),
  registerDynamicSchedule: z.object({
    endpointId: z.string(),
    dynamicSchedule: RegisterDynamicSchedulePayloadSchema,
  }),
  activateSource: z.object({
    id: z.string(),
    orphanedEvents: z.array(z.string()).optional(),
  }),
  startQueuedRuns: z.object({ id: z.string() }),
  deliverEvent: z.object({ id: z.string() }),
  "events.invokeDispatcher": z.object({
    id: z.string(),
    eventRecordId: z.string(),
  }),
  "events.deliverScheduled": z.object({
    id: z.string(),
    payload: ScheduledPayloadSchema,
  }),
  missingConnectionCreated: z.object({
    id: z.string(),
  }),
  connectionCreated: z.object({
    id: z.string(),
  }),
};

let workerQueue: ZodWorker<typeof workerCatalog>;

declare global {
  var __worker__: ZodWorker<typeof workerCatalog>;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.
if (env.NODE_ENV === "production") {
  workerQueue = getWorkerQueue();
} else {
  if (!global.__worker__) {
    global.__worker__ = getWorkerQueue();
  }
  workerQueue = global.__worker__;
}

export async function init() {
  await workerQueue.initialize();
}

function getWorkerQueue() {
  return new ZodWorker({
    prisma,
    runnerOptions: {
      connectionString: env.DATABASE_URL,
      concurrency: 5,
      pollInterval: 1000,
    },
    schema: workerCatalog,
    tasks: {
      "events.invokeDispatcher": {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new InvokeDispatcherService();

          await service.call(payload.id, payload.eventRecordId);
        },
      },
      "events.deliverScheduled": {
        maxAttempts: 5,
        handler: async ({ id, payload }, job) => {
          const service = new DeliverScheduledEventService();

          await service.call(id, payload);
        },
      },
      connectionCreated: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new IntegrationConnectionCreatedService();

          await service.call(payload.id);
        },
      },
      missingConnectionCreated: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new MissingConnectionCreatedService();

          await service.call(payload.id);
        },
      },
      runFinished: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new RunFinishedService();

          await service.call(payload.id);
        },
      },
      startQueuedRuns: {
        maxAttempts: 3,
        queueName: (payload) => `queue:${payload.id}`,
        handler: async (payload, job) => {
          const service = new StartQueuedRunsService();

          await service.call(payload.id);
        },
      },
      registerJob: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new RegisterJobService();

          await service.call(payload.endpointId, payload.job);
        },
      },
      registerSource: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new RegisterSourceService();

          await service.call(payload.endpointId, payload.source);
        },
      },
      registerDynamicTrigger: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new RegisterDynamicTriggerService();

          await service.call(payload.endpointId, payload.dynamicTrigger);
        },
      },
      registerDynamicSchedule: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new RegisterDynamicScheduleService();

          await service.call(payload.endpointId, payload.dynamicSchedule);
        },
      },
      activateSource: {
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new ActivateSourceService();

          await service.call(payload.id, job.id, payload.orphanedEvents);
        },
      },
      deliverHttpSourceRequest: {
        maxAttempts: 5,
        handler: async (payload, job) => {
          const service = new DeliverHttpSourceRequestService();

          await service.call(payload.id);
        },
      },
      startRun: {
        queueName: "executions",
        maxAttempts: 13,
        handler: async (payload, job) => {
          const service = new StartRunService();

          await service.call(payload.id);
        },
      },
      performRunExecution: {
        queueName: (payload) => `runs:${payload.id}`,
        maxAttempts: 1,
        handler: async (payload, job) => {
          const service = new PerformRunExecutionService();

          await service.call(payload.id);
        },
      },
      performTaskOperation: {
        queueName: (payload) => `tasks:${payload.id}`,
        maxAttempts: 3,
        handler: async (payload, job) => {
          const service = new PerformTaskOperationService();

          await service.call(payload.id);
        },
      },
      scheduleEmail: {
        queueName: "internal-queue",
        priority: 100,
        maxAttempts: 3,
        handler: async (payload, job) => {
          await sendEmail(payload);
        },
      },
      startInitialProjectDeployment: {
        queueName: "internal-queue",
        priority: 50,
        maxAttempts: 3,
        handler: async (payload, job) => {
          // TODO: implement
        },
      },
      stopVM: {
        queueName: "internal-queue",
        priority: 50,
        maxAttempts: 3,
        handler: async (payload, job) => {
          // TODO: implement
        },
      },
      organizationCreated: {
        queueName: "internal-queue",
        priority: 50,
        maxAttempts: 3,
        handler: async (payload, job) => {
          // TODO: implement
        },
      },
      githubPush: {
        queueName: "internal-queue",
        priority: 50,
        maxAttempts: 3,
        handler: async (payload, job) => {
          // TODO: implement
        },
      },
      githubAppInstallationDeleted: {
        queueName: "internal-queue",
        priority: 50,
        maxAttempts: 3,
        handler: async (payload, job) => {
          // TODO: implement
        },
      },
      indexEndpoint: {
        queueName: "internal-queue",
        handler: async (payload, job) => {
          const service = new IndexEndpointService();

          await service.call(
            payload.id,
            payload.source,
            payload.reason,
            payload.sourceData
          );
        },
      },
      deliverEvent: {
        queueName: "event-dispatcher",
        handler: async (payload, job) => {
          const service = new DeliverEventService();

          await service.call(payload.id);
        },
      },
      refreshOAuthToken: {
        queueName: "internal-queue",
        handler: async (payload, job) => {
          await integrationAuthRepository.refreshConnection({
            connectionId: payload.connectionId,
          });
        },
      },
    },
  });
}

export { workerQueue };
