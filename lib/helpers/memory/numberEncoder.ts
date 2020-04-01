/**
 * @desc Generates a function which transforms a multidimensional number to a scalar.
 * NOTE: The function does not validate the size of each component against the max possible configured size.
 * NOTE: This utility does not validate the total possible size of any encoded scalar. It is important to note that
 * since these numbers are just plain JavaScript numbers, the encoded value could go past the MAX_SAFE_INTEGER and become
 * corrupted.
 * @param dimension_sizes: The max values for different parts of the number in order of least significant to most significant.
 * The max val is exclusive and values for that component can range from 0 to max val - 1.
 * NOTE: This array is modified by the utility!!
 */
export function makeNumberEncoder(dimension_sizes: number[]) {
    // Setup parts
    let multiplier = 1;
    let part_idx = 0;
    for (const part_max_val of dimension_sizes) {
        const max_val = Math.floor(part_max_val);
        console.assert(max_val > 0);
        dimension_sizes[part_idx] = multiplier;
        multiplier *= max_val;
        part_idx++;
    }

    // Make function
    return (values: { [key: number]: number } & { length: number }, values_offset: number = 0): number => {
        let final_val = 0;
        console.assert(values_offset + values.length <= dimension_sizes.length);
        for (let idx = 0; idx < values.length; idx++) {
            final_val += values[idx] * dimension_sizes[idx + values_offset];  // In this context, dimension_sizes means the dimension multiplier because
        }
        return final_val;
    }
}