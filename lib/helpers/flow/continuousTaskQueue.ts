type ExceptionHandler = (error: Error) => void;
export type CTQTaskHandle = {
    resume: () => void,
    stop: (can_resume: boolean) => void
};
export type CTQTaskProvider = (finish: () => void, fatal: ExceptionHandler) => CTQTaskHandle;

enum CTQStatus {
    Paused,
    Active,
    Stopped
}

export class ContinuousTaskQueue {
    private status = CTQStatus.Paused;
    private concurrent_task_count = 0;
    private readonly running_tasks = new Set<CTQTaskHandle>();
    private readonly tasks_to_start: CTQTaskProvider[] = [];
    private readonly task_pool: CTQTaskProvider[] = [];

    constructor(private readonly max_concurrent_tasks: number, private readonly fatal_exception_handler: ExceptionHandler) {}

    private runTask(provider: CTQTaskProvider) {
        // Since this method is designed to be called after some run loop delay, we need to ensure that the task is actually
        // allowed to start now.
        if (this.status === CTQStatus.Stopped) {
            return;  // Ignore the task entirely. No need to record it as this CTQ will never resume.
        } else if (this.status === CTQStatus.Paused) {
            this.tasks_to_start.push(provider);  // Mark the task as needing to run upon next resume.
            return
        }

        // ...otherwise, start the task now.
        const handle = provider(() => {
            // TODO
        }, e => {
            this.stop(false);
            this.fatal_exception_handler(e);
        });
        this.running_tasks.add(handle);  // ...and register it for resuming and pausing purposes.
    }

    addTask(provider: CTQTaskProvider) {
        console.assert(this.status !== CTQStatus.Stopped);
        if (this.concurrent_task_count < this.max_concurrent_tasks) {  // This is a task that should be "running"
            this.concurrent_task_count++;
            if (this.status === CTQStatus.Paused) {  // However, since the queue is paused, mark it as a task that should be started given the opportunity.
                this.tasks_to_start.push(provider);
            } else {  // This task should be started during the next run loop.
                setTimeout(() => {  // TODO: Is there a better way to force a method to run on next run loop?
                    this.runTask(provider);
                }, 0);
            }
        } else {  // This task cannot run at this time, queue it in the pool.
            this.task_pool.push(provider);
        }
    }

    start() {
        // TODO
    }

    stop(can_resume: boolean) {
        // TODO
    }
}