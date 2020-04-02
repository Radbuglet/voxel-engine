import {VOXEL_RENDERING_SHADER, VoxelRenderingShader} from "../lib/voxel-render-core/defaultShaders";
import {
    IVoxelChunkRendererWrapper,
    IVoxelMaterialProvider,
    VoxelChunkRenderer
} from "../lib/voxel-render-core/voxelChunkRenderer";
import {IVoxelChunkDataWrapper, VoxelChunkData} from "../lib/voxel-data/voxelChunkData";
import {GlCtx} from "../lib/helpers/typescript/aliases";
import {vec3} from "gl-matrix";
import {VoxelWorldData} from "../lib/voxel-data/voxelWorldData";
import {VoxelChunkWorldRendering, WorldChunksRenderingContext} from "../lib/voxel-render-core/voxelWorldChunksRenderer";

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
            pitch: 0,
            yaw: 0
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

    render(gl: GlCtx) {
        // Update  TODO: Freecam

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
const world = new ExampleWorld(gl);
const chunk = world.makeChunk(gl, [0, 0, 0]);
chunk.voxel_chunk_data.getVoxelPointer([0, 0, 0]).setData(0);
chunk.placeVoxels(gl, [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0]
]);

// Run game
function tick() {
    requestAnimationFrame(tick);
    world.render(gl);
}
tick();