import {GlSetBuffer} from "./glSetBuffer";
import {GlCtx, Vec3Axis} from "./typescript/aliases";
import {vec3} from "gl-matrix";

// Static
const CHUNK_SIZE = 9;  // Must be the same as the constant in the vertex shader.
const CHUNK_SIZE_SQUARED = CHUNK_SIZE * CHUNK_SIZE;
function encodeVertexPos(pos: vec3) {
    return pos[0] + pos[1] * CHUNK_SIZE + pos[2] * CHUNK_SIZE_SQUARED;
}

function encodeVertexPosRelative(base: vec3, origin: vec3, face_axis: Vec3Axis, face: 0 | 1) {
    const pos: vec3 = [0, 0, 0];
    vec3.add(pos, base, origin);
    pos[face_axis] += face;
    return encodeVertexPos(pos);
}
function makeFaceTemplate(face_bases: vec3[], face_axis: Vec3Axis) {  // TODO: This is still too inefficient.
    return (target: Uint16Array, target_offset: number, origin: vec3, face: 0 | 1) => {
        target[target_offset]     = encodeVertexPosRelative(face_bases[0], origin, face_axis, face);
        target[target_offset + 1] = encodeVertexPosRelative(face_bases[face == 0 ? 2 : 1], origin, face_axis, face);
        target[target_offset + 2] = encodeVertexPosRelative(face_bases[face == 0 ? 1 : 2], origin, face_axis, face);

        target[target_offset + 3] = encodeVertexPosRelative(face_bases[3], origin, face_axis, face);
        target[target_offset + 4] = encodeVertexPosRelative(face_bases[face == 0 ? 5 : 4], origin, face_axis, face);
        target[target_offset + 5] = encodeVertexPosRelative(face_bases[face == 0 ? 4 : 5], origin, face_axis, face);
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
        FACE_TEMPLATES.X(elements, 0, pos, 0);
        FACE_TEMPLATES.X(elements, 6, pos, 1);
        FACE_TEMPLATES.Y(elements, 12, pos, 0);
        FACE_TEMPLATES.Y(elements, 18, pos, 1);
        FACE_TEMPLATES.Z(elements, 24, pos, 0);
        FACE_TEMPLATES.Z(elements, 30, pos, 1);
        this.face_set_manager.addElements(gl, elements);
    }
}