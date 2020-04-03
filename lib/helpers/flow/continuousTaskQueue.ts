export class ContinuousTaskQueue {
    private run_state: "paused" | "running" | "stop" = "paused";
    private readonly active_tasks = new Set<ActiveTask>();
    private idle_task_queue: AsyncTaskProvider[] = [];

    constructor(
        private readonly max_concurrent_tasks: number,
        private readonly on_fatal: (reason: string) => void)
    {}

    private runTask(task: AsyncTaskProvider) {
        const active_task_ctx = task(() => {
            this.active_tasks.delete(active_task_ctx);
            const {idle_task_queue} = this;
            if (idle_task_queue.length > 0) {  // Run remaining task to replace this task's "thread"
                this.runTask(idle_task_queue.shift()!);
            }
        }, reason => {
            this.on_fatal(reason);
            this.stop(false);
        });
        this.active_tasks.add(active_task_ctx);
    }

    addTask(task: AsyncTaskProvider) {
        console.assert(this.run_state !== "stop");
        if (this.run_state == "running" && this.active_tasks.size < this.max_concurrent_tasks) {  // Run the task right now.
            this.runTask(task);
        } else {  // Queue it for when some other task finishes
            this.idle_task_queue.push(task);
        }
    }

    start() {
        console.assert(this.run_state !== "stop");
        const {active_tasks, idle_task_queue} = this;
        for (const active_task of active_tasks) {  // Restart active tasks
            active_task.resume();
        }
        const new_task_count = Math.min(idle_task_queue.length, this.max_concurrent_tasks - active_tasks.size);
        for (let x = 0; x < new_task_count; x++) {
            this.runTask(idle_task_queue.shift()!);
        }
        this.run_state = "running";
    }

    stop(can_resume: boolean) {
        console.assert(this.run_state === "running");
        // Tell tasks to pause
        for (const active_task of this.active_tasks.values()) {
            active_task.pause(can_resume);
        }

        // Clear all internal data if resume is denied.
        if (can_resume) {
            this.run_state = "paused";
        } else {
            this.run_state = "stop";
            this.active_tasks.clear();
            this.idle_task_queue = [];
        }

    }
}

type ActiveTask = {
    resume(): void;
    pause(can_resume: boolean): void;
};
export type AsyncTaskProvider = (finish: () => void, fatal: (reason: string) => void) => ActiveTask;