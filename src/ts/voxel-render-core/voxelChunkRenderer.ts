import {GlSetBuffer, SetBufferElem} from "../helpers/memory/glSetBuffer";
import {GlCtx, IBool, Vec3Axis} from "../helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {encodeVertexPos, FACE_LIST, FaceDefinition} from "../voxel-data/faces";

// Class  TODO: Decouple headless chunk data management and rendering.
export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;
    private readonly voxels = new Set<number>();
    private readonly faces = new Map<number, SetBufferElem>();  // Key is an encoded face obtained from the face template.

    constructor(private readonly gl: GlCtx, private readonly buffer: WebGLBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        this.face_set_manager = GlSetBuffer.prepareBufferAndConstruct(
            gl, 24, required_capacity => required_capacity * 1.5 + 6 * 10);
    }

    draw() {
        const { gl, buffer } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.drawArrays(gl.TRIANGLES, 0, this.face_set_manager.element_count * 6);  // There are 6 vertices per face. Draw uses vertex count. Therefore, we multiply by 6.
    }

    placeVoxels(positions: vec3[]) {  // TODO: Add support for "slab" blocks, materials, and lighting data; optimize; properly handle insertion failure.
        const { gl, buffer, voxels, face_set_manager, faces } = this;

        // Encode positions and record them in the voxel set.
        const encoded_positions = positions.map(pos => {
            const encoded_pos = encodeVertexPos(pos);
            console.assert(!voxels.has(encoded_pos));
            voxels.add(encoded_pos);
            return encoded_pos;
        });

        // Determine faces to create while deleting all unnecessary faces.
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const additional_faces: { face_def: FaceDefinition, face_key: number, encoded_pos: number }[] = [];

        for (const encoded_pos of encoded_positions) {
            for (const face_def of FACE_LIST) {
                const has_neighbor = voxels.has(encoded_pos + face_def.encoded_relative);
                const key = face_def.axis.encodeFace(encoded_pos, face_def.axis_sign);

                if (has_neighbor) {  // Since this block used to be air and this face has a neighbor, we must delete the neighboring face.
                    const face = faces.get(key);
                    if (face != null) {  // This check is here if that block doesn't have a face because it's being processed in the same batch as this voxel.
                        face_set_manager.removeElement(gl, face);
                        faces.delete(key);
                    }
                }

                if (!has_neighbor) {
                    additional_faces.push({ face_def, face_key: key, encoded_pos });
                }
            }
        }

        // Upload to buffer
        const elements = new Uint16Array(additional_faces.length * 12);  // There are 12 shorts per face (2 shorts per vertex)
        let offset = 0;
        for (const additional_face of additional_faces) {
            const { face_def } = additional_face;
            face_def.axis.appendQuad(elements, offset, additional_face.encoded_pos, face_def.axis_sign);
            offset += 12;
        }

        const cpu_face_references = face_set_manager.addElements(gl, elements)!;
        {
            let idx = 0;
            for (const cpu_ref of cpu_face_references) {
                const additional_face = additional_faces[idx];
                faces.set(additional_face.face_key, cpu_ref);
                idx++;
            }
        }
    }
}