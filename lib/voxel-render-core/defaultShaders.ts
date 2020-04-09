import VOXEL_VERTEX_SOURCE from "./shaders/voxel.vert";
import VOXEL_FRAG_SOURCE from "./shaders/voxel.frag";
import {GlCtx} from "../utils/typeSafety/aliases";
import {OptionalReasoned} from "../utils/typeSafety/optionalReasoned";
import {GlShaderUtils} from "../utils/loading/shaderLoading";

export type CoreChunkRenderingShader = {
    program: WebGLProgram,
    uniform_chunk_pos: WebGLUniformLocation,
    uniform_projection_mat: WebGLUniformLocation,
    uniform_view_mat: WebGLUniformLocation,
    uniform_textures_sampler: WebGLUniformLocation,
    uniform_textures_count: WebGLUniformLocation,
    attrib_vertex_data: number
};

export const CoreVoxelRenderingShader = {
    /**
     * @desc The sources for the default voxel rendering shaders
     */
    source: {
        VERTEX: VOXEL_VERTEX_SOURCE,
        FRAGMENT: VOXEL_FRAG_SOURCE
    },

    /**
     * @desc Wraps an already loaded shader program in a VoxelRenderingShader data structure for use by default voxel
     * rendering logic. Finds locations of all attributes and uniforms assuming the types and names of the defaults
     * don't change.
     * @param gl: The WebGL context
     * @param program: The program to be wrapped. Must have attribute and uniform names comply with those of the default
     * shader. Fails silently otherwise.
     */
    wrapLoadedVoxelProgram(gl: GlCtx, program: WebGLProgram): CoreChunkRenderingShader {
        return {
            program,
            uniform_view_mat: gl.getUniformLocation(program, "view")!,
            uniform_projection_mat: gl.getUniformLocation(program, "projection")!,
            uniform_chunk_pos: gl.getUniformLocation(program, "chunk_pos")!,
            uniform_textures_sampler: gl.getUniformLocation(program, "texture_sampler")!,
            uniform_textures_count: gl.getUniformLocation(program, "tex_frame_counts")!,
            attrib_vertex_data: gl.getAttribLocation(program, "vertex_data")
        }
    },

    /**
     * @desc Loads the default shaders from VOXEL_RENDERING_SHADER.source and wraps it.
     * @param gl: The WebGl context
     * @returns An optional with either the wrapped program or a failure state.
     */
    loadDefaultVoxelShader(gl: GlCtx): OptionalReasoned<CoreChunkRenderingShader> {
        const {VERTEX, FRAGMENT} = this.source;
        const program_optional = GlShaderUtils.loadProgram(gl, VERTEX, FRAGMENT);
        if (!OptionalReasoned.isPresent(program_optional.raw)) return program_optional as any;
        return OptionalReasoned.success(this.wrapLoadedVoxelProgram(gl, program_optional.raw.obj));
    }
};