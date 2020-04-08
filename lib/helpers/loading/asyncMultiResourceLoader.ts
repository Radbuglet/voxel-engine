import {RecordV} from "../typescript/aliases";
import {ContinuousTaskQueue, CTQExceptionHandler, CTQTaskHandle} from "../flow/continuousTaskQueue";
import {StepCountingController} from "../flow/stepCountingController";

export type AsyncResourceProvider<TRes> = (finished: (res: TRes) => void, fatal: CTQExceptionHandler) => CTQTaskHandle | null;
type ResourceProviders<TResourcesLoaded extends RecordV<any>> = {
    [K in keyof TResourcesLoaded]: AsyncResourceProvider<TResourcesLoaded[K]>
};

export class AsyncMultiResourceLoader<TResourcesLoaded extends RecordV<any>> {
    public readonly promise: Promise<TResourcesLoaded>;  //  Promises are used here to allow for await-style usage.
    private readonly task_queue: ContinuousTaskQueue;

    constructor(max_concurrent_tasks: number, start_immediately: boolean, resources: ResourceProviders<TResourcesLoaded>) {
        const task_queue = this.task_queue = new ContinuousTaskQueue(max_concurrent_tasks, null);
        if (start_immediately) task_queue.start();
        // The fatal_exception_handler is initialized as null for late binding. The task queue must be provided here
        // so that the users can send lifecycle commands immediately while waiting for the next run loop cycle to allow
        // the promise to start and hook up its rejection callback to the exception handler.

        this.promise = new Promise<TResourcesLoaded>((resolve, reject) => {
            const loaded_resources: TResourcesLoaded = {} as any;
            task_queue.fatal_exception_handler = reject;
            const step_counter = new StepCountingController(0, () => {}, () => {
                resolve(loaded_resources);
            });

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
        });
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