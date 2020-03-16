import {GlSetBuffer} from "./glSetBuffer";
import {GlCtx, Vec3Axis} from "./typescript/aliases";
import {vec3} from "gl-matrix";

// Static
const CHUNK_SIZE = 9;  // Must be the same as the constant in the vertex shader.
const CHUNK_SIZE_SQUARED = CHUNK_SIZE * CHUNK_SIZE;
const FACE_AXIS_ENCODED = [1, CHUNK_SIZE, CHUNK_SIZE_SQUARED];
function encodeVertexPos(pos: vec3) {
    return pos[0] + pos[1] * CHUNK_SIZE + pos[2] * CHUNK_SIZE_SQUARED;
}
function makeFaceTemplate(face_bases_vec: vec3[], face_axis: Vec3Axis) {
    const face_bases_encoded = face_bases_vec.map(encodeVertexPos);
    const face_opp_rel_encoded = FACE_AXIS_ENCODED[face_axis];

    return (target: Uint16Array, target_offset: number, origin: vec3, face: 0 | 1) => {
        const common_vec_encoded = encodeVertexPos(origin) + (face == 1 ? face_opp_rel_encoded : 0);

        target[target_offset]     = common_vec_encoded + face_bases_encoded[0];
        target[target_offset + 1] = common_vec_encoded + face_bases_encoded[face == 0 ? 2 : 1];
        target[target_offset + 2] = common_vec_encoded + face_bases_encoded[face == 0 ? 1 : 2];

        target[target_offset + 3] = common_vec_encoded + face_bases_encoded[3];
        target[target_offset + 4] = common_vec_encoded + face_bases_encoded[face == 0 ? 5 : 4];
        target[target_offset + 5] = common_vec_encoded + face_bases_encoded[face == 0 ? 4 : 5];
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

// Class
export class VoxelChunkRenderer {
    private readonly face_set_manager: GlSetBuffer;

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

    putVoxel(pos: vec3) {  // TODO: Temp
        const { gl, buffer } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const elements = new Uint16Array(6 * 6);
        console.time();
        FACE_TEMPLATES.X(elements, 0, pos, 0);
        FACE_TEMPLATES.X(elements, 6, pos, 1);
        FACE_TEMPLATES.Y(elements, 12, pos, 0);
        FACE_TEMPLATES.Y(elements, 18, pos, 1);
        FACE_TEMPLATES.Z(elements, 24, pos, 0);
        FACE_TEMPLATES.Z(elements, 30, pos, 1);
        console.timeEnd();
        this.face_set_manager.addElements(gl, elements);
    }
}