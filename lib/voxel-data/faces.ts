import {vec3} from "gl-matrix";
import {IntBool, Vec3Axis} from "../utils/typeSafety/aliases";
import {makeNumberEncoder} from "../utils/memory/numberEncoder";

// Chunk position encoding
const POS_ENCODING_CHUNK_DIM = 17;  // Must be the same as the constant in the vertex shader.
export const UNIT_AXIS_ENCODED = [1, POS_ENCODING_CHUNK_DIM, POS_ENCODING_CHUNK_DIM ** 2];
export const CHUNK_BLOCK_COUNT = POS_ENCODING_CHUNK_DIM - 1;
export const encodeChunkPos = makeNumberEncoder([
    POS_ENCODING_CHUNK_DIM, POS_ENCODING_CHUNK_DIM, POS_ENCODING_CHUNK_DIM,  // Positional data
    4, 2  // Face encoding data
]);
const encodeMaterialData = makeNumberEncoder([
    2, 2,   // UV (x and y)
    64,     // Light
    256     // Texture
]);

// Face axis
type EncodedAxisVertex = {
    pos: number,
    uv: number
};

export class FaceAxis {
    private readonly encoded_vertices: EncodedAxisVertex[];
    private readonly face_opp_rel_encoded: number;

    constructor(faces_conf: { pos: [IntBool, IntBool, IntBool], uv: [IntBool, IntBool] }[], public readonly vec_axis: Vec3Axis) {
        this.encoded_vertices = faces_conf.map(face => {
            const {pos, uv} = face;
            return {
                pos: encodeChunkPos(pos),
                uv: encodeMaterialData(uv)
            }
        });
        this.face_opp_rel_encoded = UNIT_AXIS_ENCODED[vec_axis];
    }

    appendQuadData(target: Uint16Array, target_offset: number, encoded_origin: number, sign: IntBool, face_texture: number, face_light: number) {
        const {encoded_vertices, face_opp_rel_encoded} = this;
        const common_vert_pos_encoded = encoded_origin + (sign == 1 ? face_opp_rel_encoded : 0);
        const common_material_encoded = encodeMaterialData([face_light, face_texture], 2);

        function writeVertex(root_offset: number, face: EncodedAxisVertex) {
            const write_idx = target_offset + root_offset;
            target[write_idx] = common_vert_pos_encoded + face.pos;
            target[write_idx + 1] = common_material_encoded + face.uv;
        }

        writeVertex(0, encoded_vertices[0]);
        writeVertex(2, encoded_vertices[sign == 0 ? 2 : 1]);
        writeVertex(4, encoded_vertices[sign == 0 ? 1 : 2]);

        writeVertex(6, encoded_vertices[3]);
        writeVertex(8, encoded_vertices[sign == 0 ? 5 : 4]);
        writeVertex(10, encoded_vertices[sign == 0 ? 4 : 5]);
    }

    encodeFaceKey(encoded_origin: number, sign: IntBool) {
        const {vec_axis, face_opp_rel_encoded} = this;
        return encoded_origin + (sign == 1 ? face_opp_rel_encoded : 0) + encodeChunkPos([vec_axis, sign], 3);
    }
}

export const FACE_AXIS = {
    X: new FaceAxis([
        // Tri 1
        {pos: [0, 0, 0], uv: [0, 1]},
        {pos: [0, 1, 1], uv: [1, 0]},
        {pos: [0, 0, 1], uv: [1, 1]},

        // Tri 2
        {pos: [0, 0, 0], uv: [0, 1]},
        {pos: [0, 1, 0], uv: [0, 0]},
        {pos: [0, 1, 1], uv: [1, 0]}
    ], 0),
    Y: new FaceAxis([
        // Tri 1
        {pos: [0, 0, 0], uv: [0, 0]},
        {pos: [1, 0, 1], uv: [1, 1]},
        {pos: [1, 0, 0], uv: [1, 0]},

        // Tri 2
        {pos: [0, 0, 0], uv: [0, 0]},
        {pos: [0, 0, 1], uv: [0, 1]},
        {pos: [1, 0, 1], uv: [1, 1]}
    ], 1),
    Z: new FaceAxis([
        // Tri 1
        {pos: [0, 0, 0], uv: [0, 1]},
        {pos: [1, 0, 0], uv: [1, 1]},
        {pos: [1, 1, 0], uv: [1, 0]},

        // Tri 2
        {pos: [0, 0, 0], uv: [0, 1]},
        {pos: [1, 1, 0], uv: [1, 0]},
        {pos: [0, 1, 0], uv: [0, 0]}
    ], 2)
};

// Cube faces
export type FaceKey = "px" | "py" | "pz" | "nx" | "ny" | "nz";
export type FaceDefinition = {
    index: number,
    vec_relative: vec3,
    encoded_relative: number,
    axis: FaceAxis,
    axis_sign: IntBool,
    towards_key: FaceKey,
    inverse_key: FaceKey
};

export const FACES: Record<"nx" | "ny" | "nz" | "px" | "py" | "pz", FaceDefinition> = {
    nx: {
        index: 0,
        vec_relative: [-1, 0, 0], encoded_relative: -UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 0,
        towards_key: "nx", inverse_key: "px"
    },
    ny: {
        index: 1,
        vec_relative: [0, -1, 0], encoded_relative: -UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 0,
        towards_key: "ny", inverse_key: "py"
    },
    nz: {
        index: 2,
        vec_relative: [0, 0, -1], encoded_relative: -UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 0,
        towards_key: "nz", inverse_key: "pz"
    },
    px: {
        index: 3,
        vec_relative: [1, 0, 0], encoded_relative: UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 1,
        towards_key: "px", inverse_key: "nx"
    },
    py: {
        index: 4,
        vec_relative: [0, 1, 0], encoded_relative: UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 1,
        towards_key: "py", inverse_key: "ny"
    },
    pz: {
        index: 5,
        vec_relative: [0, 0, 1], encoded_relative: UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 1,
        towards_key: "pz", inverse_key: "nz"
    }
};
export const FACES_LIST: FaceDefinition[] = [
    FACES.nx,
    FACES.ny,
    FACES.nz,
    FACES.px,
    FACES.py,
    FACES.pz
];
export const FACE_AXIS_AND_SIGN_MAP = [{
    positive: FACES.px,
    negative: FACES.nx
}, {
    positive: FACES.py,
    negative: FACES.ny
}, {
    positive: FACES.pz,
    negative: FACES.nz
}];