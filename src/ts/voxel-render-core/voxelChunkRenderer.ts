import {GlSetBuffer, SetBufferElem} from "../helpers/memory/glSetBuffer";
import {GlCtx, IntBool} from "../helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {FaceDefinition, FACES, FACES_LIST} from "../voxel-data/faces";
import {ChunkVoxelPointer, ProvidesVoxelChunkHeadless, VoxelChunkData} from "../voxel-data/voxelChunkData";

type FaceToAdd = {
    encoded_voxel_pos: number,
    encoded_face_key: number,
    face_flipped: IntBool,
    face_definition: FaceDefinition,
    mat_texture: number,
    mat_light: number
};
export interface ProvidesVoxelMaterialParsing<TChunkWrapper extends ProvidesVoxelChunkHeadless<TChunkWrapper, TVoxel>, TVoxel> {
    parseMaterialOfVoxel(pointer: ChunkVoxelPointer<TChunkWrapper, TVoxel>, face: FaceDefinition): { texture: number, light: number};  // TODO: first argument shouldn't point to root chunk but rather the chunk containing the pointer.
}

export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;
    private readonly faces = new Map<number, SetBufferElem | null>();  // Key is an encoded face obtained from the face template.

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

    handleModifiedVoxelPlacements<TChunkWrapper extends ProvidesVoxelChunkHeadless<TChunkWrapper, TVoxel>, TVoxel>(gl: GlCtx, chunk: TChunkWrapper, modified_locations: Iterable<vec3>, material_provider: ProvidesVoxelMaterialParsing<TChunkWrapper, TVoxel>) {  // TODO: Add support for slabs.
        const { face_set_manager, faces } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        // Find faces to add; remove bad faces
        const chunk_data = chunk.voxel_chunk_data;
        const faces_to_add: FaceToAdd[] = [];
        {
            const root_pointer = chunk_data.getVoxelPointer(vec3.create());
            for (const root_vec of modified_locations) {
                root_pointer.moveTo(root_vec);
                const root_now_solid = root_pointer.hasVoxel();

                for (const neighboring_face of FACES_LIST) {  // TODO: What about neighbors in neighboring chunks?
                    const neighbor_pointer = root_pointer.getNeighbor(neighboring_face);
                    const neighbor_is_solid = neighbor_pointer != null && neighbor_pointer.hasVoxel();

                    function encodeFaceKey(face_flipped: IntBool) {
                        return neighboring_face.axis.encodeFaceKey(root_pointer.encoded_pos, neighboring_face.axis_sign, face_flipped);
                    }

                    function addFace(texture: number, light: number, face_flipped: IntBool) {
                        const encoded_face_key = encodeFaceKey(face_flipped);
                        // This check exists to prevent a face from being created by the destruction of a voxel if the voxel
                        // the face is intended to "repair" is also in the same operation and also plans on creating their own face
                        // with the new-found void.
                        if (!faces.has(encoded_face_key)) {
                            faces.set(encoded_face_key, null); // Null serves as a placeholder to avoid double face creation from an addition surround and a deletion patch.
                            faces_to_add.push({
                                face_definition: neighboring_face,
                                encoded_voxel_pos: root_pointer.encoded_pos,
                                face_flipped,
                                encoded_face_key,
                                mat_texture: texture,
                                mat_light: light
                            });
                        }
                    }

                    function tryToDeleteFace(face_flipped: IntBool) {
                        const encoded_face_key = encodeFaceKey(face_flipped);
                        const face_ref = faces.get(encoded_face_key);
                        if (face_ref != null) {  // Ensures the face is not a phantom face or a placeholder.
                            face_set_manager.removeElement(gl, face_ref);
                            faces.delete(encoded_face_key);
                        }
                    }

                    if (root_now_solid) {  // This voxel has been PLACED
                        if (neighbor_is_solid) {  // There might be a redundant face here if the neighbor was constructed in an earlier batch.
                            tryToDeleteFace(1);  // This is a face pointing towards the root, not outwards and we should flip accordingly.
                        } else {  // A face needs to be here.
                            const material = material_provider.parseMaterialOfVoxel(root_pointer, neighboring_face);
                            addFace(material.texture, material.light, 0);  // Normal mode is pointing away from the root, which is desired here.
                        }

                    } else {  // This voxel has been BROKEN
                        if (neighbor_is_solid) {  // We might need to repair the block which we "simplified" when the root was extant if that voxel is from a previous batch.
                            const material = material_provider.parseMaterialOfVoxel(neighbor_pointer!, FACES[neighboring_face.inverse_key]);  // Neighbor pointer must be non null as the neighbor is solid.

                            // If its in the first batch we may not want to repair it if the new voxel already created that face, hence why we ensure this action is conditional.
                            addFace(material.texture, material.light, 1); // Flipped mode is pointing towards the root. Our intended behavior is that this face is pointing outwards of the neighbor thus towards the root.
                        }

                        // We need to delete all faces that belonged to us, no matter what.
                        tryToDeleteFace(0);  // This is one of our faces hence why we don't flip the side.
                    }
                }
            }
        }

        // Add new faces
        const face_elements_buffer = new Uint16Array(faces_to_add.length * 12);
        {
            let face_origin_idx = 0;
            for (const added_face of faces_to_add) {
                const {face_definition, encoded_voxel_pos, mat_texture, mat_light, face_flipped} = added_face;
                face_definition.axis.appendQuadData(face_elements_buffer, face_origin_idx,
                    encoded_voxel_pos, face_definition.axis_sign, face_flipped,
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