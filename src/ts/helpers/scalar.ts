/**
 * @desc Returns whether a scalar is in the specified range (inclusive)
 */
export function inRange(min: number, val: number, max: number) {
    return min <= val && val <= max;
}