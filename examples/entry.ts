import {CoreVoxelRenderingShader} from "../lib/voxel-render-core/defaultShaders";
import {
    IVoxelChunkRendererWrapper,
    IVoxelMaterialProvider,
    VoxelChunkRenderer
} from "../lib/voxel-render-core/voxelChunkRenderer";
import {IVoxelChunkDataWrapper, VoxelChunkData} from "../lib/voxel-data/voxelChunkData";
import {GlCtx} from "../lib/utils/typeSafety/aliases";
import {vec2, vec3} from "gl-matrix";
import {VoxelWorldData} from "../lib/voxel-data/voxelWorldData";
import {VoxelChunkWorldRendering} from "../lib/voxel-render-core/voxelWorldChunksRenderer";
import {clamp, signedModulo} from "../lib/utils/scalar";
import {AsyncMultiResourceLoader} from "../lib/utils/loading/asyncMultiResourceLoader";
import {makeTextureLoader} from "../lib/utils/loading/textureLoading";
import VOXEL_TEXTURES_URL from "./voxel_textures.png";
import {FpsCameraController} from "../lib/voxel-render-core/fpsCameraController";

// Setup canvas
const canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.append(canvas);
const gl = canvas.getContext("webgl")!;

// Load textures
const multi_resource_loader = new AsyncMultiResourceLoader(
    9, true,
    {
        voxel_images: makeTextureLoader(VOXEL_TEXTURES_URL, null)
    });
multi_resource_loader.promise
    .then(assets => {
        // Create shading stuff
        const voxel_shader = CoreVoxelRenderingShader.loadDefaultVoxelShader(gl).getOrThrow();
        gl.useProgram(voxel_shader.program);

        const material_provider: IVoxelMaterialProvider<ExampleChunk, number> = {
            parseMaterialOfVoxel(pointer, face) {
                return {
                    light: [25, 10, 16, 16, 50, 25][face.index],
                    texture: Math.floor(Math.random() * 2)
                };
            }
        };

        // Load textures into WebGl
        {
            const tex_cell = 3;
            const texture = gl.createTexture()!;
            gl.activeTexture(gl.TEXTURE0 + tex_cell);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, assets.voxel_images);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.uniform1i(voxel_shader.uniform_textures_sampler, tex_cell);
            gl.uniform2f(voxel_shader.uniform_textures_count, 1, 2);
        }

        // Define world
        class ExampleWorld {
            private readonly camera = new FpsCameraController({
                aspect: canvas.width / canvas.height,
                clipping_near: 0.0001,
                clipping_far: 1000,
                fov_rad: Math.PI * 0.7
            }, {
                yaw: 0,
                pitch: 0,
                origin: [0, 0, 4]
            });
            public readonly voxel_world_data = new VoxelWorldData<ExampleChunk, number>();
            public readonly voxel_world_renderer: VoxelChunkWorldRendering;

            constructor(gl: GlCtx) {
                this.voxel_world_renderer = new VoxelChunkWorldRendering(gl, voxel_shader, this.camera);
            }

            makeChunk(gl: GlCtx, pos: vec3) {
                const chunk = new ExampleChunk(gl, pos);
                this.voxel_world_data.putChunk(pos, chunk);
                return chunk;
            }

            lookRelative(rel: vec2, sensitivity: number) {
                const {view_state} = this.camera;
                view_state.pitch -= rel[0] * sensitivity;
                view_state.yaw -= rel[1] * sensitivity;
                view_state.pitch = signedModulo(view_state.pitch, Math.PI * 2);
                view_state.yaw = clamp(view_state.yaw, -Math.PI / 2, Math.PI / 2);
                this.voxel_world_renderer.updateViewOnGpu(gl, voxel_shader);
            }

            tick(gl: GlCtx, keys_down: Set<string>) {
                // Update
                {
                    const {view_state} = this.camera;

                    // Generate horizontal heading
                    const heading: vec3 = [0, 0, 0];
                    if (keys_down.has("w")) heading[0]--;
                    if (keys_down.has("s")) heading[0]++;
                    if (keys_down.has("a")) heading[1]++;
                    if (keys_down.has("d")) heading[1]--;
                    if (keys_down.has("q")) heading[2]--;
                    if (keys_down.has("e")) heading[2]++;

                    // Generate relative movement
                    const relative: vec3 = [0, heading[2], 0];
                    if (heading[0] !== 0)
                        vec3.add(relative, relative, [Math.sin(view_state.pitch) * heading[0], 0, Math.cos(view_state.pitch) * heading[0]]);

                    if (heading[1] !== 0)
                        vec3.add(relative, relative, [-Math.cos(view_state.pitch) * heading[1], 0, Math.sin(view_state.pitch) * heading[1]]);

                    // Upload
                    vec3.normalize(relative, relative);
                    vec3.scale(relative, relative, 0.25);
                    vec3.add(view_state.origin, view_state.origin, relative);
                    if (relative[0] !== 0 || relative[1] !== 0 || relative[2] !== 0)
                        this.voxel_world_renderer.updateViewOnGpu(gl, voxel_shader);
                }

                // Render
                gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
                gl.clearColor(0.9, 0.9, 0.95, 1);
                gl.enableVertexAttribArray(voxel_shader.attrib_vertex_data);
                this.voxel_world_renderer.render<ExampleChunk>(gl, voxel_shader,
                    this.voxel_world_data.iterChunks(), chunk => chunk.pos);
                gl.disableVertexAttribArray(voxel_shader.attrib_vertex_data);
            }
        }

        class ExampleChunk implements IVoxelChunkDataWrapper<ExampleChunk, number>, IVoxelChunkRendererWrapper{
            public voxel_chunk_data: VoxelChunkData<ExampleChunk, number> = new VoxelChunkData<ExampleChunk, number>(this);
            public voxel_chunk_renderer: VoxelChunkRenderer;

            constructor(gl: GlCtx, public readonly pos: vec3) {
                this.voxel_chunk_renderer = new VoxelChunkRenderer(gl, gl.createBuffer()!);
            }

            placeVoxels(gl: GlCtx, positions: vec3[]) {
                const {voxel_chunk_data, voxel_chunk_renderer} = this;
                const write_pointer = voxel_chunk_data.getVoxelPointer([0, 0, 0]);
                for (const pos of positions) {
                    write_pointer.moveTo(pos);
                    write_pointer.setData(1);
                }
                voxel_chunk_renderer.handleVoxelModifications(gl, this, positions, material_provider);
            }
        }

        // Prepare world
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        const world = new ExampleWorld(gl);
        const chunk = world.makeChunk(gl, [0, 0, 0]);
        chunk.voxel_chunk_data.getVoxelPointer([0, 0, 0]).setData(0);
        chunk.placeVoxels(gl, [
            [0, 0, 0],
            [0, 1, 0],
            [1, 1, 0]
        ]);

        // Run game
        const keys_down = new Set<string>();
        function tick() {
            requestAnimationFrame(tick);
            world.tick(gl, keys_down);
        }
        tick();

        document.body.addEventListener("keydown", e => {
            keys_down.add(e.key);
        });

        document.body.addEventListener("keyup", e => {
            keys_down.delete(e.key);
        });

        document.body.addEventListener("mousedown", () => {
            canvas.requestPointerLock();
        });
        document.body.addEventListener("mousemove", e => {
            if (document.pointerLockElement == canvas) world.lookRelative([ e.movementX, e.movementY], Math.PI * 0.002);
        });
    })
    .catch(e => {
        console.error("Failed to load assets", e);
    });