import {GlSetBuffer, SetBufferElem} from "./glSetBuffer";
import {GlCtx, Vec3Axis} from "./typescript/aliases";
import {vec3} from "gl-matrix";

// Static  TODO: Clean up face system.
const CHUNK_SIZE = 9;  // Must be the same as the constant in the vertex shader.
const CHUNK_SIZE_SQUARED = CHUNK_SIZE * CHUNK_SIZE;
const FACE_AXIS_ENCODED = [1, CHUNK_SIZE, CHUNK_SIZE_SQUARED];
function encodeVertexPos(pos: vec3) {
    return pos[0] + pos[1] * CHUNK_SIZE + pos[2] * CHUNK_SIZE_SQUARED;
}
type FaceTemplate = {
    append_face: (target: Uint16Array, target_offset: number, encoded_origin: number, face: 0 | 1) => void,
    encode_face: (encoded_origin: number, face: 0 | 1) => number
}
function makeFaceTemplate(face_bases_vec: vec3[], face_axis: Vec3Axis): FaceTemplate {
    const face_bases_encoded = face_bases_vec.map(encodeVertexPos);
    const face_opp_rel_encoded = FACE_AXIS_ENCODED[face_axis];

    return {
        append_face(target, target_offset, encoded_origin, face) {
            const common_vec_encoded = encoded_origin + (face == 1 ? face_opp_rel_encoded : 0);

            target[target_offset]     = common_vec_encoded + face_bases_encoded[0];
            target[target_offset + 1] = common_vec_encoded + face_bases_encoded[face == 0 ? 2 : 1];
            target[target_offset + 2] = common_vec_encoded + face_bases_encoded[face == 0 ? 1 : 2];

            target[target_offset + 3] = common_vec_encoded + face_bases_encoded[3];
            target[target_offset + 4] = common_vec_encoded + face_bases_encoded[face == 0 ? 5 : 4];
            target[target_offset + 5] = common_vec_encoded + face_bases_encoded[face == 0 ? 4 : 5];
        },
        encode_face(encoded_origin, face) {
            return encoded_origin + (face == 1 ? face_opp_rel_encoded : 0) + face_axis / 10;
        }
    }
}
const FACE_TEMPLATES = {
    X: makeFaceTemplate([
        // Tri 1
        [0, 0, 0],
        [0, 1, 1],
        [0, 0, 1],

        // Tri 2
        [0, 0, 0],
        [0, 1, 0],
        [0, 1, 1]
    ], 0),
    Y: makeFaceTemplate([
        // Tri 1
        [0, 0, 0],
        [1, 0, 1],
        [1, 0, 0],

        // Tri 2
        [0, 0, 0],
        [0, 0, 1],
        [1, 0, 1]
    ], 1),
    Z: makeFaceTemplate([
        // Tri 1
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],

        // Tri 2
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
    ], 2)
};
const FACE_RELATIVE = {
    nx: -encodeVertexPos([1, 0, 0]),
    ny: -encodeVertexPos([0, 1, 0]),
    nz: -encodeVertexPos([0, 0, 1]),
    px: encodeVertexPos([1, 0, 0]),
    py: encodeVertexPos([0, 1, 0]),
    pz: encodeVertexPos([0, 0, 1])
};

type HandledFace = {
    id: number,
    relative: number,
    template: FaceTemplate,
    template_face: 0 | 1
};
const HANDLED_FACES: HandledFace[] = [
    { id: 0, relative: FACE_RELATIVE.nx, template: FACE_TEMPLATES.X, template_face: 0 },
    { id: 1, relative: FACE_RELATIVE.px, template: FACE_TEMPLATES.X, template_face: 1 },
    { id: 2, relative: FACE_RELATIVE.ny, template: FACE_TEMPLATES.Y, template_face: 0 },
    { id: 3, relative: FACE_RELATIVE.py, template: FACE_TEMPLATES.Y, template_face: 1 },
    { id: 4, relative: FACE_RELATIVE.nz, template: FACE_TEMPLATES.Z, template_face: 0 },
    { id: 5, relative: FACE_RELATIVE.pz, template: FACE_TEMPLATES.Z, template_face: 1 }
];

// Class  TODO: Decouple headless chunk data management and rendering.
export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;
    private readonly voxels = new Set<number>();
    private readonly faces = new Map<number, SetBufferElem>();  // Key is an encoded face obtained from the face template.

    constructor(private readonly gl: GlCtx, private readonly buffer: WebGLBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        this.face_set_manager = GlSetBuffer.prepareBufferAndConstruct(
            gl, 12, required_capacity => required_capacity * 1.5 + 6 * 10);
    }

    draw() {
        const { gl, buffer } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.drawArrays(gl.TRIANGLES, 0, this.face_set_manager.element_count * 6);  // There are 6 vertices per face. Draw uses vertex count. Therefore, we multiply by 6.
    }

    placeVoxel(pos: vec3) {  // TODO: Add support for doing in batches.
        const { gl, buffer, voxels, face_set_manager, faces } = this;
        const encoded_pos = encodeVertexPos(pos);
        console.assert(!voxels.has(encoded_pos));

        // Determine faces to create and delete all unnecessary faces.
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const additional_faces: { face_def: HandledFace, key: number }[] = [];
        for (const face_def of HANDLED_FACES) {
            const has_neighbor = voxels.has(encoded_pos + face_def.relative);
            const key = face_def.template.encode_face(encoded_pos, face_def.template_face);

            if (has_neighbor) {  // Since this block used to be air and this face has a neighbor, we must delete that face.
                face_set_manager.removeElement(gl, faces.get(key)!);
                faces.delete(key);
            }

            if (!has_neighbor) {
                additional_faces.push({ face_def, key });
            }
        }

        // Upload to buffer
        const elements = new Uint16Array(additional_faces.length * 6);
        let offset = 0;
        for (const additional_face of additional_faces) {
            const { face_def } = additional_face;
            face_def.template.append_face(elements, offset, encoded_pos, face_def.template_face);
            offset += 6;
        }

        const cpu_face_references = face_set_manager.addElements(gl, elements);
        {
            let idx = 0;
            for (const cpu_ref of cpu_face_references) {
                const additional_face = additional_faces[idx];
                faces.set(additional_face.key, cpu_ref);
                idx++;
            }
        }
        voxels.add(encoded_pos);
    }
}