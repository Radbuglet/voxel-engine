import {TypedArray} from "../typescript/aliases";

export function readTypedArrayBytes(view: TypedArray): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}