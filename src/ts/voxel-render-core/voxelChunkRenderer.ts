import {GlSetBuffer, SetBufferElem} from "../helpers/memory/glSetBuffer";
import {GlCtx, IntBool, Vec3Axis} from "../helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {encodeChunkPos, FACES_LIST, FaceDefinition, FaceKey} from "../voxel-data/faces";
import {ChunkVoxelPointer, VoxelChunkHeadless} from "../voxel-data/voxelChunkHeadless";

type FaceToAdd = {
    encoded_voxel_pos: number,
    encoded_face_key: number,
    face_definition: FaceDefinition,
    mat_texture: number,
    mat_light: number,
    cull_side: boolean
};
export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;
    private readonly faces = new Map<number, SetBufferElem>();  // Key is an encoded face obtained from the face template.

    constructor(gl: GlCtx, private readonly buffer: WebGLBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        this.face_set_manager = GlSetBuffer.prepareBufferAndConstruct(
            gl, 24, required_capacity => required_capacity * 1.5 + 6 * 10);
    }

    draw(gl: GlCtx) {
        const { buffer } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.drawArrays(gl.TRIANGLES, 0, this.face_set_manager.element_count * 6);  // There are 6 vertices per face. Draw uses vertex count. Therefore, we multiply by 6.
    }

    handleModifiedVoxelPlacements(gl: GlCtx, chunk_data: VoxelChunkHeadless<any>, modified_locations: Iterable<vec3>) {  // TODO: Add support for slabs and proper materials; optimize for worst case scenario.
        const { face_set_manager, faces } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        // Find faces to add; remove bad faces
        const faces_to_add: FaceToAdd[] = [];
        {
            function deleteFace(encoded_face_key: number) {
                const face_ref = faces.get(encoded_face_key);
                // This check exists to prevent a queued voxel from deleting a face that is reported to exist but hasn't
                // been created yet because that face belongs to another queued voxel.
                if (face_ref != null) {
                    face_set_manager.removeElement(gl, face_ref);
                    faces.delete(encoded_face_key);
                }
            }

            const root_pointer = chunk_data.getVoxelPointer(vec3.create());
            for (const root_vec of modified_locations) {
                root_pointer.moveTo(root_vec);
                const root_now_solid = root_pointer.hasVoxel();

                for (const neighboring_face of FACES_LIST) {
                    const neighbor_pointer = root_pointer.getNeighbor(neighboring_face);
                    const neighbor_is_solid = neighbor_pointer != null && neighbor_pointer.hasVoxel();
                    const encoded_face_key = neighboring_face.axis.encodeFaceKey(root_pointer.encoded_pos, neighboring_face.axis_sign);
                    function addThisFace(texture: number, light: number, cull_side: boolean) {
                        // This check exists to prevent a face from being created by the destruction of a voxel if the voxel
                        // the face is intended to "repair" is also in the same operation and also plans on creating their own face
                        // with the new-found void.
                        if (!faces.has(encoded_face_key)) {
                            faces_to_add.push({
                                face_definition: neighboring_face,
                                encoded_voxel_pos: root_pointer.encoded_pos,
                                encoded_face_key,
                                mat_texture: texture,
                                mat_light: light,
                                cull_side
                            });
                        }
                    }

                    // TODO: This is still buggy in mixed operations. Fix it!
                    if (root_now_solid) {  // This voxel has been PLACED
                        if (neighbor_is_solid) {  // We might need to remove a redundant face
                            deleteFace(encoded_face_key);
                        } else {  // We need to place a face there
                            addThisFace(0, 32, neighboring_face.axis_sign == 0);  // TODO: Use material
                        }

                    } else {  // This voxel has been BROKEN
                        if (neighbor_is_solid) {  // We need to place a face here
                            addThisFace(0, 32, neighboring_face.axis_sign == 1); // TODO: Use material
                        } else {  // This is one of our faces and we need to delete it.
                            deleteFace(encoded_face_key);
                        }
                    }
                }
            }
        }

        // Add new faces
        const face_elements_buffer = new Uint16Array(faces_to_add.length * 12);
        {
            let face_origin_idx = 0;
            for (const added_face of faces_to_add) {
                const {face_definition, encoded_voxel_pos, mat_texture, mat_light, cull_side} = added_face;
                face_definition.axis.appendQuadData(face_elements_buffer, face_origin_idx,
                    encoded_voxel_pos, face_definition.axis_sign, cull_side,
                    mat_texture, mat_light);
                face_origin_idx += 12;
            }
        }

        // Upload
        if (!face_set_manager.addElementsExternRefHandle(gl, face_elements_buffer, (face_idx, face_ref) => {
            faces.set(faces_to_add[face_idx].encoded_face_key, face_ref);
        })) {
            // TODO: Handle failure.
        }
    }

    handleModifiedVoxelMaterials() {
        // TODO
    }
}