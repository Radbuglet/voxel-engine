import {IVoxelChunkDataWrapper, VoxelChunkPointer} from "./voxelChunkData";
import {vec3} from "gl-matrix";
import {CHUNK_BLOCK_COUNT, FaceDefinition, FACES_LIST} from "./faces";
import {signedModulo} from "../utils/scalar";

/**
 * @desc Contains the voxel data chunks and ensures that they get properly updated.
 * This object manages anything that provides this class its corresponding voxel chunk data objects.
 * Additionally, the voxels you store in this system can be any type you want.
 */
export class VoxelWorldData<TChunkWrapper extends IVoxelChunkDataWrapper<TChunkWrapper, TVoxel>, TVoxel> {
    private readonly chunks = new Map<string, TChunkWrapper>();

    private static encodeChunkPosition(pos: vec3) {
        return pos[0] + "@" + pos[1] + "@" + pos[2];
    }

    /**
     * @desc Provides an iterator for chunks in no specific order.
     */
    iterChunks(): IterableIterator<TChunkWrapper> {
        return this.chunks.values();
    }

    /**
     * @desc Adds a chunk to the container.
     * @param chunk_pos: The chunk's position (in world chunk space ie "world_pos/CHUNK_BLOCK_COUNT", not world voxel space)
     * @param added_chunk: An instance of a chunk that isn't tracked by anything else.
     */
    putChunk(chunk_pos: vec3, added_chunk: TChunkWrapper): TChunkWrapper {
        const {chunks} = this;
        const encoded_pos = VoxelWorldData.encodeChunkPosition(chunk_pos);
        console.assert(!chunks.has(encoded_pos));
        chunks.set(encoded_pos, added_chunk);

        const new_chunk_neighbor_map = added_chunk.voxel_chunk_data.neighbors;
        this.processNeighbors(chunk_pos, (face, neighbor_chunk) => {
            new_chunk_neighbor_map.set(face.towards_key, neighbor_chunk);
            neighbor_chunk.voxel_chunk_data.neighbors.set(face.inverse_key, added_chunk);
        });
        return added_chunk;
    }

    /**
     * @desc Fetches a chunk from the container.
     * @param chunk_pos: The chunk's position in chunk world space (see above)
     */
    getChunk(chunk_pos: vec3): TChunkWrapper | undefined {
        return this.chunks.get(VoxelWorldData.encodeChunkPosition(chunk_pos));
    }

    /**
     * @desc Removes a chunk from the container. Correctly updates the neighboring chunks but not the chunk being removed.
     * @param chunk_pos: The chunk's position in world chunk space (see above)
     */
    deleteChunk(chunk_pos: vec3) {
        const {chunks} = this;
        const encoded_pos = VoxelWorldData.encodeChunkPosition(chunk_pos);
        console.assert(chunks.has(encoded_pos));
        chunks.delete(encoded_pos);
        this.processNeighbors(chunk_pos, (face, neighbor_chunk) => {
            neighbor_chunk.voxel_chunk_data.neighbors.delete(face.inverse_key);
        });
    }

    /**
     * @desc Gets the voxel pointer in world space.
     * Returns a pointer if the chunk exists (regardless of if the voxel actually has any data or not) and null
     * if the chunk the voxel pertains to is non-existent.
     * @param voxel_pos: The position of the voxel IN WORLD VOXEL SPACE.
     * @param ref_pos_wcs: The optional vector to be written to with the chunk position in WORLD CHUNK SPACE. Also used
     * to reuse a vector to avoid reallocating new memory.
     * @param ref_pos_crs: The optional vector to be written to with the chunk position in CHUNK RELATIVE SPACE. Also used
     * to reuse a vector to avoid reallocating new memory.
     */
    getVoxelPointer(voxel_pos: vec3, ref_pos_wcs = vec3.create(), ref_pos_crs = vec3.create()): VoxelChunkPointer<TChunkWrapper, TVoxel> | null {
        VoxelWorldData.worldSpaceToWorldChunkSpace(voxel_pos, ref_pos_wcs);
        VoxelWorldData.worldSpaceToChunkRelativeSpace(voxel_pos, ref_pos_crs);

        const chunk = this.getChunk(ref_pos_wcs);
        if (chunk == null) return null;
        return chunk!.voxel_chunk_data.getVoxelPointer(ref_pos_crs);
    }

    /**
     * @desc Gets the voxel pointer in world space. If the chunk to which the voxel points at doesn't exist, the chunk_factory
     * will be called, the returned instance will be added to the map, and the pointer will be returned.
     * @param voxel_pos: The position of the voxel IN WORLD VOXEL SPACE.
     * @param chunk_factory: A factory that creates an empty chunk.
     * NOTE: You are completely allowed to use the chunk_pos. After the pos is passed to the factory, it is no longer
     * used by this utility for anything.
     */
    getVoxelPointerOrPatch(voxel_pos: vec3, chunk_factory: (chunk_pos: vec3) => TChunkWrapper): VoxelChunkPointer<TChunkWrapper, TVoxel> {
        const ref_pos_wcs = vec3.create();
        const ref_pos_crs = vec3.create();
        {
            const existing_pointer = this.getVoxelPointer(voxel_pos, ref_pos_wcs, ref_pos_crs);
            if (existing_pointer != null) return existing_pointer;
        }

        const new_chunk = chunk_factory(ref_pos_wcs);
        this.putChunk(ref_pos_wcs, new_chunk);
        return new_chunk.voxel_chunk_data.getVoxelPointer(ref_pos_crs);
    }

    private processNeighbors(pos: vec3, handle_neighbor: (face: FaceDefinition, neighbor_chunk: TChunkWrapper) => void) {
        const {chunks} = this;
        const neighbor_lookup_vec = vec3.create();
        for (const face of FACES_LIST) {
            vec3.add(neighbor_lookup_vec, pos, face.vec_relative);
            const neighbor_chunk = chunks.get(VoxelWorldData.encodeChunkPosition(neighbor_lookup_vec));
            if (neighbor_chunk == null) continue;
            handle_neighbor(face, neighbor_chunk);
        }
    }

    static worldSpaceToWorldChunkSpace(pos: vec3, write_to = vec3.create()) {
        vec3.divide(write_to, pos, [CHUNK_BLOCK_COUNT, CHUNK_BLOCK_COUNT, CHUNK_BLOCK_COUNT]);
        vec3.floor(write_to, write_to);
        return write_to;
    }

    static worldSpaceToChunkRelativeSpace(pos: vec3, write_to = vec3.create()) {
        write_to[0] = signedModulo(pos[0], CHUNK_BLOCK_COUNT);
        write_to[1] = signedModulo(pos[1], CHUNK_BLOCK_COUNT);
        write_to[2] = signedModulo(pos[2], CHUNK_BLOCK_COUNT);
        return write_to;
    }
}