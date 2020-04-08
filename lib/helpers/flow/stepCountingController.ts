export type SCCStatusUpdateHandler = (completed: number, total: number) => void;

export class StepCountingController {
    public finished_steps = 0;

    /**
     * @constructor Creates a new StepStatusController where the once_finished event is called exactly once
     * when all registered steps have been finished.
     * @param total_steps: The initial number of steps that need to be completed. This number may be increased through addStep().
     * NOTE: If the total steps is registered at zero, no event will be called notifying that "all steps have been completed"
     * because steps can be registered later.
     * @param step_status_updated: An event called every time a step is completed or registered. Useful for progress bars.
     * NOTE: This event is always called before once_finished is.
     * @param once_finished: A callback that is only called a single time once all steps have been completed.
     */
    constructor(
            public total_steps: number,
            public readonly step_status_updated: SCCStatusUpdateHandler,
            public readonly once_finished: () => void)
    {}

    /**
     * @desc Registers a new step that need to be completed in order to call once_finished.
     * NOTE: This method may not be called once the event has been called ie once all steps have been completed,
     * no more steps can be registered.
     */
    addStep() {
        console.assert(this.finished_steps !== this.total_steps || this.total_steps === 0, "LockStepController emitted event already. No more steps can be added.");
        this.total_steps++;
        this.updateStatus();
    }

    /**
     * @desc Marks a step as finished. You may not mark more steps as finished than steps you have registered.
     * This effectively makes this method impossible to call once all steps have been completed as no new tasks have been
     * registered.
     * The once_finished event can ONLY be called as a result of this method.
     */
    finishStep() {
        console.assert(this.finished_steps < this.total_steps, "More steps reported as finished than registered.");
        this.finished_steps++;
        this.updateStatus();
        if (this.finished_steps === this.total_steps) {
            this.once_finished();
        }
    }

    private updateStatus() {
        this.step_status_updated(this.finished_steps, this.total_steps);
    }
}