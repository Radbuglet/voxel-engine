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
    constructor(private proj_state: ProjState, private view_state: ViewState) {}

    updatePerspective(ctx: WorldChunksRenderingContext, new_proj: ProjState) {
        this.proj_state = new_proj;
        const {gl, program} = ctx;
        const proj_mat = new Float32Array(16);
        mat4.perspective(proj_mat, new_proj.fov_rad, new_proj.aspect, new_proj.clipping_near, new_proj.clipping_far);
        gl.uniformMatrix4fv(program.uniform_projection_mat, false, proj_mat);
    }

    updatePerspectiveCpuMirrorOnly(new_proj: ProjState) {
        this.proj_state = new_proj;
    }

    updateView(ctx: WorldChunksRenderingContext, new_view: ViewState) {
        this.view_state = new_view;
        const {gl, program} = ctx;
        const view_mat = mat4.create();
        mat4.translate(view_mat, view_mat, new_view.origin);
        mat4.rotateY(view_mat, view_mat, new_view.pitch);
        mat4.rotateX(view_mat, view_mat, new_view.yaw);
        mat4.invert(view_mat, view_mat);
        gl.uniformMatrix4fv(program.uniform_view_mat, false, view_mat);
    }

    updateViewCpuMirrorOnly(new_view: ViewState) {
        this.view_state = new_view;
    }

    render<TChunk extends IVoxelChunkRendererWrapper>(ctx: WorldChunksRenderingContext, chunk_provider: Iterable<TChunk>, chunk_pos_getter: (chunk: TChunk) => vec3) {
        const {gl, program} = ctx;
        gl.useProgram(program.program);
        for (const chunk of chunk_provider) {  // TODO: Culling
            const chunk_pos = chunk_pos_getter(chunk);
            chunk.voxel_chunk_renderer.draw(gl, program, chunk_pos);
        }
    }
}