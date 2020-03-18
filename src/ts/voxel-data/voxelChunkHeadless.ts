import {vec3} from "gl-matrix";
import {CHUNK_BLOCK_COUNT, encodeVertexPos, FaceDefinition, FaceKey} from "./faces";
import {TGeneric_VoxelHeadless} from "./voxelWorldHeadless";

export interface ProvidesVoxelChunkHeadless<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> {
    voxel_chunk_headless: VoxelChunkHeadless<TGeneric>;
}

/**
 * @desc Stores voxel data for a single chunk of size CHUNK_BLOCK_COUNT x CHUNK_BLOCK_COUNT x CHUNK_BLOCK_COUNT.
 * Voxel data can be anything. Provides ability to procure voxel pointers for voxels inside this chunk for reading data about
 * that voxel and its neighbors.
 */
export class VoxelChunkHeadless<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> implements ProvidesVoxelChunkHeadless<TGeneric> {
    /**
     * @desc Stores all voxels in the chunk. Uses encoded chunk positions.
     */
    public readonly voxels = new Map<number, TGeneric["voxel"]>();

    /**
     * @desc A map of neighboring chunks for use in ChunkVoxelPointers. **Do not touch!**
     */
    public readonly neighbors = new Map<FaceKey, ProvidesVoxelChunkHeadless<TGeneric>>();

    /**
     * @desc Constructs a new voxel pointer for a voxel in this chunk.
     * @param rel_pos: Position of voxel in chunk relative space.
     */
    getVoxelPointer(rel_pos: vec3): ChunkVoxelPointer<TGeneric["voxel"]> {
        return new ChunkVoxelPointer<TGeneric>(this, rel_pos, encodeVertexPos(rel_pos));
    }

    /**
     * @desc Loopback getter for compliance with the ProvidesVoxelChunkHeadless interface.
     */
    get voxel_chunk_headless() {
        return this;
    }
}

/**
 * @desc Points towards a voxel in a chunk. All actions performed by this vector only happen on the voxel data object and
 * nothing else gets updated automatically.
 */
export class ChunkVoxelPointer<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> {
    constructor(public readonly chunk: TGeneric["chunk"], public pos: vec3, public encoded_pos: number) {
        this.encoded_pos = encodeVertexPos(pos);
    }

    /**
     * @desc Returns the neighboring voxel on a specified face. Will return a new pointer unless the voxel is in a neighboring
     * chunk which doesn't exist. This voxel may or may not exist in the chunk data.
     * @param face: The neighboring face you wish to query.
     */
    getNeighbor(face: FaceDefinition): ChunkVoxelPointer<TGeneric> | null {
        const new_pos = vec3.create();
        vec3.add(new_pos, this.pos, face.vec_relative);
        if (new_pos[face.axis.vec_axis] < 0 || new_pos[face.axis.vec_axis] >= CHUNK_BLOCK_COUNT) {  // No longer in the chunk bounds.
            const new_chunk = this.chunk.voxel_chunk_headless.neighbors.get(face.towards_key);
            if (new_chunk == null) return null;
            return new ChunkVoxelPointer<TGeneric>(new_chunk, new_pos, encodeVertexPos(new_pos));
        } else {
            return new ChunkVoxelPointer<TGeneric>(this.chunk, new_pos, this.encoded_pos + face.encoded_relative);
        }
    }

    /**
     * @desc Sets value for voxel currently pointed at, "creating" the voxel if it does not already exist.
     * @param data: The data of user-defined type.
     */
    setData(data: TGeneric["voxel"]) {
        this.chunk.voxel_chunk_headless.voxels.set(this.encoded_pos, data);
    }

    /**
     * @desc Returns the data for the voxel being pointed at or "undefined" if the voxel doesn't exist.
     */
    getData() {
        return this.chunk.voxel_chunk_headless.voxels.get(this.encoded_pos);
    }

    /**
     * @desc Checks if the chunk has the voxel being pointed at.
     */
    hasVoxel() {
        return this.chunk.voxel_chunk_headless.voxels.has(this.encoded_pos);
    }

    /**
     * @desc Removes the voxel being pointed at from the chunk.
     * Fails silently if the voxel doesn't exist.
     */
    removeVoxel() {
        this.chunk.voxel_chunk_headless.voxels.delete(this.encoded_pos);
    }

    /**
     * @desc Makes the pointer point at a new voxel in the same chunk (modifies pointer instance).
     * @param chunk_pos: Position of target voxel in chunk relative space.
     */
    moveTo(chunk_pos: vec3) {
        this.encoded_pos = encodeVertexPos(chunk_pos);
        this.pos = chunk_pos;
    }
}