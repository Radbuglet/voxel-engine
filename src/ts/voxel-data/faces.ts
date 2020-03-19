import {vec3} from "gl-matrix";
import {IBool, Vec3Axis} from "../helpers/typescript/aliases";

const CHUNK_ENCODING_SIZE = 18;  // Must be the same as the constant in the vertex shader.
export const CHUNK_BLOCK_COUNT = CHUNK_ENCODING_SIZE - 2;
const CHUNK_SIZE_SQUARED = CHUNK_ENCODING_SIZE * CHUNK_ENCODING_SIZE;
export const FACE_UNIT_AXIS_ENCODED = [1, CHUNK_ENCODING_SIZE, CHUNK_SIZE_SQUARED];
export function encodeVertexPos(pos: vec3) {
    return pos[0] + pos[1] * CHUNK_ENCODING_SIZE + pos[2] * CHUNK_SIZE_SQUARED;
}

type EncodedAxisVertex = {
    pos: number,
    uv: number
};

export class FaceAxis {
    private readonly encoded_vertices: EncodedAxisVertex[];
    private readonly face_opp_rel_encoded: number;

    constructor(faces_conf: { pos: [IBool, IBool, IBool], uv: [IBool, IBool] }[], public readonly vec_axis: Vec3Axis) {
        this.encoded_vertices = faces_conf.map(face => {
            const { pos, uv } = face;
            return {
                pos: encodeVertexPos(pos),
                uv: uv[0] + 2 * uv[1]
            }
        });
        this.face_opp_rel_encoded = FACE_UNIT_AXIS_ENCODED[vec_axis];
    }

    appendQuad(target: Uint16Array, target_offset: number, encoded_origin: number, face_texture: number, face_light: number, sign: IBool) {
        const { encoded_vertices, face_opp_rel_encoded } = this;
        const common_vert_pos_encoded = encoded_origin + (sign == 1 ? face_opp_rel_encoded : 0);
        const common_material_encoded = face_light * 4 + face_texture * 255;

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

    encodeFace(encoded_origin: number, sign: IBool) {
        const { vec_axis, face_opp_rel_encoded } = this;
        return encoded_origin + (sign == 1 ? face_opp_rel_encoded : 0) + vec_axis / 10;
    }
}

export const FACE_AXIS = {
    X: new FaceAxis([
        // Tri 1
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [0, 1, 1], uv: [1, 1] },
        { pos: [0, 0, 1], uv: [0, 1] },

        // Tri 2
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [0, 1, 0], uv: [1, 0] },
        { pos: [0, 1, 1], uv: [1, 1] }
    ], 0),
    Y: new FaceAxis([
        // Tri 1
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [1, 0, 1], uv: [1, 1] },
        { pos: [1, 0, 0], uv: [1, 0] },

        // Tri 2
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [0, 0, 1], uv: [0, 1] },
        { pos: [1, 0, 1], uv: [1, 1] }
    ], 1),
    Z: new FaceAxis([
        // Tri 1
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [1, 0, 0], uv: [1, 0] },
        { pos: [1, 1, 0], uv: [1, 1] },

        // Tri 2
        { pos: [0, 0, 0], uv: [0, 0] },
        { pos: [1, 1, 0], uv: [1, 1] },
        { pos: [0, 1, 0], uv: [0, 1] }
    ], 2)
};

export type FaceKey = "px" |"py" | "pz" | "nx" |"ny" | "nz";
export type FaceDefinition = {
    vec_relative: vec3,
    encoded_relative: number,
    axis: FaceAxis,
    axis_sign: IBool,
    towards_key: FaceKey,
    inverse_key: FaceKey
};

export const FACES: Record<"nx" | "ny" | "nz" | "px" | "py" | "pz", FaceDefinition> = {
    nx: {
        vec_relative: [-1, 0, 0], encoded_relative: -FACE_UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 0,
        towards_key: "nx", inverse_key: "px"
    },
    px: {
        vec_relative: [1, 0, 0], encoded_relative:  FACE_UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 1,
        towards_key: "px", inverse_key: "nx"
    },
    ny: {
        vec_relative: [0, -1, 0], encoded_relative: -FACE_UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 0,
        towards_key: "ny", inverse_key: "py"
    },
    py: {
        vec_relative: [0, 1, 0], encoded_relative:  FACE_UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 1,
        towards_key: "py", inverse_key: "ny"
    },
    nz: {
        vec_relative: [0, 0, -1], encoded_relative: -FACE_UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 0,
        towards_key: "nz", inverse_key: "pz"
    },
    pz: {
        vec_relative: [0, 0, 1], encoded_relative:  FACE_UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 1,
        towards_key: "pz", inverse_key: "nz"
    }
};
export const FACE_LIST: FaceDefinition[] = [
    FACES.nx,
    FACES.ny,
    FACES.nz,
    FACES.px,
    FACES.py,
    FACES.pz
];