// Welcome to the intersection between GPU programming and algorithm programming ie. debugging hell
import {GlCtx, TypedArray} from "../typescript/aliases";
import {readTypedArrayBytes} from "./typedArrays";

type IdealCapacityGetter = (required_capacity: number) => number;
type SetBufferElemInternal = {
    owner_set?: GlSetBuffer,
    cpu_index: number,
    gpu_root_idx: number,
    subarray_buffer: TypedArray
};
export type SetBufferElem = Readonly<SetBufferElemInternal>;

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
     * @desc returns the number of members of the set. This is the number of words in the set, not the number of bytes.
     */
    get element_count() {
        return this.stored_data_mirror.length;
    }

    /**
     * @desc Constructs a GlSetManager for a buffer. No buffer is explicitly passed but for all operations who have the
     * precondition that "the target buffer is bound to the ARRAY_BUFFER register", the buffer you decided to manage with
     * this class must be that "target buffer".
     * The buffer's usage should be specified as DYNAMIC_DRAW as this usage mode will be used when we reallocate the buffer
     * during resizing.
     * PRECONDITION: The buffer this class operates on must only be operated on by this manager.
     *
     * @param elem_word_size: The size in bytes of each element. Must be an integer!
     * @param buffer_capacity: The current capacity of the buffer.
     * @param get_ideal_capacity: A function which returns the ideal capacity in elements for the buffer given required
     * capacity (also in elements count). Useful for allocating a bit more than necessary so that element addition doesn't always
     * require reallocation.
     */
    constructor(
        private readonly elem_word_size: number,
        private buffer_capacity: number,
        private readonly get_ideal_capacity: IdealCapacityGetter
    ) {}

    /**
     *desc Adds one or more elements to the set and returns their CPU mirrored references. The method will resize the buffer
     * if the buffer's capacity is too small to accommodate the new elements. If the insertion into the buffer fails, the
     * operation will be cancelled and null will be returned.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @param elements_view: An buffer containing the elements to add in contiguous memory. Each element in the buffer is
     * of the specified word size and thus the buffer's length must be a multiple of the word size.
     * Each element buffer may not be mutated after being added to the set.
     * TODO: Add support for TypedArray being a subarray.
     */
    addElements(gl: GlCtx, elements_view: TypedArray): SetBufferElem[] | null {
        const { elem_word_size, stored_data_mirror } = this;
        const insertion_root_idx = this.storage_write_idx;
        console.assert(elements_view.byteLength % elem_word_size == 0);

        // Add the new elements to the CPU mirror; generate reference array for external uses.
        const element_references: SetBufferElem[] = new Array(elements_view.byteLength / elem_word_size);
        const word_size_in_view = elem_word_size / elements_view.BYTES_PER_ELEMENT;

        let elem_ref_idx = 0;
        for (let elem_idx_in_view = 0; elem_idx_in_view < elements_view.byteLength / elements_view.BYTES_PER_ELEMENT; elem_idx_in_view += elem_word_size / elements_view.BYTES_PER_ELEMENT) {
            const elem_ref: SetBufferElemInternal = {
                owner_set: this,
                cpu_index: stored_data_mirror.length,
                gpu_root_idx: this.storage_write_idx,
                subarray_buffer: elements_view.subarray(elem_idx_in_view, elem_idx_in_view + word_size_in_view),
            };
            stored_data_mirror.push(elem_ref);
            element_references[elem_ref_idx] = elem_ref;
            this.storage_write_idx += elem_word_size;
            elem_ref_idx++;
        }

        // Update GPU buffer
        try {
            if (this.storage_write_idx > this.buffer_capacity) {  // We need to resize the array.
                this.resizeCapacity(gl);  // By rewriting array data to the new location, we effectively upload the new data so we can stop here.
            } else {  // There's still space in the buffer meaning we should just modify using bufferSubData()
                gl.bufferSubData(gl.ARRAY_BUFFER, insertion_root_idx, elements_view);
            }
            return element_references;
        } catch (e) {  // Restore the CPU mirror to its previous state if the GPU insertion failed, effectively cancelling the operation.
            stored_data_mirror.length = stored_data_mirror.length - element_references.length;  // Yup, this actually works like you'd expect it to.
            this.storage_write_idx = insertion_root_idx;  // Since this value was copied before any modification happened, we can use it for this purpose as well.
            return null;
        }
    }

    /**
     * @desc Removes an element from the set. No buffer capacity resizing is ever done by this method.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @param removed_elem: The element to be removed.
     */
    removeElement(gl: GlCtx, removed_elem: SetBufferElemInternal) {
        const { stored_data_mirror, elem_word_size } = this;
        console.assert(removed_elem.owner_set == this);
        const last_element_index = stored_data_mirror.length - 1;
        const last_element = stored_data_mirror[last_element_index];

        // Move last element of array into the slot where the removed element resided to fill the gap. No need to remove the old last_element values.
        if (last_element != removed_elem) gl.bufferSubData(gl.ARRAY_BUFFER, removed_elem.gpu_root_idx, last_element.subarray_buffer);
        last_element.gpu_root_idx = removed_elem.gpu_root_idx;
        this.storage_write_idx -= elem_word_size;

        // Update CPU mirror
        this.stored_data_mirror[removed_elem.cpu_index] = last_element;  // Perform the same move on the CPU mirror. No need to check for whether or not this is necessary as the runtime tax is minimal.
        this.stored_data_mirror.splice(last_element_index, 1);  // Removing the duplicate element in the CPU mirror is necessary however because we're using lists, not arrays.
        last_element.cpu_index = removed_elem.cpu_index;  // Steal the index from the element it replaced.

        removed_elem.owner_set = undefined;
    }

    /**
     * @desc forces the buffer to be resized to the ideal capacity, as determined by the get_ideal_capacity() hook.
     * This method will never resize the buffer below the length of the data stored.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @throws gl.OUT_OF_MEMORY. Note: by itself, resizeCapacity() will NOT corrupt the CPU mirror if this is thrown.
     * However, methods relying on resizeCapacity() might need to handle this error and undo any of their CPU mirrored
     * state changes.
     */
    resizeCapacity(gl: GlCtx) {
        const { elem_word_size, element_count } = this;
        // Figure out new buffer capacity size
        const capacity = GlSetBuffer.getIdealCapacityBytes(elem_word_size, element_count, this.get_ideal_capacity);  // Capacity is in bytes, despite get_ideal_capacity returning words.
        if (capacity == this.buffer_capacity) return;  // Nothing will change so we ignore this operation.

        // Generate data buffer to upload
        const rewrite_data_buffer = new Uint8Array(capacity);
        {
            let write_idx = 0;
            for (const element of this.stored_data_mirror) {
                const element_data_view = readTypedArrayBytes(element.subarray_buffer);
                for (let byte_idx = 0; byte_idx < element_data_view.byteLength; byte_idx++) {
                    rewrite_data_buffer[write_idx + byte_idx] = element_data_view[byte_idx];
                }
                write_idx += elem_word_size;
            }
        }

        // Upload it!
        gl.bufferData(gl.ARRAY_BUFFER, rewrite_data_buffer, gl.DYNAMIC_DRAW);
        this.buffer_capacity = capacity;
    }

    /**
     * @desc Prepares the buffer by initializing the buffer's capacity to the ideal capacity and constructs a new GlSetBuffer
     * for the provided buffer. All arguments except "gl" are relayed to the constructor. See the constructor for more
     * information on the requirements for the parameters.
     * PRECONDITION: The target buffer (implied. No actual buffer is ever passed) must be bound to the ARRAY_BUFFER WebGL register.
     */
    static prepareBufferAndConstruct(gl: GlCtx, elem_word_size: number, get_ideal_capacity: IdealCapacityGetter) {
        const initial_capacity = GlSetBuffer.getIdealCapacityBytes(elem_word_size, 0, get_ideal_capacity);
        gl.bufferData(gl.ARRAY_BUFFER, initial_capacity, gl.DYNAMIC_DRAW);
        return new GlSetBuffer(elem_word_size, initial_capacity, get_ideal_capacity);
    }

    private static getIdealCapacityBytes(elem_word_size: number, element_count: number, get_ideal_capacity: IdealCapacityGetter): number {
        return elem_word_size * Math.floor(Math.max(element_count, get_ideal_capacity(element_count)));
    }
}