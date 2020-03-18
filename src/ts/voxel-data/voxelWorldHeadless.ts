import {ProvidesVoxelChunkHeadless} from "./voxelChunkHeadless";
import {vec3} from "gl-matrix";
import {FACE_LIST, FaceDefinition} from "./faces";

// TODO: Document, review, and optimize everything in this module!
export type TGeneric_VoxelHeadless<TData extends TGeneric_VoxelHeadless<TData>> = {  // This type is for compile time generic specification only.
   voxel: any,
   chunk: ProvidesVoxelChunkHeadless<TData>
};
export class VoxelWorldHeadless<TGeneric extends TGeneric_VoxelHeadless<TGeneric>> {
    private readonly chunks = new Map<string, TGeneric["chunk"]>();

    private static encodeChunkPosition(pos: vec3) {
        return pos[0] + "@" + pos[1] + "@" + pos[2];
    }

    private processNeighbors(pos: vec3, handle_neighbor: (face: FaceDefinition, neighbor_chunk: TGeneric["chunk"]) => void) {
        const { chunks } = this;
        const neighbor_lookup_vec = vec3.create();
        for (const face of FACE_LIST) {
            vec3.add(neighbor_lookup_vec, pos, face.vec_relative);
            const neighbor_chunk = chunks.get(VoxelWorldHeadless.encodeChunkPosition(neighbor_lookup_vec));
            if (neighbor_chunk == null) continue;
            handle_neighbor(face, neighbor_chunk);
        }
    }

    iterChunks(): IterableIterator<TGeneric["chunk"]> {
        return this.chunks.values();
    }

    makeChunk(pos: vec3, blank_chunk: TGeneric["chunk"]): TGeneric["chunk"] {
        const { chunks } = this;
        const encoded_pos = VoxelWorldHeadless.encodeChunkPosition(pos);
        console.assert(!chunks.has(encoded_pos));
        chunks.set(encoded_pos, blank_chunk);
        this.processNeighbors(pos, (face, neighbor_chunk) => {
            blank_chunk.voxel_chunk_headless[face.chunk_towards_prop] = neighbor_chunk;
            neighbor_chunk.voxel_chunk_headless[face.chunk_inverse_prop] = blank_chunk;
        });
        return blank_chunk;
    }

    getChunk(chunk_pos: vec3): TGeneric["chunk"] | undefined {
        return this.chunks.get(VoxelWorldHeadless.encodeChunkPosition(chunk_pos));
    }

    deleteChunk(pos: vec3) {
        const { chunks } = this;
        const encoded_pos = VoxelWorldHeadless.encodeChunkPosition(pos);
        console.assert(chunks.has(encoded_pos));
        chunks.delete(encoded_pos);
        this.processNeighbors(pos, (face, neighbor_chunk) => {
            neighbor_chunk.voxel_chunk_headless[face.chunk_inverse_prop] = undefined;
        });
    }
}