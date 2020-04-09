import {vec3} from "gl-matrix";
import {VoxelWorldData} from "./voxelWorldData";
import {IVoxelChunkDataWrapper, VoxelChunkPointer} from "./voxelChunkData";
import {limitPrecision} from "../utils/scalar";
import {CHUNK_BLOCK_COUNT, FACE_AXIS_AND_SIGN_MAP} from "./faces";

export class VoxelRayCaster<TChunk extends IVoxelChunkDataWrapper<TChunk, TVoxel>, TVoxel> {
    private state: { type: "tracking", pointer: VoxelChunkPointer<TChunk, TVoxel>, position: vec3 } | { type: "floating", position: vec3 };

    /**
     * @constructor Constructs a ray that works on a given world and starts at a given position. This class does not
     * perform ray termination automatically as this task is up to the external scope.
     * @param world_data: The world data to be operated on.
     * @param ref_position: The starting position of the ray. THIS VECTOR WILL BE MODIFIED!!!
     */
    constructor(private readonly world_data: VoxelWorldData<TChunk, TVoxel>, ref_position: vec3) {
        const pointer = world_data.getVoxelPointer(ref_position);
        this.state = pointer != null ?
            { type: "tracking", position: ref_position, pointer } :
            { type: "floating", position: ref_position };
    }

    /**
     * @desc Performs a step over the direction.
     * NOTE: World chunks MUST NOT be modified while a VoxelRayCaster is working.
     * @param step_delta: The delta of the step. Must be normalized as non-normalized step deltas cause undefined behavior.
     */
    step(step_delta: vec3): VoxelChunkPointer<TChunk, TVoxel> | null {
        const {state} = this;

        // Update pos. Return early if the new pointer can be found using a "cheap" strategy.
        if (state.type === "tracking") {
            for (let axis = 0; axis < 3; axis++) {
                const old_value = state.position[axis];
                state.position[axis] += step_delta[axis];
                if (limitPrecision(old_value, 1) != limitPrecision(state.position[axis], 1)) {  // We moved out of the block on this axis.
                    // Try to find the neighboring voxel using the "cheap" strategy.
                    const neighbor_pointer = state.pointer.getNeighbor(
                        FACE_AXIS_AND_SIGN_MAP[axis][step_delta[axis] > 0 ? "positive" : "negative"]);
                    if (neighbor_pointer != null) {
                        state.pointer = neighbor_pointer;
                    } else {
                        this.state = { type: "floating", position: state.position };
                        break;  // Setup the state as floating because we moved outside of loaded chunks.
                        // We still need to run through the function till the "long way" section which is why we break
                        // instead of returning null.
                    }
                }
            }
        } else {
            let new_chunk = false;
            for (let axis = 0; axis < 3; axis++) {
                // Add vectors
                const old_value = state.position[axis];
                state.position[axis] += step_delta[axis];

                // Detect if we've moved to another chunk
                if (!new_chunk && limitPrecision(old_value, CHUNK_BLOCK_COUNT) !== limitPrecision(state.position[axis], CHUNK_BLOCK_COUNT))
                    new_chunk = true;
            }

            if (!new_chunk) return null;  // We know the pointer is still null because we haven't crossed a chunk boundary and the current chunk is still non-existent.
        }

        // Attempts to re-track a voxel pointer using the "long way" involving map lookups.
        const pointer = this.world_data.getVoxelPointer(state.position);
        if (pointer != null) this.state = { type: "tracking", pointer, position: state.position };
        return pointer;
    }
}