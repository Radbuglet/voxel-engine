import {TypedArray} from "../typeSafety/aliases";

export function readTypedArrayBytes(view: TypedArray): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}