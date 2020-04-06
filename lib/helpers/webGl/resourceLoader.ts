import {ActiveTaskHandle, ContinuousTaskQueue} from "../flow/continuousTaskQueue";
import {CountdownController} from "../flow/countdownController";
import {RecordV} from "../typescript/aliases";

type LoadedResources<TRes> = { [K in keyof TRes]: TRes[K] extends AsyncResourceTaskProvider<infer T> ? T : never };
export class AsyncResourceLoader<TRes extends RecordV<AsyncResourceTaskProvider<any>>> {
    private readonly task_queue: ContinuousTaskQueue;
    private readonly res_load_counter: CountdownController;

    constructor(
            resources: TRes, max_continuous_connections: number,
            private readonly on_success: (resources: LoadedResources<TRes>) => void,
            private readonly on_failure: (reason: string) => void
    ) {
        const loaded_resources: RecordV<any> = {};

        // Setup flow managers
        this.task_queue = new ContinuousTaskQueue(max_continuous_connections, on_failure);
        this.res_load_counter = new CountdownController(0, () => {
            this.on_success(loaded_resources as any);
        });

        // Add resource tasks
        for (const resource_key in resources) {
            if (!resources.hasOwnProperty(resource_key)) continue;
            const resource = resources[resource_key];

            this.task_queue.addTask((finish, fatal) => {
                return resource(res => {
                    this.res_load_counter.dec();
                    loaded_resources[resource_key] = res;
                    finish();
                }, fatal);
            });
            this.res_load_counter.add();
        }
    }

    start() {
        console.assert(!this.res_load_counter.is_finished);
        this.task_queue.start();
    }

    stop(can_resume: boolean) {
        this.task_queue.stop(can_resume);
    }
}

export type AsyncResourceTaskProvider<T> = (finish: (res: T) => void, fatal: (reason: string) => void) => ActiveTaskHandle;