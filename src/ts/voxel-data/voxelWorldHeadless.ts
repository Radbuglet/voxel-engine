import {VoxelChunkHeadless} from "./voxelChunkHeadless";
import {vec3} from "gl-matrix";
import {MetaContainer} from "../helpers/metaContainer";
import {FACE_LIST, FaceDefinition} from "./faces";

// TODO: Document; optimize everything in this module!
export class VoxelWorldHeadless<TVoxel> extends MetaContainer {
    private readonly chunks = new Map<string, VoxelChunkHeadless<TVoxel>>();

    private static encodeChunkPosition(pos: vec3) {
        return pos[0] + "@" + pos[1] + "@" + pos[2];
    }

    private processNeighbors(pos: vec3, handle_neighbor: (face: FaceDefinition, neighbor_chunk: VoxelChunkHeadless<TVoxel>) => void) {
        const { chunks } = this;
        const neighbor_lookup_vec = vec3.create();
        for (const face of FACE_LIST) {
            vec3.add(neighbor_lookup_vec, pos, face.vec_relative);
            const neighbor_chunk = chunks.get(VoxelWorldHeadless.encodeChunkPosition(neighbor_lookup_vec));
            if (neighbor_chunk == null) continue;
            handle_neighbor(face, neighbor_chunk);
        }
    }

    iterChunks(): IterableIterator<VoxelChunkHeadless<TVoxel>> {
        return this.chunks.values();
    }

    makeChunk(pos: vec3): VoxelChunkHeadless<TVoxel> {
        const { chunks } = this;
        const encoded_pos = VoxelWorldHeadless.encodeChunkPosition(pos);
        console.assert(!chunks.has(encoded_pos));
        const chunk = new VoxelChunkHeadless<TVoxel>();
        chunks.set(encoded_pos, chunk);
        this.processNeighbors(pos, (face, neighbor_chunk) => {
            chunk[face.chunk_towards_prop] = neighbor_chunk;
            neighbor_chunk[face.chunk_inverse_prop] = chunk;
        });
        return chunk;
    }

    getChunk(pos: vec3): VoxelChunkHeadless<TVoxel> | undefined {
        return this.chunks.get(VoxelWorldHeadless.encodeChunkPosition(pos));
    }

    deleteChunk(pos: vec3) {
        const { chunks } = this;
        const encoded_pos = VoxelWorldHeadless.encodeChunkPosition(pos);
        console.assert(chunks.has(encoded_pos));
        chunks.delete(encoded_pos);
        this.processNeighbors(pos, (face, neighbor_chunk) => {
            neighbor_chunk[face.chunk_inverse_prop] = undefined;
        });
    }
}