/**
 * @desc A class that tracks a countdown and calls a countdown finished event exactly once.
 * Used in coordination with ContinuousTaskQueue in order to implement a resource loader.
 */
export class CountdownController {
    public is_finished: boolean = false;

    /**
     * @desc Constructs a CountdownController
     * Even if the initial value should trigger the on_finished event, this is ignored until the first decrement.
     * @param value: The initial count of the counter.
     * @param on_finished: The event to be called once the counter reaches zero.
     */
    constructor(private value: number, private readonly on_finished: () => void) {
        console.assert(this.value >= 0);
    }

    /**
     * @desc Adds one to the counter.
     * NOTE: If on_finished has already been called, this method cannot be called again.
     */
    add() {
        console.assert(!this.is_finished);
        this.value++;
    }

    /**
     * @desc Decrements one from the counter.
     * NOTE: If on_finished has already been called, this method cannot be called again.
     */
    dec() {
        console.assert(!this.is_finished);
        this.value--;
        if (this.value < 0) {
            this.on_finished();
            this.is_finished = true;
        }
    }
}