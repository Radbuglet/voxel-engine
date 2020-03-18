import {vec3} from "gl-matrix";
import {CHUNK_BLOCK_SIZE, encodeVertexPos, FaceDefinition} from "./faces";
import {TGeneric_VoxelHeadless} from "./voxelWorldHeadless";

export interface ProvidesVoxelChunkHeadless<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> {
    voxel_chunk_headless: VoxelChunkHeadless<TGeneric>;
}

export class VoxelChunkHeadless<TGeneric extends TGeneric_VoxelHeadless<TGeneric>>{
    public readonly voxels = new Map<number, TGeneric["voxel"]>();
    public neighbor_px?: TGeneric["chunk"];
    public neighbor_py?: TGeneric["chunk"];
    public neighbor_pz?: TGeneric["chunk"];
    public neighbor_nx?: TGeneric["chunk"];
    public neighbor_ny?: TGeneric["chunk"];
    public neighbor_nz?: TGeneric["chunk"];

    getVoxelPointer(pos: vec3): ChunkVoxelPointer<TGeneric["voxel"]> {
        return new ChunkVoxelPointer<TGeneric>(this, pos, encodeVertexPos(pos));
    }

    get voxel_chunk_headless() {
        return this;
    }
}

export class ChunkVoxelPointer<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> {
    constructor(public readonly chunk: TGeneric["chunk"], public pos: vec3, public encoded_pos: number) {
        this.encoded_pos = encodeVertexPos(pos);
    }

    getNeighbor(face: FaceDefinition): ChunkVoxelPointer<TGeneric> | null {
        const new_pos = vec3.create();
        vec3.add(new_pos, this.pos, face.vec_relative);
        if (new_pos[face.axis.vec_axis] < 0 || new_pos[face.axis.vec_axis] >= CHUNK_BLOCK_SIZE) {  // No longer in the chunk bounds.
            const new_chunk = this.chunk.voxel_chunk_headless[face.chunk_towards_prop];
            if (new_chunk == null) return null;
            return new ChunkVoxelPointer<TGeneric>(new_chunk, new_pos, encodeVertexPos(new_pos));
        } else {
            return new ChunkVoxelPointer<TGeneric>(this.chunk, new_pos, this.encoded_pos + face.encoded_relative);
        }
    }

    setData(data: TGeneric["voxel"]) {
        this.chunk.voxel_chunk_headless.voxels.set(this.encoded_pos, data);
    }

    getData() {
        return this.chunk.voxel_chunk_headless.voxels.get(this.encoded_pos);
    }

    hasVoxel() {
        return this.chunk.voxel_chunk_headless.voxels.has(this.encoded_pos);
    }

    moveTo(chunk_pos: vec3) {
        this.encoded_pos = encodeVertexPos(chunk_pos);
        this.pos = chunk_pos;
    }
}