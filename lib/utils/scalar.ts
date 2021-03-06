/**
 * @desc Returns whether a scalar is in the specified range (inclusive)
 */
export function inRange(min: number, val: number, max: number) {
    return min <= val && val <= max;
}

/**
 * @desc Limits the precision of a scalar such that all values are multiples of the divisor. Always rounds down.
 */
export function limitPrecision(val: number, divisor: number) {
    return Math.floor(val / divisor) * divisor;
}

/**
 * @desc An implementation of modulo that works on negatives as well.
 */
export function signedModulo(val: number, operand: number) {
    return val - limitPrecision(val, operand);
}

/**
 * @desc Clamps a scalar in the range: min <= val <= max.
 * @param val: The value to be clamped
 * @param min: The min (inclusive) of the clamp.
 * @param max: The max (inclusive) of the clamp.
 */
export function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}