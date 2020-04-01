import VOXEL_VERTEX_SOURCE from "./../res/voxel.vert";
import VOXEL_FRAG_SOURCE from "./../res/voxel.frag";

export type VoxelRenderingShader = {
    program: WebGLProgram,
    uniform_chunk_pos: WebGLUniformLocation,
    uniform_projection_mat: WebGLUniformLocation,
    uniform_view_mat: WebGLUniformLocation,
    attrib_vertex_data: number
};

export const VOXEL_RENDERING_SHADER_SRC = {
    VERTEX: VOXEL_VERTEX_SOURCE,
    FRAGMENT: VOXEL_FRAG_SOURCE
};