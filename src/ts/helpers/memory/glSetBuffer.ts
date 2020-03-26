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
    private buffer_write_idx = 0;

    /**
     * @desc mirrors to buffers values in order and values. Used when resizing the buffer and removing elements.
     */
    private elements_mirror: SetBufferElemInternal[] = [];

    /**
     * @desc returns the number of members of the set. This is the number of words in the set, not the number of bytes.
     */
    get element_count() {
        return this.elements_mirror.length;
    }

    /**
     * @desc Constructs a GlSetManager for a buffer. No buffer is explicitly passed but for all operations who have the
     * precondition that "the target buffer is bound to the ARRAY_BUFFER register", the buffer you decided to manage with
     * this class must be that "target buffer".
     * The buffer's usage should be specified as DYNAMIC_DRAW as this usage mode will be used when we reallocate the buffer
     * during resizing.
     * PRECONDITION: The buffer this class operates on must only be operated on by this manager.
     *
     * @param elem_byte_size: The size in bytes of each element. Must be an integer!
     * @param buffer_capacity: The current capacity of the buffer.
     * @param get_ideal_capacity: A function which returns the ideal capacity in elements for the buffer given required
     * capacity (also in elements count). Useful for allocating a bit more than necessary so that element addition doesn't always
     * require reallocation.
     */
    constructor(
        private readonly elem_byte_size: number,
        private buffer_capacity: number,
        private readonly get_ideal_capacity: IdealCapacityGetter
    ) {}

    /**
     * @desc Adds one or more elements to the set and returns their CPU mirrored references. The method will resize the buffer
     * if the buffer's capacity is too small to accommodate the new elements. Throughout the insertion, handle_new_ref() will
     * be called for every new element reference it generates. If the operation fails, false will be returned at the end but
     * it will be the user's responsibility to undo actions performed in handle_new_ref() as well as on other CPU copies
     * not managed by this class as these function calls happen before the exception may be thrown.
     * If everything ran smoothly, true is returned.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @param elements_view: An buffer containing the elements to add in contiguous memory. Each element in the buffer is
     * of the specified word size and thus the buffer's length must be a multiple of the word size. Subarrays of buffers
     * are currently not supported. The element buffer may not be mutated after being added to the set.
     * @param handle_new_ref: A method called during the insertion of the elements. See description for warnings about
     * its usage.
     */
    addElementsExternRefHandle(gl: GlCtx, elements_view: TypedArray, handle_new_ref: (idx_in_upload: number, elem_ref: SetBufferElem) => void): boolean {
        const { elem_byte_size, elements_mirror } = this;
        const insertion_root_idx = this.buffer_write_idx;
        console.assert(elements_view.byteLength % elem_byte_size == 0);

        // Add the new elements to the CPU mirror; generate reference array for external uses.
        {
            const elem_size_in_view = elem_byte_size / elements_view.BYTES_PER_ELEMENT;
            let idx_in_upload = 0;
            for (let iterator_view_idx = 0; iterator_view_idx < elements_view.byteLength / elements_view.BYTES_PER_ELEMENT; iterator_view_idx += elem_byte_size / elements_view.BYTES_PER_ELEMENT) {
                const element_cpu_ref: SetBufferElemInternal = {
                    owner_set: this,
                    cpu_index: elements_mirror.length,
                    gpu_root_idx: this.buffer_write_idx,
                    subarray_buffer: elements_view.subarray(iterator_view_idx, iterator_view_idx + elem_size_in_view),
                };
                elements_mirror.push(element_cpu_ref);
                handle_new_ref(idx_in_upload, element_cpu_ref);
                this.buffer_write_idx += elem_byte_size;
                idx_in_upload++;
            }
        }

        // Update GPU buffer
        if (this.buffer_write_idx > this.buffer_capacity) {  // We need to resize the array.
            return this.resizeCapacity(gl);  // By rewriting array data to the new location, we effectively upload the new data so we can stop here.
        } else {  // There's still space in the buffer meaning we should just modify using bufferSubData()
            gl.bufferSubData(gl.ARRAY_BUFFER, insertion_root_idx, elements_view);
            return true;
        }
    }

    /**
     * @desc Wraps addElementsExternRefHandle and caches the created references in an array, returning them if the operation
     * is successful and returning null if the operation failed.
     * Same restrictions, preconditions and warnings apply.
     */
    addElements(gl: GlCtx, elements_view: TypedArray) {
        const elements: SetBufferElem[] = new Array(elements_view.byteLength / this.elem_byte_size);
        if (this.addElementsExternRefHandle(gl, elements_view, (idx, ref) => {
            elements[idx] = ref;
        })) {
            return elements;
        } else {
            return null;
        }
    }

    /**
     * @desc Removes an element from the set. No buffer capacity resizing is ever done by this method.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @param removed_element: The element to be removed.
     */
    removeElement(gl: GlCtx, removed_element: SetBufferElemInternal) {
        const { elements_mirror, elem_byte_size } = this;
        console.assert(removed_element.owner_set == this);
        const last_element_index = elements_mirror.length - 1;
        const last_element = elements_mirror[last_element_index];

        // Move last element of array into the slot where the removed element resided to fill the gap. No need to remove the old last_element values.
        if (last_element != removed_element) gl.bufferSubData(gl.ARRAY_BUFFER, removed_element.gpu_root_idx, last_element.subarray_buffer);
        last_element.gpu_root_idx = removed_element.gpu_root_idx;
        this.buffer_write_idx -= elem_byte_size;

        // Update CPU mirror
        this.elements_mirror[removed_element.cpu_index] = last_element;  // Perform the same move on the CPU mirror. No need to check for whether or not this is necessary as the runtime tax is minimal.
        this.elements_mirror.splice(last_element_index, 1);  // Removing the duplicate element in the CPU mirror is necessary however because we're using lists, not arrays.
        last_element.cpu_index = removed_element.cpu_index;  // Steal the index from the element it replaced.

        removed_element.owner_set = undefined;
    }

    /**
     * @desc Modifies the data of an element.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @param element: The element to be modified.
     * @param data_view: The new contents of the element. May not be a subarray and must be the size of one element in bytes.
     */
    setElement(gl: GlCtx, element: SetBufferElemInternal, data_view: TypedArray) {
        console.assert(element.owner_set == this);
        console.assert(data_view.byteLength == this.elem_byte_size);
        gl.bufferSubData(gl.ARRAY_BUFFER, element.gpu_root_idx, data_view);
        element.subarray_buffer = data_view;
    }

    /**
     * @desc forces the buffer to be resized to the ideal capacity, as determined by the get_ideal_capacity() hook.
     * This method will never resize the buffer below the length of the data stored.
     * PRECONDITION: This method expects that the target buffer is bound to the ARRAY_BUFFER register.
     * @param gl: The WebGL context used by the target buffer.
     * @returns a boolean representing the success state. If true, the buffer was resized.
     * If false, the buffer wasn't able to be resized due to a gl.OUT_OF_MEMORY exception.
     *
     * Note: by itself, resizeCapacity() will NOT corrupt the CPU mirror if this action is unsuccessful.
     * However, methods relying on resizeCapacity() might need to handle this error and undo any of their CPU mirrored
     * state changes.
     */
    resizeCapacity(gl: GlCtx): boolean {
        const { elem_byte_size, element_count } = this;
        // Figure out new buffer capacity size
        const new_capacity = GlSetBuffer.getIdealCapacityBytes(elem_byte_size, element_count, this.get_ideal_capacity);  // Capacity is in bytes, despite get_ideal_capacity returning words.
        if (new_capacity == this.buffer_capacity) return true;  // Nothing will change so we ignore this operation.

        // Generate data buffer to upload
        const rewrite_data_buffer = new Uint8Array(new_capacity);
        {
            let write_idx = 0;
            for (const element of this.elements_mirror) {
                const element_data_view = readTypedArrayBytes(element.subarray_buffer);
                for (let byte_idx = 0; byte_idx < element_data_view.byteLength; byte_idx++) {
                    rewrite_data_buffer[write_idx + byte_idx] = element_data_view[byte_idx];
                }
                write_idx += elem_byte_size;
            }
        }

        // Upload it!
        try {
            gl.bufferData(gl.ARRAY_BUFFER, rewrite_data_buffer, gl.DYNAMIC_DRAW);
            this.buffer_capacity = new_capacity;
            return true;
        } catch {
            return false;
        }
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