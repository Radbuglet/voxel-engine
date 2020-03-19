import {RecordKeys} from "../typescript/aliases";

/**
 * Makes a multidimensional number to scalar encoder.
 * NOTE: This utility does not validate the total possible size of any encoded scalar. It is important to note that
 * since these numbers are just plain JavaScript numbers, the encoded value could go past the MAX_SAFE_INTEGER and become
 * corrupted.
 * @param part_configs: The different parts of the number in order of least significant to most significant.
 */
export function makeNumberEncoder<TParts extends RecordKeys>(part_configs: { id: TParts, bits: number }[]) {
    // Setup parts
    const parts = new Map<TParts, { multiplier: number, max_val: number }>();
    let multiplier = 1;
    for (const part of part_configs) {
        console.assert(!parts.has(part.id));
        const max_val = 2 ** part.bits;
        parts.set(part.id, {
            multiplier,
            max_val
        });
        multiplier *= max_val;
    }

    // Make function
    return (values: Record<TParts, number> & object): number => {
        let final_val = 0;

        for (const key in values) {
            if (values.hasOwnProperty(key)) {
                const part = parts.get(key);
                console.assert(part != null);
                const value = values[key];
                console.assert(value < part!.max_val);
                final_val += part!.multiplier * value;
            }
        }

        return final_val;
    }
}
