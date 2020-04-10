import {mat4, vec3} from "gl-matrix";

export type FpsCameraProjState = {
    clipping_near: number,
    clipping_far: number,
    aspect: number,
    fov_rad: number
};
export type FpsCameraViewState = {
    origin: vec3,
    pitch: number,  // ie horizontal rotation
    yaw: number  // ie vertical rotation
};
export class FpsCameraController {
    constructor(public proj_state: FpsCameraProjState, public view_state: FpsCameraViewState) {}

    generateProjectionMatrix(): mat4 {
        const {proj_state} = this;
        const write_to = mat4.create();
        mat4.perspective(write_to, proj_state.fov_rad, proj_state.aspect, proj_state.clipping_near, proj_state.clipping_far);
        return write_to;
    }

    generateViewMatrix(): mat4 {
        const {view_state} = this;
        const write_to = mat4.create();
        mat4.translate(write_to, write_to, view_state.origin);
        mat4.rotateY(write_to, write_to, view_state.pitch);
        mat4.rotateX(write_to, write_to, view_state.yaw);
        mat4.invert(write_to, write_to);
        return write_to;
    }

    getDirection(): vec3 {
        const {view_state} = this;
        return FpsCameraController.getDirection(view_state.pitch, view_state.yaw);
    }

    static getDirection(pitch: number, yaw: number): vec3 {
        const horiz_component_magnitude = Math.cos(yaw);
        return [
            Math.cos(pitch) * horiz_component_magnitude,
            Math.sin(yaw),
            Math.sin(pitch) * horiz_component_magnitude
        ];
    }
}