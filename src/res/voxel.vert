precision mediump float;

// Configuration constants
const float CHUNK_SIZE = 10.0;  // The chunk size is always 2 more than the amount of blocks in the chunk.
const float VOXEL_WORLD_SIZE = 1.0;

// Uniforms
uniform vec3 chunk_pos;
uniform mat4 projection;
uniform mat4 view;

// Vertex attributes
attribute vec2 vertex_data;  // (pos_idx, material: 8<texture_id> 6<light> 2<uv>)
#define pos_idx vertex_data.x
#define mat_data vertex_data.y

// Varyings
varying float light;
varying vec2 uv;

void main() {  // TODO: Optimize all this processing!
    // Voxel world position resolver.
    float vy_unwrapped = floor(pos_idx / CHUNK_SIZE);
    vec3 world_pos = VOXEL_WORLD_SIZE * (chunk_pos + vec3(
        mod(pos_idx, CHUNK_SIZE),
        mod(vy_unwrapped, CHUNK_SIZE),
        floor(vy_unwrapped / CHUNK_SIZE)
    ));

    // Texture processing
    int texture_idx = int(floor(mat_data / 255.0));
    float second_part = mod(mat_data, 255.0);
    float uv_encoded = mod(second_part, 4.0);
    uv = vec2(  // TODO: Take into acount the texture index.
        uv_encoded > 1.0 ? 1.0 : 0.0,
        mod(uv_encoded, 2.0) == 1.0 ? 1.0 : 0.0);
    // TODO: Parse lighting data

    // Gl stuff
    gl_Position = projection * view * vec4(world_pos, 1.0);
}