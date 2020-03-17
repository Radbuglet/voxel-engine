precision mediump float;
varying vec2 uv;
varying float light;

void main() {
    gl_FragColor = vec4(uv.x, uv.y, 0.0, 1.0);
}