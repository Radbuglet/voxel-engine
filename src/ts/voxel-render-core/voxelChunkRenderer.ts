import {GlSetBuffer, SetBufferElem} from "../helpers/memory/glSetBuffer";
import {GlCtx, IntBool} from "../helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {FaceAxis, FaceDefinition, FACES, FACES_LIST} from "../voxel-data/faces";
import {IVoxelChunkHeadlessWrapper, VoxelChunkPointer} from "../voxel-data/voxelChunkData";

export interface IVoxelMaterialProvider<TChunkWrapper extends IVoxelChunkHeadlessWrapper<TChunkWrapper, TVoxel>, TVoxel> {
    parseMaterialOfVoxel(pointer: VoxelChunkPointer<TChunkWrapper, TVoxel>, face: FaceDefinition): { texture: number, light: number };
}

export interface IVoxelChunkRendererWrapper {
    voxel_chunk_renderer: VoxelChunkRenderer
}

export type VoxelRenderingProgramSpecs = {
    uniform_chunk_pos: WebGLUniformLocation,
    attrib_vertex_data: number
};

type CpuFaceMap = Map<number, SetBufferElem | null>;
type FaceToAdd = {
    encoded_voxel_pos: number,
    encoded_face_key: number,
    face_definition: FaceDefinition,

    mat_texture: number,
    mat_light: number
};

export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;
    private readonly faces: CpuFaceMap = new Map();  // Key is an encoded face obtained from the face template. null represents a placeholder face that is about to be created on the GPU.

    constructor(gl: GlCtx, private readonly buffer: WebGLBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        this.face_set_manager = GlSetBuffer.prepareBufferAndConstruct(
            gl, 24, required_capacity => required_capacity * 1.5 + 6 * 10);
    }

    draw(gl: GlCtx, program_specs: VoxelRenderingProgramSpecs, chunk_pos: vec3) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.uniform3fv(program_specs.uniform_chunk_pos, chunk_pos);
        gl.vertexAttribPointer(program_specs.attrib_vertex_data, 2, gl.UNSIGNED_SHORT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, this.face_set_manager.element_count * 6);  // There are 6 vertices per face. Draw uses vertex count. Therefore, we multiply by 6.
    }

    private uploadNewFaces(gl: GlCtx, faces_to_add: FaceToAdd[]) {
        const {faces, face_set_manager} = this;

        // Transform faces from their CPU version to their GPU face data encoded version
        const face_elements_buffer = new Uint16Array(faces_to_add.length * 12);
        {
            let face_origin_idx = 0;
            for (const added_face of faces_to_add) {
                const {face_definition, encoded_voxel_pos, mat_texture, mat_light} = added_face;
                face_definition.axis.appendQuadData(face_elements_buffer, face_origin_idx,
                    encoded_voxel_pos, face_definition.axis_sign,
                    mat_texture, mat_light);
                face_origin_idx += 12;
            }
        }

        // Upload data to buffer
        if (!face_set_manager.addElementsExternRefHandle(gl, face_elements_buffer, (face_idx, face_ref) => {
            faces.set(faces_to_add[face_idx].encoded_face_key, face_ref);
        })) {
            throw "Fatal error while modifying chunk: out of VRAM!";
        }
    }

    handleModifiedVoxelPlacements<TChunkWrapper extends IVoxelChunkHeadlessWrapper<TChunkWrapper, TVoxel> & IVoxelChunkRendererWrapper, TVoxel>(gl: GlCtx, chunk: TChunkWrapper, modified_locations: Iterable<vec3>, material_provider: IVoxelMaterialProvider<TChunkWrapper, TVoxel>) {  // TODO: Add support for slabs.
        const {face_set_manager, faces} = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        // Find faces to add; remove bad faces
        const chunk_data = chunk.voxel_chunk_data;
        const neighbor_chunk_modifications = new Map<VoxelChunkRenderer, {
            faces_to_delete: SetBufferElem[],
            faces_to_add: FaceToAdd[]
        }>();
        const faces_to_add: FaceToAdd[] = [];
        {
            // Utils
            function addFace(modifications_array: FaceToAdd[], face_map: CpuFaceMap, owner_pointer: VoxelChunkPointer<TChunkWrapper, TVoxel>, face: FaceDefinition) {
                const material = material_provider.parseMaterialOfVoxel(owner_pointer, face);
                const encoded_face_key = face.axis.encodeFaceKey(owner_pointer.encoded_pos, face.axis_sign);
                if (!face_map.has(encoded_face_key)) {  // Prevent double face creation if neighbor destruction and voxel empty face creation in same batch try to make the same face.
                    face_map.set(encoded_face_key, null);  // Put a placeholder.
                    modifications_array.push({
                        encoded_voxel_pos: owner_pointer.encoded_pos,
                        encoded_face_key,
                        face_definition: face,
                        mat_texture: material.texture,
                        mat_light: material.light
                    })
                }
            }

            function deleteFace(face_map: CpuFaceMap, owner_pointer: VoxelChunkPointer<TChunkWrapper, TVoxel>, face: FaceDefinition): SetBufferElem | null | undefined {
                const encoded_face_key = face.axis.encodeFaceKey(owner_pointer.encoded_pos, face.axis_sign);
                const face_mirror = face_map.get(encoded_face_key);
                if (face_mirror != null) {  // undefined => no face ie deleted, null face => face is placeholder (shouldn't happen, more for type safety)
                    face_map.delete(encoded_face_key);
                }
                return face_mirror;
            }

            function getChunkModificationBuffer(chunk: VoxelChunkRenderer) {
                let modification_buffer = neighbor_chunk_modifications.get(chunk);
                if (modification_buffer == null) {
                    modification_buffer = {
                        faces_to_add: [],
                        faces_to_delete: []
                    };
                    neighbor_chunk_modifications.set(chunk, modification_buffer);
                }
                return modification_buffer;
            }

            // Generate modification buffers  TODO: Simplify cases; expand such that batched updates can concern more than one chunk at a time.
            const root_pointer = chunk_data.getVoxelPointer(vec3.create());
            for (const root_vec of modified_locations) {
                root_pointer.moveTo(root_vec);
                const root_now_solid = root_pointer.hasVoxel();

                for (const face_definition of FACES_LIST) {
                    const neighbor_pointer = root_pointer.getNeighbor(face_definition);
                    const neighbor_is_solid = neighbor_pointer != null && neighbor_pointer.hasVoxel();

                    if (root_now_solid) {  // This voxel has been PLACED
                        if (neighbor_is_solid) {  // There might be a redundant face here if the neighbor was constructed in an earlier batch. Time to "simplify" the neighboring voxel!
                            const neighbor_chunk = neighbor_pointer!.chunk_wrapped;
                            const face_to_delete = deleteFace(neighbor_chunk.voxel_chunk_renderer.faces, neighbor_pointer!, FACES[face_definition.inverse_key]);
                            if (face_to_delete != null) {
                                if (root_pointer.chunk_wrapped != neighbor_chunk) {
                                    const neighbor_modification_buffer = getChunkModificationBuffer(neighbor_chunk.voxel_chunk_renderer);
                                    neighbor_modification_buffer.faces_to_delete.push(face_to_delete);
                                } else {
                                    face_set_manager.removeElement(gl, face_to_delete);
                                }
                            }
                        } else {  // We need to make one of our faces here.
                            addFace(faces_to_add, faces, root_pointer, face_definition);
                        }

                    } else {  // This voxel has been BROKEN
                        if (neighbor_is_solid) {  // We might need to repair the block which we "simplified" when the root was extant if that voxel is from a previous batch.
                            const neighbor_chunk = neighbor_pointer!.chunk_wrapped;
                            if (root_pointer.chunk_wrapped != neighbor_chunk) {
                                const neighbor_modification_buffer = getChunkModificationBuffer(neighbor_chunk.voxel_chunk_renderer);
                                addFace(neighbor_modification_buffer.faces_to_add, neighbor_chunk.voxel_chunk_renderer.faces, neighbor_pointer!, FACES[face_definition.inverse_key]);
                            } else {
                                addFace(faces_to_add, faces, neighbor_pointer!, FACES[face_definition.inverse_key]);
                            }
                        }

                        // The lack of an "else" here is intentional.
                        const face_to_delete = deleteFace(faces, root_pointer, face_definition);  // This is one of our faces hence why we don't flip the side.
                        if (face_to_delete != null) face_set_manager.removeElement(gl, face_to_delete);
                    }
                }
            }
        }

        this.uploadNewFaces(gl, faces_to_add);
        for (const [neighbor_chunk, modifications] of neighbor_chunk_modifications.entries()) {
            gl.bindBuffer(gl.ARRAY_BUFFER, neighbor_chunk.buffer);
            const face_set_manager = neighbor_chunk.face_set_manager;
            for (const deleted_face of modifications.faces_to_delete) {
                face_set_manager.removeElement(gl, deleted_face);
            }
            neighbor_chunk.uploadNewFaces(gl, modifications.faces_to_add);
        }
    }

    handleModifiedVoxelMaterials() {
        // TODO
    }
}