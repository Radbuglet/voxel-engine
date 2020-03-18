import {vec3} from "gl-matrix";
import {IBool, Vec3Axis} from "../helpers/typescript/aliases";

const CHUNK_ENCODING_SIZE = 10;  // Must be the same as the constant in the vertex shader.
export const CHUNK_BLOCK_SIZE = CHUNK_ENCODING_SIZE - 2;
const CHUNK_SIZE_SQUARED = CHUNK_ENCODING_SIZE * CHUNK_ENCODING_SIZE;
export const FACE_UNIT_AXIS_ENCODED = [1, CHUNK_ENCODING_SIZE, CHUNK_SIZE_SQUARED];
export function encodeVertexPos(pos: vec3) {
    return pos[0] + pos[1] * CHUNK_ENCODING_SIZE + pos[2] * CHUNK_SIZE_SQUARED;
}

type EncodedFace = {
    pos: number,
    uv: number
};

export class FaceAxis {
    private readonly faces_encoded: EncodedFace[];
    private readonly face_opp_rel_encoded: number;

    constructor(faces_conf: { pos: [IBool, IBool, IBool], uv: [IBool, IBool] }[], public readonly vec_axis: Vec3Axis) {
        this.faces_encoded = faces_conf.map(face => {
            const { pos, uv } = face;
            return {
                pos: encodeVertexPos(pos),
                uv: uv[0] + 2 * uv[1]
            }
        });
        this.face_opp_rel_encoded = FACE_UNIT_AXIS_ENCODED[vec_axis];
    }

    appendQuad(target: Uint16Array, target_offset: number, encoded_origin: number, sign: IBool) {
        const { faces_encoded, face_opp_rel_encoded } = this;
        const common_vec_encoded = encoded_origin + (sign == 1 ? face_opp_rel_encoded : 0);
        function writeVertex(root_offset: number, face: EncodedFace) {
            const write_idx = target_offset + root_offset;
            target[write_idx] = common_vec_encoded + face.pos;
            target[write_idx + 1] = face.uv;
        }
        writeVertex(0, faces_encoded[0]);
        writeVertex(2, faces_encoded[sign == 0 ? 2 : 1]);
        writeVertex(4, faces_encoded[sign == 0 ? 1 : 2]);

        writeVertex(6, faces_encoded[3]);
        writeVertex(8, faces_encoded[sign == 0 ? 5 : 4]);
        writeVertex(10, faces_encoded[sign == 0 ? 4 : 5]);
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

type NeighborChunkProps = "neighbor_px" |"neighbor_py" | "neighbor_pz" | "neighbor_nx" |"neighbor_ny" | "neighbor_nz";
export type FaceDefinition = {
    vec_relative: vec3,
    encoded_relative: number,
    axis: FaceAxis,
    axis_sign: IBool,
    chunk_towards_prop: NeighborChunkProps,
    chunk_inverse_prop: NeighborChunkProps
};

export const FACES: Record<"nx" | "ny" | "nz" | "px" | "py" | "pz", FaceDefinition> = {
    nx: {
        vec_relative: [-1, 0, 0], encoded_relative: -FACE_UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 0,
        chunk_towards_prop: "neighbor_nx", chunk_inverse_prop: "neighbor_px"
    },
    px: {
        vec_relative: [1, 0, 0], encoded_relative:  FACE_UNIT_AXIS_ENCODED[0],
        axis: FACE_AXIS.X, axis_sign: 1,
        chunk_towards_prop: "neighbor_px", chunk_inverse_prop: "neighbor_nx"
    },
    ny: {
        vec_relative: [0, -1, 0], encoded_relative: -FACE_UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 0,
        chunk_towards_prop: "neighbor_ny", chunk_inverse_prop: "neighbor_py"
    },
    py: {
        vec_relative: [0, 1, 0], encoded_relative:  FACE_UNIT_AXIS_ENCODED[1],
        axis: FACE_AXIS.Y, axis_sign: 1,
        chunk_towards_prop: "neighbor_py", chunk_inverse_prop: "neighbor_ny"
    },
    nz: {
        vec_relative: [0, 0, -1], encoded_relative: -FACE_UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 0,
        chunk_towards_prop: "neighbor_nz", chunk_inverse_prop: "neighbor_pz"
    },
    pz: {
        vec_relative: [0, 0, 1], encoded_relative:  FACE_UNIT_AXIS_ENCODED[2],
        axis: FACE_AXIS.Z, axis_sign: 1,
        chunk_towards_prop: "neighbor_pz", chunk_inverse_prop: "neighbor_nz"
    },
};
export const FACE_LIST: FaceDefinition[] = [
    FACES.nx,
    FACES.ny,
    FACES.nz,
    FACES.px,
    FACES.py,
    FACES.pz
];