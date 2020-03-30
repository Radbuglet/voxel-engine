export type VoxelRenderingShader = {
    program: WebGLProgram,
    uniform_chunk_pos: WebGLUniformLocation,
    attrib_vertex_data: number
};

// TODO: Add methods for loading the shader.