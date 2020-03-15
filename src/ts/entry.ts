// The following code is temporary and will be replaced when actually building the engine. The shader and the voxel utilities however, will probably be kept.
import {mat4, vec3} from "gl-matrix";
import VOXEL_VERTEX_SOURCE from "./../res/voxel.vert";
import VOXEL_FRAG_SOURCE from "./../res/voxel.frag";

const canvas = document.createElement("canvas");
const gl = canvas.getContext("webgl")!;

function loadShader(type: "VERTEX_SHADER" | "FRAGMENT_SHADER", source: string) {
    const shader = gl.createShader(gl[type])!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw `Failed to compile ${type}. Info log:\n${gl.getShaderInfoLog(shader)}`;
    }
    return shader;
}

function loadProgram(vertex_source: string, fragment_source: string) {
    const vs = loadShader("VERTEX_SHADER", vertex_source);
    const fs = loadShader("FRAGMENT_SHADER", fragment_source);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);

    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw `Failed to link program. Info log:\n${gl.getProgramInfoLog(program)}`;
    }

    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        throw `Failed to validate program. Info log:\n${gl.getProgramInfoLog(program)}`;
    }

    return program;
}

const render_program = loadProgram(VOXEL_VERTEX_SOURCE, VOXEL_FRAG_SOURCE);

// Setup the chunk data array buffer
function encodeVertexPos(x: number, y: number, z: number) {
    const CHUNK_SIZE = 8;
    return x + y * CHUNK_SIZE + z * (CHUNK_SIZE * CHUNK_SIZE);
}
const vslot_data = gl.getAttribLocation(render_program, "vertex_data");
const array_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, array_buffer);  // VAP() and bufferData() operate on the currently bound array buffer
gl.bufferData(gl.ARRAY_BUFFER, Uint16Array.from([
    // Front
    encodeVertexPos(0, 0, 0),
    encodeVertexPos(1, 0, 0),
    encodeVertexPos(1, 1, 0),

    encodeVertexPos(0, 0, 0),
    encodeVertexPos(1, 1, 0),
    encodeVertexPos(0, 1, 0),

    // Back
    encodeVertexPos(0, 0, 1),
    encodeVertexPos(1, 1, 1),
    encodeVertexPos(1, 0, 1),

    encodeVertexPos(0, 0, 1),
    encodeVertexPos(0, 1, 1),
    encodeVertexPos(1, 1, 1),

    // Left side
    encodeVertexPos(0, 0, 0),
    encodeVertexPos(0, 1, 1),
    encodeVertexPos(0, 0, 1),

    encodeVertexPos(0, 0, 0),
    encodeVertexPos(0, 1, 0),
    encodeVertexPos(0, 1, 1),

    // Right side
    encodeVertexPos(1, 0, 0),
    encodeVertexPos(1, 0, 1),
    encodeVertexPos(1, 1, 1),

    encodeVertexPos(1, 0, 0),
    encodeVertexPos(1, 1, 1),
    encodeVertexPos(1, 1, 0),

    // Bottom side
    encodeVertexPos(0, 0, 0),
    encodeVertexPos(1, 0, 1),
    encodeVertexPos(1, 0, 0),

    encodeVertexPos(0, 0, 0),
    encodeVertexPos(0, 0, 1),
    encodeVertexPos(1, 0, 1),

    // Top side
    encodeVertexPos(0, 1, 0),
    encodeVertexPos(1, 1, 0),
    encodeVertexPos(1, 1, 1),

    encodeVertexPos(0, 1, 0),
    encodeVertexPos(1, 1, 1),
    encodeVertexPos(0, 1, 1),
]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(vslot_data);  // Tells the vertex shader to use the VAP instead of a constant.
gl.vertexAttribPointer(vslot_data, 1, gl.UNSIGNED_SHORT, false, 0, 0);  // Specify how to lookup vertices at the "vertex slot"

// Draw
canvas.width = 500;
canvas.height = 500;
gl.viewport(0, 0, canvas.width, canvas.height);
gl.clearColor(0.2, 0.2, 0.2, 1);
gl.enable(gl.CULL_FACE);
gl.useProgram(render_program);

const proj_mat = new Float32Array(16);
mat4.perspective(proj_mat, Math.PI * 0.78, canvas.width / canvas.height, 0.01, 1000);
gl.uniformMatrix4fv(gl.getUniformLocation(render_program, "projection"), false, proj_mat);

const upos_view = gl.getUniformLocation(render_program, "view");
const camera_pos: vec3 = [0.5, 0.5, 4];
const camera_ang = [0, 0];
const keys_down: Record<string, true> = {};
function draw() {
    requestAnimationFrame(draw);

    // Update TODO: Looking needs to be clamped and x needs to wrap to avoid precision degredation
    if (keys_down["ArrowLeft"]) {
        camera_ang[0] += Math.PI * 0.02;
    }

    if (keys_down["ArrowRight"]) {
        camera_ang[0] -= Math.PI * 0.02;
    }

    if (keys_down["ArrowUp"]) {
        camera_ang[1] += Math.PI * 0.02;
    }

    if (keys_down["ArrowDown"]) {
        camera_ang[1] -= Math.PI * 0.02;
    }

    const heading = [0, 0];
    if (keys_down["w"]) {
        heading[0] += 1;
    }

    if (keys_down["s"]) {
        heading[0] -= 1;
    }

    if (keys_down["a"]) {
        heading[1] -= 1;
    }

    if (keys_down["d"]) {
        heading[1] += 1;
    }

    if (keys_down["e"]) {
        camera_pos[1] += 0.1;
    }

    if (keys_down["q"]) {
        camera_pos[1] -= 0.1;
    }

    const forward = [Math.sin(camera_ang[0]), Math.cos(camera_ang[0])];
    camera_pos[0] += ((forward[0] * -heading[0]) + (forward[1] * heading[1])) * 0.1;
    camera_pos[2] += ((forward[1] * -heading[0]) + (forward[0] * -heading[1])) * 0.1;

    // Render
    const view_mat = mat4.create();
    mat4.translate(view_mat, view_mat, camera_pos);
    mat4.rotateY(view_mat, view_mat, camera_ang[0]);
    mat4.rotateX(view_mat, view_mat, camera_ang[1]);
    mat4.invert(view_mat, view_mat);
    gl.uniformMatrix4fv(upos_view, false, view_mat);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6 * 6);
}
draw();

console.log("Ready!");
document.body.append(canvas);

document.body.onkeydown = e => {
    keys_down[e.key] = true;
};

document.body.onkeyup = e => {
    delete keys_down[e.key];
};