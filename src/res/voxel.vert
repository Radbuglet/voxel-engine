precision mediump float;

// Configuration constants
const float CHUNK_SIZE = 10.0;  // The chunk size is always 2 more than the amount of blocks in the chunk.
const float VOXEL_WORLD_SIZE = 1.0;

// Uniforms
uniform vec3 chunk_pos;
uniform mat4 projection;
uniform mat4 view;

// Vertex attributes
attribute vec2 vertex_data;  // (pos_idx, material_idx)
#define pos_idx vertex_data.x
#define mat_idx vertex_data.y

// Varyings
varying float depth;

void main() {
    // Voxel world position resolver. TODO: optimize (bitwise mult and shift/sub, maybe?)
    float vy_unwrapped = floor(pos_idx / CHUNK_SIZE);
    vec3 world_pos = VOXEL_WORLD_SIZE * (chunk_pos + vec3(
    mod(pos_idx, CHUNK_SIZE),
    mod(vy_unwrapped, CHUNK_SIZE),
    floor(vy_unwrapped / CHUNK_SIZE)
    ));

    // Gl stuff
    gl_Position = projection * view * vec4(world_pos, 1.0);
    depth = gl_Position.z;
}