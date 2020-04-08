import {RecordV} from "../typescript/aliases";
import {ContinuousTaskQueue, CTQExceptionHandler, CTQTaskHandle} from "../flow/continuousTaskQueue";
import {SCCStatusUpdateHandler, StepCountingController} from "../flow/stepCountingController";

export type AsyncResourceProvider<TRes> = (finished: (res: TRes) => void, fatal: CTQExceptionHandler) => CTQTaskHandle | null;
type ResourceProviders<TResourcesLoaded extends RecordV<any>> = {
    [K in keyof TResourcesLoaded]: AsyncResourceProvider<TResourcesLoaded[K]>
};

export class AsyncMultiResourceLoader<TResourcesLoaded extends RecordV<any>> {
    private readonly task_queue: ContinuousTaskQueue;
    constructor(
            max_concurrent_tasks: number, start_immediately: boolean,
            resources: ResourceProviders<TResourcesLoaded>,
            on_progress: SCCStatusUpdateHandler, on_success: (res: TResourcesLoaded) => void, on_fatal: CTQExceptionHandler) {
        const loaded_resources: TResourcesLoaded = {} as any;
        const task_queue = this.task_queue = new ContinuousTaskQueue(max_concurrent_tasks, on_fatal);
        const step_counter = new StepCountingController(10, on_progress, () => {
            on_success(loaded_resources);
        });
        if (start_immediately) task_queue.start();
        for (const loader_key in resources) {
            if (!resources.hasOwnProperty(loader_key)) continue;
            const loading_provider = resources[loader_key];
            step_counter.addStep();
            task_queue.addTask((finish, fatal) => {
                return loading_provider(res => {
                    loaded_resources[loader_key] = res;
                    step_counter.finishStep();
                }, fatal);
            });
        }
    }

    start() {
        this.task_queue.start();
    }

    pause() {
        this.task_queue.pause();
    }

    stop() {
        this.task_queue.stop();
    }
}