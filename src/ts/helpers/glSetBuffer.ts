// Welcome to the intersection between GPU programming and algorithm programming ie. debugging hell
import {GlCtx} from "./typescript/aliases";

type SetBufferElemInternal = {
    cpu_index: number
    gpu_root_idx: number,
    buffer_val: ArrayBuffer,
    owner_set?: GlSetBuffer
};
export type SetBufferElem = Readonly<SetBufferElemInternal>;

// TODO: Optimize resize bandwidth with WebGl2 GPU copying
// TODO: Make resizing more efficient on the CPU
// TODO: Make abstraction WebGl error tolerant.
// TODO: Optimize using DataViews.
export class GlSetBuffer {
    /**
     * @desc represents the number of bytes in the array. Also serves as the index to the root of any concat operation.
     * storage_write_idx and stored_data update in tandem.
     */
    private storage_write_idx = 0;

    /**
     * @desc mirrors to buffers values in order and values. Used when resizing the buffer and removing elements.
     */
    private stored_data_mirror: SetBufferElemInternal[] = [];

    /**
     * @desc PRECONDITION: The buffer this class operates on must be empty and is only operated on by this manager.
     * The buffer's usage should be specified as DYNAMIC_DRAW as this usage mode will be used when we reallocate the buffer during resizing.
     * @param gl: A WebGL context
     * @param elem_word_size: The size in bytes of each element.
     * @param buffer_capacity: The current capacity of the buffer.
     * @param get_ideal_capacity: Returns the ideal capacity for the buffer for a given required capacity.
     * Useful for allocating a bit more than necessary so that element addition doesn't always require reallocation.
     */
    constructor(
        private readonly gl: GlCtx,
        private readonly elem_word_size: number,
        private buffer_capacity: number,
        private readonly get_ideal_capacity: (required_capacity: number) => number
    ) {}

    /**
     * @desc Adds one or more elements to the set and returns their CPU mirrored references. The method will resize the buffer
     * if the buffer's capacity is too small to accommodate the new elements.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param elements_data: An array of element buffers. Each element buffer must be of the proper word size!
     */
    addData(elements_data: ArrayBuffer[]): SetBufferElem[] {
        const { gl, stored_data_mirror, elem_word_size } = this;
        const bytes_required = elements_data.length * this.elem_word_size;
        type StrategyState = {
            type: "resize"
        } | {
            type: "sub_add",
            data_write_root: number,
            data_write_buffer: Uint8Array,
            buffer_copy_idx: number
        };
        const strategy_state: StrategyState = this.storage_write_idx + bytes_required > this.buffer_capacity ? {
            type: "resize"
        } : {
            type: "sub_add",
            data_write_root: this.storage_write_idx,
            data_write_buffer: new Uint8Array(bytes_required),
            buffer_copy_idx: 0
        };

        // Add the new elements to the CPU mirror; generate reference array for external uses.
        const element_references = elements_data.map(elem_buffer => {
            // Validate this element
            console.assert(elem_buffer.byteLength == elem_word_size);

            // Store element to CPU buffer mirror
           const elem_ref: SetBufferElemInternal =  {
               cpu_index: stored_data_mirror.length,
               gpu_root_idx: this.storage_write_idx,
               buffer_val: elem_buffer,
               owner_set: this
           };
           this.stored_data_mirror.push(elem_ref);
           this.storage_write_idx += elem_word_size;

           // Copy element to continuous block of memory if we're using the bufferSubData appending strategy.
            if (strategy_state.type == "sub_add") {
                const byte_view = new Uint8Array(elem_buffer);
                const { buffer_copy_idx, data_write_buffer } = strategy_state;
                for (let byte = 0; byte < elem_word_size; byte++) {
                    data_write_buffer[buffer_copy_idx + byte] = byte_view[byte];
                }
            }

           return elem_ref;
        });

        // Update GPU buffer
        if (strategy_state.type == "resize") {  // Resize array. By rewriting array data to the new location, we effectively upload the new data so we can stop here.
            this.resizeCapacity();
        } else {  // There's still capacity meaning we should just do a bufferSubData() modify
            gl.bufferSubData(gl.ARRAY_BUFFER, strategy_state.data_write_root, strategy_state.data_write_buffer);
        }

        return element_references;
    }

    /**
     * @desc Removes an element from the set. No buffer capacity resizing is ever done by this method.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param removed_elem: The element to be removed.
     */
    removeData(removed_elem: SetBufferElemInternal) {
        const { gl, stored_data_mirror } = this;
        console.assert(removed_elem.owner_set == this);
        const last_element_index = stored_data_mirror.length - 1;
        const last_element = stored_data_mirror[last_element_index];

        // Move last element of array into the slot where the removed element resided to fill the gap. No need to remove the old last_element values.
        if (last_element != removed_elem) gl.bufferSubData(gl.ARRAY_BUFFER, removed_elem.gpu_root_idx, last_element.buffer_val);
        last_element.gpu_root_idx = removed_elem.gpu_root_idx;

        // Update CPU mirror
        this.stored_data_mirror[removed_elem.cpu_index] = last_element;  // Perform the same move on the CPU mirror. No need to check for whether or not this is necessary as the runtime tax is minimal.
        this.stored_data_mirror.splice(last_element_index - 1, 1);  // Removing the duplicate element in the CPU mirror is necessary however because we're using lists, not arrays.
        this.storage_write_idx -= this.elem_word_size;
        last_element.cpu_index = removed_elem.cpu_index;  // Steal the index from the element it replaced.
        removed_elem.owner_set = undefined;
    }

    /**
     * @desc forces the buffer to be resized to the ideal capacity, as determined by the get_ideal_capacity() hook.
     * This method will never resize the buffer below the length of the data stored.
     */
    resizeCapacity() {
        const { gl, elem_word_size } = this;
        // Figure out new buffer capacity size
        const capacity = Math.max(this.storage_write_idx, this.get_ideal_capacity(this.storage_write_idx));
        if (capacity == this.buffer_capacity) return;  // Nothing will change.

        // Generate data buffer to upload
        const rewrite_data_buffer = new Uint8Array(capacity);
        {
            let write_idx = 0;
            for (const element of this.stored_data_mirror) {
                const element_data_view = new Uint8Array(element.buffer_val);  // Uint8Array is just a view class used to read the contents of a buffer. Nothing (besides the viewer) is being allocated here.
                for (let byte = 0; byte < element_data_view.byteLength; byte++) {
                    rewrite_data_buffer[write_idx + byte] = element_data_view[byte];
                }
                write_idx += elem_word_size;
            }
        }

        // Upload it!
        gl.bufferData(gl.ARRAY_BUFFER, rewrite_data_buffer, gl.DYNAMIC_DRAW);
    }
}