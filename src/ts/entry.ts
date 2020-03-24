// The following code is temporary and will be replaced **in its entirety** when actually building the engine.
// (Same applies for the HTML as it lacks a lot of the required boilerplate for JS games)
import {mat4, vec3} from "gl-matrix";
import VOXEL_VERTEX_SOURCE from "./../res/voxel.vert";
import VOXEL_FRAG_SOURCE from "./../res/voxel.frag";
import {VoxelWorldData} from "./voxel-data/voxelWorldData";
import {ChunkVoxelPointer, ProvidesVoxelChunkHeadless, VoxelChunkData} from "./voxel-data/voxelChunkData";
import {ProvidesVoxelMaterialParsing, VoxelChunkRenderer} from "./voxel-render-core/voxelChunkRenderer";
import {CHUNK_BLOCK_COUNT} from "./voxel-data/faces";
import TEXTURES_IMAGE_PATH from "../res/textures.png";
import {GlCtx} from "./helpers/typescript/aliases";

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
const material_provider: ProvidesVoxelMaterialParsing<TestChunk, number> = {
    parseMaterialOfVoxel(pointer, face) {
        return {
            light: [25, 5, 16, 16, 50, 25][face.index],
            texture: Math.floor(Math.random() * 4)
        };
    }
};
class TestWorld {
    private readonly voxel_data = new VoxelWorldData<TestChunk>();

    addChunk(gl: GlCtx, chunk_pos: vec3) {
        const chunk = new TestChunk(gl);
        this.voxel_data.putChunk(chunk_pos, chunk);
        return chunk;
    }

    draw(gl: GlCtx) {
        for (const chunk of this.voxel_data.iterChunks()) {
            chunk.draw(gl);
        }
    }
}

class TestChunk implements ProvidesVoxelChunkHeadless<TestChunk, number> {
    public readonly voxel_chunk_data: VoxelChunkData<TestChunk, number>;
    public readonly voxel_renderer: VoxelChunkRenderer;
    private readonly buffer: WebGLBuffer;

    constructor(gl: GlCtx) {
        this.buffer = gl.createBuffer()!;
        this.voxel_renderer = new VoxelChunkRenderer(gl, this.buffer);
        this.voxel_chunk_data = new VoxelChunkData<TestChunk, number>(this);
    }

    randomize(gl: GlCtx) {
        const { voxel_chunk_data } = this;
        const modified_positions: vec3[] = [];
        const voxel_write_pointer = voxel_chunk_data.getVoxelPointer([0, 0, 0]);

        for (let x = 0; x < CHUNK_BLOCK_COUNT; x++) {
            for (let y = 0; y < CHUNK_BLOCK_COUNT; y++) {
                for (let z = 0; z < CHUNK_BLOCK_COUNT; z++) {
                    const pos_vec: vec3 = [x, y, z];
                    voxel_write_pointer.moveTo(pos_vec);
                    const desired_state = Math.random() > 0.5;
                    const current_state = voxel_write_pointer.hasVoxel();

                    if (desired_state && !current_state) {
                        voxel_write_pointer.setData(1);
                        modified_positions.push(pos_vec);
                    } else if (!desired_state && current_state) {
                        voxel_write_pointer.removeVoxel();
                        modified_positions.push(pos_vec);
                    }
                }
            }
        }

        this.voxel_renderer.handleModifiedVoxelPlacements(gl, this, modified_positions, material_provider);
    }

    draw(gl: GlCtx) {
        this.voxel_renderer.draw(gl);
    }
}

const world = new TestWorld();
const chunk = world.addChunk(gl, [0, 0, 0]);
chunk.randomize(gl);

// Setup textures
const my_texture = gl.createTexture()!;
{
    gl.bindTexture(gl.TEXTURE_2D, my_texture);
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 2;
    const height = 2;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([
        255, 255, 255, 255,
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        width, height, border, srcFormat, srcType,
        pixel);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const image = new Image();
    image.src = TEXTURES_IMAGE_PATH;
    image.onload = () => {
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
    }
}

// Setup vertex accessing
const vslot_data = gl.getAttribLocation(render_program, "vertex_data");
gl.enableVertexAttribArray(vslot_data);  // Tells the vertex shader to use the VAP instead of a constant.
gl.vertexAttribPointer(vslot_data, 2, gl.UNSIGNED_SHORT, false, 0, 0);  // Specify how to lookup vertices at the "vertex slot"

// Draw
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);
gl.clearColor(0.9, 0.9, 0.92, 1);
gl.enable(gl.CULL_FACE);
gl.enable(gl.DEPTH_TEST);
gl.useProgram(render_program);
gl.uniform1i(gl.getUniformLocation(render_program, "texture_sampler"), 0);

const proj_mat = new Float32Array(16);
mat4.perspective(proj_mat, Math.PI * 0.7, canvas.width / canvas.height, 0.01, 1000);
gl.uniformMatrix4fv(gl.getUniformLocation(render_program, "projection"), false, proj_mat);

const upos_view = gl.getUniformLocation(render_program, "view");
const camera_pos: vec3 = [0.5, 0.5, 4];
const camera_ang = [0, 0];
const keys_down: Record<string, true> = {};

function draw() {
    requestAnimationFrame(draw);

    // Update movement
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
    world.draw(gl);
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