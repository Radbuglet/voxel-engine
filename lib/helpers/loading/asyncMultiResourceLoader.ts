import {RecordV} from "../typescript/aliases";
import {ContinuousTaskQueue, CTQExceptionHandler, CTQTaskHandle} from "../flow/continuousTaskQueue";
import {StepCountingController} from "../flow/stepCountingController";

/**
 * @desc A resource loading provider. Has the same behavior as a CTQTaskProvider with the only difference being that
 * finished() now provides the loaded resource.
 */
export type AsyncResourceProvider<TRes> = (finished: (res: TRes) => void, fatal: CTQExceptionHandler) => CTQTaskHandle | null;

type ResourceProviders<TResourcesLoaded extends RecordV<any>> = {
    [K in keyof TResourcesLoaded]: AsyncResourceProvider<TResourcesLoaded[K]>
};

export class AsyncMultiResourceLoader<TResourcesLoaded extends RecordV<any>> {
    /**
     * @desc A promise that will be resolved once all configured resources have finished loading or will get rejected
     * once a task declares a fatal error.
     */
    public readonly promise: Promise<TResourcesLoaded>;
    private readonly task_queue: ContinuousTaskQueue;

    /**
     * @constructor
     * @param max_concurrent_tasks: The maximum number of resources that can be loaded concurrently.
     * @param start_immediately: A flag telling the utility to start() the loading process immediately. This start() command
     * would be issued before the actual loading routine gets ran and as such, if done before the next run loop tick, you
     * can issue the same command using start(), stop(), and pause().
     * @param resources: A dictionary of identifiers mapping to a resource provider. Upon completion, a dictionary of the
     * same format will be provided to you through the promise except all values will be the raw resource that was loaded
     * instead of the provider.
     */
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

    /**
     * @desc Starts/resumes loading resources. It is a proxy for the internal ContinuousTaskQueue's start() method and as
     * such, the same limitations concerning the run state of a CTQ apply here.
     */
    start() {
        this.task_queue.start();
    }

    /**
     * @desc Pauses resource loading. It is a proxy for the internal ContinuousTaskQueue's start() method and as such,
     * the same limitations concerning the run state of a CTQ apply here.
     */
    pause() {
        this.task_queue.pause();
    }

    /**
     * @desc Permanently stops resource loading. It is a proxy for the internal ContinuousTaskQueue's start() method and
     * as such, the same limitations concerning the run state of a CTQ apply here.
     */
    stop() {
        this.task_queue.stop();
    }
}