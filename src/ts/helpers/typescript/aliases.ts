export type GlCtx = WebGLRenderingContext;
export type Vec3Axis = 0 | 1 | 2;
export type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray
    | Int16Array | Uint16Array | Int32Array | Uint32Array
    | Float32Array | Float64Array;

export type RecordKeys = keyof any;
export type RecordV<V> = Record<RecordKeys, V>;
export type IBool = 0 | 1;