import {GlCtx} from "../typescript/aliases";
import {CleanupPool} from "../memory/cleanupPool";
import {OptionalReasoned} from "../typescript/optionalReasoned";

export const GL_UTILS = {
    loadShader(gl: GlCtx, type: "VERTEX_SHADER" | "FRAGMENT_SHADER", source: string): OptionalReasoned<WebGLShader> {
        const shader = gl.createShader(gl[type])!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);  // Cleanup
            return OptionalReasoned.error(`Failed to compile ${type}. Info log:\\n${gl.getShaderInfoLog(shader)}`);
        }
        return OptionalReasoned.success(shader);
    },
    loadProgram(gl: GlCtx, vertex_source: string, fragment_source: string): OptionalReasoned<WebGLProgram> {
        const cleanup_pool = new CleanupPool();

        // Compile shaders
        const vs_optional = this.loadShader(gl, "VERTEX_SHADER", vertex_source);
        if (!OptionalReasoned.isPresent(vs_optional.raw)) {
            cleanup_pool.cleanup();
            return vs_optional;
        }
        const vs = vs_optional.raw.obj;
        cleanup_pool.registerGlShader(gl, vs);

        const fs_optional = this.loadShader(gl, "FRAGMENT_SHADER", fragment_source);
        if (!OptionalReasoned.isPresent(fs_optional.raw)) {
            cleanup_pool.cleanup();
            return fs_optional;
        }
        const fs = fs_optional.raw.obj;
        cleanup_pool.registerGlShader(gl, fs);

        // Link program
        const program = gl.createProgram()!;
        cleanup_pool.registerGlProgram(gl, program);
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            cleanup_pool.cleanup();
            return OptionalReasoned.error(`Failed to link program. Info log:\n${gl.getProgramInfoLog(program)}`);
        }

        gl.validateProgram(program);
        if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
            cleanup_pool.cleanup();
            return OptionalReasoned.error(`Failed to validate program. Info log:\n${gl.getProgramInfoLog(program)}`);
        }

        return OptionalReasoned.success(program);
    }
};