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
let voxel_shader: VoxelRenderingShader;
{
    const voxel_shader_optional = VOXEL_RENDERING_SHADER.loadDefaultVoxelShader(gl);
    if (voxel_shader_optional.type == "error") throw voxel_shader_optional.message;
    voxel_shader = voxel_shader_optional.obj;
}

const material_provider: IVoxelMaterialProvider<ExampleChunk, number> = {
    parseMaterialOfVoxel(pointer, face) {
        return {
            light: [25, 10, 16, 16, 50, 25][face.index],
            texture: Math.floor(Math.random() * 4)
        };
    }
};

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
            origin: [0, 0, -3],
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
        // Update

        // Render
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.clearColor(0.2, 0.2, 0.2, 1);
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
}

// Prepare world
const world = new ExampleWorld(gl);
const chunk = world.makeChunk(gl, [0, 0, 0]);
chunk.voxel_chunk_data.getVoxelPointer([0, 0, 0]).setData(0);
chunk.voxel_chunk_renderer.handleVoxelModifications(gl, chunk, [
    [0, 0, 0]
], material_provider);

// Run game
function tick(time: number) {
    requestAnimationFrame(tick);
    console.log(time);
    world.render(gl);
}