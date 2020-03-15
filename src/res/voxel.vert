// TODO: Specify floating precision
// Configuration constants
const float CHUNK_SIZE = 8.0;
const float VOXEL_WORLD_SIZE = 1.0;

// Uniforms
uniform vec3 chunk_pos;
uniform mat4 projection;
uniform mat4 view;

// Vertex attributes
attribute vec2 vertex_data;  // (pos_idx, material_idx) TODO: We can optimize this even further and store everything in one `short` component.
#define pos_idx vertex_data.x
#define mat_idx vertex_data.y

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
}