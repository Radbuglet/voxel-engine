// Welcome to another corner of programming hell. This time, it's concurrency with the added twist of inconsistent
// internal implementations to make time here quite "fun".  TODO: Debugging, testing, define behavior more rigorously
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
    private tasks_to_start: CTQTaskProvider[] = [];
    private task_pool: CTQTaskProvider[] = [];

    constructor(private readonly max_concurrent_tasks: number, private readonly fatal_exception_handler: ExceptionHandler) {}

    private runTaskOnNextLoop(provider: CTQTaskProvider) {
        setTimeout(() => {  // TODO: Is there a more elegant way to do this?
            // Since this method is designed to be called after some run loop delay, we need to ensure that the task is actually
            // allowed to start now.
            if (this.status === CTQStatus.Stopped) {
                return;  // Ignore the task entirely. No need to record it as this CTQ will never resume.
            } else if (this.status === CTQStatus.Paused) {
                this.tasks_to_start.push(provider);  // Mark the task as needing to run upon next resume.
                return;
            }

            // ...otherwise, start the task now.
            const handle = provider(() => {  // NOTE: The task does not have to respect the pause/unpause requests which is why we have to handle states over than CTQStatus.Active
                if (this.status === CTQStatus.Stopped) return;  // No need to do anything if the CTQ has been stopped.
                // We don't even need to update internal state because it won't be used anywhere and should have been cleared anyways.
                this.running_tasks.delete(handle);  // Remove the task's handle as there is no reason to pause/resume as the task is already done.
                const next_task_provider = this.task_pool.shift();
                if (next_task_provider == null) {  // No more tasks to start. If any new tasks get added, addTask will handle them.
                    this.concurrent_task_count--;  // Just make sure that the counter is decremented properly.
                    return;
                }

                // No need to check if we are under the max concurrent tasks limit. Use your brain to figure out why...
                // We also don't need to touch the concurrent task counter because regardless of the conditional branches,
                // this task will have ended and a new task will have "started".
                if (this.status === CTQStatus.Paused) {  // If it is paused, just mark the task as needed to be started.
                    this.tasks_to_start.push(next_task_provider);
                } else {  // We can start the task now.
                    // In order to avoid hitting recursion limits, we schedule the task start as a microtask to allow this function
                    // to exit.  TODO: Is there a more elegant way to do this?
                    queueMicrotask(() => {
                        // Since microtasks are ran continuously until the queue if empty, in order to prevent the run loop
                        // from hanging unexpectedly, we queue the start as an actual run loop task.
                        this.runTaskOnNextLoop(next_task_provider);
                    });
                }
            }, e => {
                this.stop();
                this.fatal_exception_handler(e);
            });
            this.running_tasks.add(handle);  // ...and register it for resuming and pausing purposes.
        });
    }

    addTask(provider: CTQTaskProvider) {
        console.assert(this.status !== CTQStatus.Stopped);
        if (this.concurrent_task_count < this.max_concurrent_tasks) {  // This is a task that should be "running"
            this.concurrent_task_count++;
            if (this.status === CTQStatus.Paused) {  // However, since the queue is paused, mark it as a task that should be started given the opportunity.
                this.tasks_to_start.push(provider);
            } else {  // This task should be started during the next run loop to avoid unexpected behavior.
                // The above seems to be the convention in async tasks as evidenced by Promises' handling of immediate
                // promise resolution.
                this.runTaskOnNextLoop(provider);
            }
        } else {  // This task cannot run at this time, queue it in the pool.
            this.task_pool.push(provider);
        }
    }

    start() {
        console.assert(this.status === CTQStatus.Paused);
        this.status = CTQStatus.Active;  // Status is set here in case a resume command causes the task to be finished.
        // By setting the status as active, the task could get added immediately if there is space.

        // Notify all running tasks of the resumed status
        // This happens here because we don't want to notify the tasks that just started out during the "pause tasks_to_start buffer".
        for (const task_handle of this.running_tasks) {
            task_handle.resume();
        }

        // Start all tasks which were supposed to run during the pause
        for (const waiting_task_provider of this.tasks_to_start) {
            this.runTaskOnNextLoop(waiting_task_provider);  // No need to increment the concurrent tasks counter.
            // The concurrent tasks counter tracks planned and active tasks alike.
        }
        this.tasks_to_start = [];
    }

    pause() {
        console.assert(this.status === CTQStatus.Active);
        this.status = CTQStatus.Paused;  // Status is set here for the same reason as for the start method.
        // Notify tasks that they **should** pause.
        for (const task_handle of this.running_tasks) {
            task_handle.stop(true);
        }
    }

    stop() {
        console.assert(this.status !== CTQStatus.Stopped);
        this.status = CTQStatus.Stopped;
        // Notify active tasks that they **should** stop and cleanup their resources.
        for (const task_handle of this.running_tasks) {
            task_handle.stop(false);
        }

        // Cleanup all internal state
        this.running_tasks.clear();
        this.tasks_to_start = [];
        this.concurrent_task_count = 0;
        this.task_pool = [];
    }
}