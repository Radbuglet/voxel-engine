import {mat4, vec3} from "gl-matrix";
import {GlCtx} from "../helpers/typescript/aliases";
import {VoxelRenderingShader} from "./defaultShaders";
import {IVoxelChunkRendererWrapper} from "./voxelChunkRenderer";

export type WorldChunksRenderingContext = {
    gl: GlCtx,
    program: VoxelRenderingShader
};
type ProjState = {
    clipping_near: number,
    clipping_far: number,
    aspect: number,
    fov_rad: number
};
type ViewState = {
    origin: vec3,
    pitch: number,
    yaw: number
};
export class VoxelChunkWorldRendering {
    constructor(ctx: WorldChunksRenderingContext, public proj_state: ProjState, public view_state: ViewState) {
        this.updatePerspectiveOnGpu(ctx);
        this.updateViewOnGpu(ctx);
    }

    updatePerspectiveOnGpu(ctx: WorldChunksRenderingContext) {
        const {proj_state} = this;
        const {gl, program} = ctx;
        const proj_mat = new Float32Array(16);
        mat4.perspective(proj_mat, proj_state.fov_rad, proj_state.aspect, proj_state.clipping_near, proj_state.clipping_far);
        gl.uniformMatrix4fv(program.uniform_projection_mat, false, proj_mat);
    }

    updateViewOnGpu(ctx: WorldChunksRenderingContext) {
        const {view_state} = this;
        const {gl, program} = ctx;
        const view_mat = mat4.create();
        mat4.translate(view_mat, view_mat, view_state.origin);
        mat4.rotateY(view_mat, view_mat, view_state.pitch);
        mat4.rotateX(view_mat, view_mat, view_state.yaw);
        mat4.invert(view_mat, view_mat);
        gl.uniformMatrix4fv(program.uniform_view_mat, false, view_mat);
    }

    render<TChunk extends IVoxelChunkRendererWrapper>(ctx: WorldChunksRenderingContext, chunk_provider: IterableIterator<TChunk>, chunk_pos_getter: (chunk: TChunk) => vec3) {
        const {gl, program} = ctx;
        gl.useProgram(program.program);
        for (const chunk of chunk_provider) {  // TODO: Culling
            const chunk_pos = chunk_pos_getter(chunk);
            chunk.voxel_chunk_renderer.render(gl, program, chunk_pos);
        }
    }
}