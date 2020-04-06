import {VOXEL_RENDERING_SHADER} from "../lib/voxel-render-core/defaultShaders";
import {
    IVoxelChunkRendererWrapper,
    IVoxelMaterialProvider,
    VoxelChunkRenderer
} from "../lib/voxel-render-core/voxelChunkRenderer";
import {IVoxelChunkDataWrapper, VoxelChunkData} from "../lib/voxel-data/voxelChunkData";
import {GlCtx} from "../lib/helpers/typescript/aliases";
import {vec2, vec3} from "gl-matrix";
import {VoxelWorldData} from "../lib/voxel-data/voxelWorldData";
import {VoxelChunkWorldRendering, WorldChunksRenderingContext} from "../lib/voxel-render-core/voxelWorldChunksRenderer";
import {clamp, signedModulo} from "../lib/helpers/scalar";

// Setup canvas
const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.append(canvas);
const gl = canvas.getContext("webgl")!;

// Create shading stuff
const voxel_shader = VOXEL_RENDERING_SHADER.loadDefaultVoxelShader(gl).getOrThrow();
gl.useProgram(voxel_shader.program);

const material_provider: IVoxelMaterialProvider<ExampleChunk, number> = {
    parseMaterialOfVoxel(pointer, face) {
        return {
            light: [25, 10, 16, 16, 50, 25][face.index],
            texture: Math.floor(Math.random() * 4)
        };
    }
};

// Load textures
// TODO

// Define world
class ExampleWorld {
    public readonly voxel_world_data = new VoxelWorldData<ExampleChunk, number>();
    public readonly voxel_world_renderer: VoxelChunkWorldRendering;

    constructor(gl: GlCtx) {
        this.voxel_world_renderer = new VoxelChunkWorldRendering(ExampleWorld.getChunkRenderCtx(gl), {
            clipping_near: 0.1,
            clipping_far: 1000,
            aspect: canvas.width / canvas.height,
            fov_rad: Math.PI * 0.7
        }, {
            origin: [0.5, 0.5, 4],
            pitch: 0,  // horizontal
            yaw: 0     // vertical
        })
    }

    private static getChunkRenderCtx(gl: GlCtx): WorldChunksRenderingContext {
        return {
            gl,
            program: voxel_shader,
        };
    }

    makeChunk(gl: GlCtx, pos: vec3) {
        const chunk = new ExampleChunk(gl, pos);
        this.voxel_world_data.putChunk(pos, chunk);
        return chunk;
    }

    lookRelative(rel: vec2, sensitivity: number) {
        const {view_state} = this.voxel_world_renderer;
        view_state.pitch -= rel[0] * sensitivity;
        view_state.yaw -= rel[1] * sensitivity;
        view_state.pitch = signedModulo(view_state.pitch, Math.PI * 2);
        view_state.yaw = clamp(view_state.yaw, -Math.PI / 2, Math.PI / 2);
        this.voxel_world_renderer.updateViewOnGpu(ExampleWorld.getChunkRenderCtx(gl));
    }

    tick(gl: GlCtx, keys_down: Set<string>) {
        // Update
        {
            const {view_state} = this.voxel_world_renderer;

            // Generate horizontal heading
            const heading: vec3 = [0, 0, 0];
            if (keys_down.has("w")) heading[0]--;
            if (keys_down.has("s")) heading[0]++;
            if (keys_down.has("a")) heading[1]++;
            if (keys_down.has("d")) heading[1]--;
            if (keys_down.has("q")) heading[2]--;
            if (keys_down.has("e")) heading[2]++;

            // Generate relative movement
            const relative: vec3 = [0, heading[2], 0];
            if (heading[0] !== 0)
                vec3.add(relative, relative, [Math.sin(view_state.pitch) * heading[0], 0, Math.cos(view_state.pitch) * heading[0]]);

            if (heading[1] !== 0)
                vec3.add(relative, relative, [-Math.cos(view_state.pitch) * heading[1], 0, Math.sin(view_state.pitch) * heading[1]]);

            // Upload
            vec3.normalize(relative, relative);
            vec3.scale(relative, relative, 0.25);
            vec3.add(view_state.origin, view_state.origin, relative);
            if (relative[0] !== 0 || relative[1] !== 0 || relative[2] !== 0)
                this.voxel_world_renderer.updateViewOnGpu(ExampleWorld.getChunkRenderCtx(gl));
        }

        // Render
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.clearColor(0.9, 0.9, 0.95, 1);
        gl.enableVertexAttribArray(voxel_shader.attrib_vertex_data);
        this.voxel_world_renderer.render<ExampleChunk>(ExampleWorld.getChunkRenderCtx(gl),
            this.voxel_world_data.iterChunks(), chunk => chunk.pos);
        gl.disableVertexAttribArray(voxel_shader.attrib_vertex_data);
    }
}

class ExampleChunk implements IVoxelChunkDataWrapper<ExampleChunk, number>, IVoxelChunkRendererWrapper{
    public voxel_chunk_data: VoxelChunkData<ExampleChunk, number> = new VoxelChunkData<ExampleChunk, number>(this);
    public voxel_chunk_renderer: VoxelChunkRenderer;

    constructor(gl: GlCtx, public readonly pos: vec3) {
        this.voxel_chunk_renderer = new VoxelChunkRenderer(gl, gl.createBuffer()!);
    }

    placeVoxels(gl: GlCtx, positions: vec3[]) {
        const {voxel_chunk_data, voxel_chunk_renderer} = this;
        const write_pointer = voxel_chunk_data.getVoxelPointer([0, 0, 0]);
        for (const pos of positions) {
            write_pointer.moveTo(pos);
            write_pointer.setData(1);
        }
        voxel_chunk_renderer.handleVoxelModifications(gl, this, positions, material_provider);
    }
}

// Prepare world
gl.enable(gl.CULL_FACE);
gl.enable(gl.DEPTH_TEST);
const world = new ExampleWorld(gl);
const chunk = world.makeChunk(gl, [0, 0, 0]);
chunk.voxel_chunk_data.getVoxelPointer([0, 0, 0]).setData(0);
chunk.placeVoxels(gl, [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0]
]);

// Run game
const keys_down = new Set<string>();
function tick() {
    requestAnimationFrame(tick);
    world.tick(gl, keys_down);
}
tick();

document.body.addEventListener("keydown", e => {
    keys_down.add(e.key);
});

document.body.addEventListener("keyup", e => {
    keys_down.delete(e.key);
});

document.body.addEventListener("mousedown", e => {
    canvas.requestPointerLock();
});
document.body.addEventListener("mousemove", e => {
    if (document.pointerLockElement == canvas) world.lookRelative([ e.movementX, e.movementY], Math.PI * 0.002);
});