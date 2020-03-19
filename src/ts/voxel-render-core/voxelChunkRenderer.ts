import {GlSetBuffer, SetBufferElem} from "../helpers/memory/glSetBuffer";
import {GlCtx, IntBool, Vec3Axis} from "../helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {encodeChunkPos, FACE_LIST, FaceDefinition, FaceKey} from "../voxel-data/faces";
import {ChunkVoxelPointer, VoxelChunkHeadless} from "../voxel-data/voxelChunkHeadless";

export type VoxelPlaceData = {
    faces: Record<FaceKey, { light: number, texture: number }>,
    voxel_pos: vec3
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

    handlePlacedVoxels(gl: GlCtx, chunk_data: VoxelChunkHeadless<any>, target_voxels: VoxelPlaceData[]) {  // TODO: Add support for "slab" blocks; properly handle insertion failure; adapt for removal of voxels.
        const { buffer, face_set_manager, faces } = this;

        // Determine faces to create while deleting all unnecessary faces.
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        type AddedFace = {
            place_data: VoxelPlaceData, encoded_pos: number,
            face: FaceDefinition, chunk_face_key: number
        };
        const added_faces: AddedFace[] = [];
        for (const placed_voxel of target_voxels) {
            const voxel_pointer = chunk_data.getVoxelPointer(placed_voxel.voxel_pos);
            console.assert(voxel_pointer.hasVoxel());

            for (const face of FACE_LIST) {
                const neighbor_voxel = voxel_pointer.getNeighbor(face);
                const chunk_face_key = face.axis.encodeFaceKey(voxel_pointer.encoded_pos, face.axis_sign);
                if (neighbor_voxel != null && neighbor_voxel.hasVoxel()) {  // Since this block used to be air and this face has a neighbor, we must delete the neighboring face.
                    const face = faces.get(chunk_face_key);
                    if (face != null) {  // This check is here if that block doesn't have a face because it's being processed in the same batch as this voxel.
                        face_set_manager.removeElement(gl, face);
                        faces.delete(chunk_face_key);
                    }
                } else  {
                    added_faces.push({ place_data: placed_voxel, face, encoded_pos: voxel_pointer.encoded_pos, chunk_face_key });
                }
            }
        }

        // Upload to buffer
        const elements = new Uint16Array(added_faces.length * 12);  // There are 12 shorts per face (2 shorts per vertex)
        let offset = 0;
        for (const additional_face of added_faces) {
            const { face } = additional_face;
            const face_material = additional_face.place_data.faces[face.towards_key];

            face.axis.appendQuadData(
                elements, offset, additional_face.encoded_pos, face.axis_sign,
                face_material.texture, face_material.light);
            offset += 12;
        }

        const cpu_face_references = face_set_manager.addElements(gl, elements)!;
        {
            let idx = 0;
            for (const cpu_ref of cpu_face_references) {
                const additional_face = added_faces[idx];
                faces.set(additional_face.chunk_face_key, cpu_ref);
                idx++;
            }
        }
    }
}