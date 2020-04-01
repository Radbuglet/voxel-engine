import VOXEL_VERTEX_SOURCE from "./shaders/voxel.vert";
import VOXEL_FRAG_SOURCE from "./shaders/voxel.frag";
import {GlCtx, ObjOrFailure} from "../helpers/typescript/aliases";
import {GL_UTILS} from "../helpers/gl/shaderLoading";

export type VoxelRenderingShader = {
    program: WebGLProgram,
    uniform_chunk_pos: WebGLUniformLocation,
    uniform_projection_mat: WebGLUniformLocation,
    uniform_view_mat: WebGLUniformLocation,
    attrib_vertex_data: number
};

export const VOXEL_RENDERING_SHADER = {
    source: {
        VERTEX: VOXEL_VERTEX_SOURCE,
        FRAGMENT: VOXEL_FRAG_SOURCE
    },
    wrapLoadedVoxelProgram(gl: GlCtx, program: WebGLProgram): VoxelRenderingShader {
        return {  // TODO: Error handling using assertions
            program,
            uniform_view_mat: gl.getUniformLocation(program, "view")!,
            uniform_projection_mat: gl.getUniformLocation(program, "projection")!,
            uniform_chunk_pos: gl.getUniformLocation(program, "chunk_pos")!,
            attrib_vertex_data: gl.getAttribLocation(program, "vertex_data")
        }
    },
    loadDefaultVoxelShader(gl: GlCtx): ObjOrFailure<VoxelRenderingShader> {
        const {VERTEX, FRAGMENT} = this.source;
        const program_optional = GL_UTILS.loadProgram(gl, VERTEX, FRAGMENT);
        if (program_optional.type == "error") return program_optional;
        return {
            type: "success",
            obj: this.wrapLoadedVoxelProgram(gl, program_optional.obj)
        };
    }
};