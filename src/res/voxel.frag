precision mediump float;
varying vec2 uv;
varying float light;

void main() {  // TODO: Shading
    gl_FragColor = vec4(vec3(uv.x, uv.y, 1.0) * light / 32.0, 1.0);
}