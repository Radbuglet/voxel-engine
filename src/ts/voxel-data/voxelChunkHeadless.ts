import {MetaContainer} from "../helpers/metaContainer";
import {vec3} from "gl-matrix";
import {CHUNK_BLOCK_SIZE, encodeVertexPos, FaceDefinition} from "./faces";

export class VoxelChunkHeadless<TVoxel> extends MetaContainer {
    public readonly voxels = new Map<number, TVoxel>();
    public neighbor_px?: VoxelChunkHeadless<TVoxel>;
    public neighbor_py?: VoxelChunkHeadless<TVoxel>;
    public neighbor_pz?: VoxelChunkHeadless<TVoxel>;
    public neighbor_nx?: VoxelChunkHeadless<TVoxel>;
    public neighbor_ny?: VoxelChunkHeadless<TVoxel>;
    public neighbor_nz?: VoxelChunkHeadless<TVoxel>;

    getVoxelPointer(pos: vec3): ChunkVoxelPointer<TVoxel> {
        return new ChunkVoxelPointer<TVoxel>(this, pos, encodeVertexPos(pos));
    }
}

export class ChunkVoxelPointer<TVoxel> {
    constructor(private readonly chunk: VoxelChunkHeadless<TVoxel>, public readonly pos: vec3, public readonly encoded_pos: number) {
        this.encoded_pos = encodeVertexPos(pos);
    }

    getNeighbor(face: FaceDefinition): ChunkVoxelPointer<TVoxel> | null {
        const new_pos = vec3.create();
        vec3.add(new_pos, this.pos, face.vec_relative);
        if (new_pos[face.axis.vec_axis] < 0 || new_pos[face.axis.vec_axis] >= CHUNK_BLOCK_SIZE) {  // No longer in the chunk bounds.
            const new_chunk = this.chunk[face.chunk_towards_prop];
            if (new_chunk == null) return null;
            return new ChunkVoxelPointer<TVoxel>(new_chunk, new_pos, encodeVertexPos(new_pos));
        } else {
            return new ChunkVoxelPointer<TVoxel>(this.chunk, new_pos, this.encoded_pos + face.encoded_relative);
        }
    }

    setVoxel(data: TVoxel) {
        this.chunk.voxels.set(this.encoded_pos, data);
    }

    getVoxel() {
        return this.chunk.voxels.get(this.encoded_pos);
    }

    hasVoxel() {
        return this.chunk.voxels.has(this.encoded_pos);
    }
}