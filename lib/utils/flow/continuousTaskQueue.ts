// Welcome to another corner of programming hell. This time, it's concurrency with the added twist of inconsistent
// internal implementations to make time here quite "fun".

export type CTQExceptionHandler = (error: Error) => void;
export type CTQTaskHandle = {
    resume: () => void,
    stop: (can_resume: boolean) => void
};

/**
 * @desc A task to be managed by the ContinuousTaskQueue. When the method is called, the task is expected to start running.
 * The handler can call finish to declare the task as finished and queue a new task or call fatal to cause the error to be
 * reported and the queue to be stopped.
 *
 * The task can optionally provide handlers for resuming and stopping (whether that be a resume-able stop ie pause or a
 * terminal stop ie stop) where the task can optionally attempt to pause/stop their task. The resume method will only be
 * called when the task is not running and the stop method will only be called when the task is running.
 *
 * Even while paused, the task can call both finish() and fatal(). finish() will queue the next task (if there is one) for
 * when the CTQ resumes but fatal() will immediately take effect.
 *
 * Calls to finish() and fatal() after the CTQ is in a stopped state will be ignored.
 */
export type CTQTaskProvider = (finish: () => void, fatal: CTQExceptionHandler) => CTQTaskHandle | null;

enum CTQStatus {
    Paused,
    Active,
    Stopped
}

export class ContinuousTaskQueue {
    /**
     * @desc The status of this queue
     * Paused => No new tasks should start. Currently running tasks are recommended to pause but this isn't mandatory.
     * Active => Tasks are allowed to start immediately if there is space and new tasks are queued once a task has finished.
     * Stopped => No new tasks are allowed to start. This state is irrecoverable. Active tasks are recommended to stop
     * but this isn't mandatory. Any attempt to start a new task or change the state is blocked. Tasks finishing or failing
     * are ignored.
     */
    private status = CTQStatus.Paused;

    /**
     * @desc The current number of tasks that are actively running or queued to run.
     */
    private concurrent_task_count = 0;

    /**
     * @desc A list of handles. Only used for notifying active tasks of a state change.
     * As such, tasks that do not request a handle (the task provider returned null) are not tracked here.
     */
    private readonly running_tasks = new Set<CTQTaskHandle>();

    /**
     * @desc A list of task providers that need to be started once the task queue starts up again.
     */
    private tasks_to_start: CTQTaskProvider[] = [];

    /**
     * @desc A pool of tasks to run once a task has finished.
     */
    private task_pool: CTQTaskProvider[] = [];

    /**
     * @constructor Creates a new ContinuousTaskQueue who by default is in the paused state with no tasks queued.
     * @param max_concurrent_tasks: The maximum number of tasks that can be ran at a time.
     * @param fatal_exception_handler: An callback used when a task reports a fatal error. Only called once.
     */
    constructor(private readonly max_concurrent_tasks: number, public fatal_exception_handler: CTQExceptionHandler | null) {}

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

                if (handle != null)  // The task handle is only registered if the provider wants to receive events. If null, the provider doesn't want to receive events and as such was not registered.
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
                if (this.status === CTQStatus.Stopped) return;  // Only once exception can be triggered.
                this.stop();
                if (this.fatal_exception_handler) this.fatal_exception_handler(e);
            });

            // ...and register it for resuming and pausing purposes.
            if (handle != null)  // This only happens if the task wants to be notified of resume/pause events.
                this.running_tasks.add(handle);
        });
    }

    /**
     * @desc Registers a task. If allowed to run now, the task will be ran on the next run loop so that you can queue
     * up a bunch of tasks before any task starts doing something, akin to how promises work. If not, it will be either
     * be placed in a pool of tasks to run or a list of tasks that need to be started upon the next resume.
     * NOTE: A task registered during a pause period is not started (calling the provider to produce a handle) and will
     * only be started once the CTQ resumes. As such, the provider will not receive the resume event on resume.
     * @param provider: The task provider
     * @throws May not be called once the CTQ has been stopped or is already running.
     */
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

    /**
     * @desc Starts all the tasks queued during the pause phase and notifies all tasks that were paused and are listening
     * to these events. The resume events are called before any new tasks are started. The resume events, unlike task spawning,
     * are not queued in the run loop.
     * @throws May not be called once the CTQ has been stopped or is already running.
     */
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

    /**
     * @desc Notifies all listening active tasks of a pause which can be resumed from. Any tasks that should run during
     * this period are queued to start once the CTQ resumes.
     */
    pause() {
        console.assert(this.status === CTQStatus.Active);
        this.status = CTQStatus.Paused;  // Status is set here for the same reason as for the start method.
        // Notify tasks that they **should** pause.
        for (const task_handle of this.running_tasks) {
            task_handle.stop(true);
        }
    }

    /**
     * @desc Notifies all listening active tasks of a non-recoverable stop. Any tasks that are queued will be ignored (whether that
     * be run loop queued or in the resume queue). All internal state is cleared and the CTQ can no longer be used for
     * anything else. This method is called internally when a fatal error is reported.
     */
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