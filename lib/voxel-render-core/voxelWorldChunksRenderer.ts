import {mat4, vec3} from "gl-matrix";
import {GlCtx} from "../utils/typeSafety/aliases";
import {ChunkRenderingShader} from "./defaultShaders";
import {IVoxelChunkRendererWrapper} from "./voxelChunkRenderer";
import {FpsCameraController} from "./fpsCameraController";

export class VoxelChunkWorldRendering {
    /**
     * @desc Creates a new chunk world renderer. The initial CPU mirrored state is automatically uploaded to the shader's
     * uniforms.
     * NOTE: This utility requires that the voxel rendering shader be the actively bound program on the context.
     * @param gl: The WebGl context
     * @param program: The shader being used for rendering voxel chunks
     * @param camera: The active camera. The camera's state and which camera is active can be modified however the
     * respective updateXXOnGpu() methods must be called in order to relay this information to the GPU.
     */
    constructor(gl: GlCtx, program: ChunkRenderingShader, public camera: FpsCameraController) {
        this.updatePerspectiveOnGpu(gl, program);
        this.updateViewOnGpu(gl, program);
    }

    /**
     * @desc Updates the uniforms on the voxel rendering shader to match the active projection state.
     * NOTE: This utility requires that the voxel rendering shader be the actively bound program on the context.
     */
    updatePerspectiveOnGpu(gl: GlCtx, program: ChunkRenderingShader) {
        gl.uniformMatrix4fv(program.uniform_projection_mat, false, this.camera.generateProjectionMatrix());
    }

    /**
     * @desc Updates the uniforms on the voxel rendering shader to match the active view state.
     * NOTE: This utility requires that the voxel rendering shader be the actively bound program on the context.
     */
    updateViewOnGpu(gl: GlCtx, program: ChunkRenderingShader) {
        gl.uniformMatrix4fv(program.uniform_view_mat, false, this.camera.generateViewMatrix());
    }

    /**
     * @desc Renders the chunks provided by the chunk_provider iterator. Employs frustum culling on a chunk by chunk basis
     * based on the cpu mirror of the projection and view states.
     * @param gl: The WebGl context
     * @param program: The shader being used for rendering voxel chunks
     * @param chunk_provider: An iterator providing the chunk wrappers to be renderer.
     * @param chunk_pos_getter: A callback used to find the position of the chunk in chunk world space for a given wrapped chunk.
     */
    render<TChunk extends IVoxelChunkRendererWrapper>(gl: GlCtx, program: ChunkRenderingShader, chunk_provider: IterableIterator<TChunk>, chunk_pos_getter: (chunk: TChunk) => vec3) {
        gl.useProgram(program.program);
        for (const chunk of chunk_provider) {  // TODO: Culling
            const chunk_pos = chunk_pos_getter(chunk);
            chunk.voxel_chunk_renderer.render(gl, program, chunk_pos);
        }
    }
}