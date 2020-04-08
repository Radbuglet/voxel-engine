import {GlCtx} from "../typeSafety/aliases";

export class CleanupPool {
    private readonly tasks: (() => void)[] = [];

    registerTask(task: () => void) {
        this.tasks.push(task);
    }

    registerGlShader(gl: GlCtx, shader: WebGLShader) {
        this.registerTask(() => gl.deleteShader(shader));
    }

    registerGlProgram(gl: GlCtx, program: WebGLProgram) {
        this.registerTask(() => gl.deleteShader(program));
    }

    cleanup() {
        for (const task of this.tasks) {
            task();
        }
    }
}