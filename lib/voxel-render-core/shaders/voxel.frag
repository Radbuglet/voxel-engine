precision mediump float;
varying vec2 uv;
varying float light;
uniform sampler2D texture_sampler;

void main() {
    gl_FragColor = texture2D(texture_sampler, uv) * vec4(vec3(light / 32.0), 1.0);
}