import {PartialRecord, RecordKeys} from "../typescript/aliases";
import {inRange} from "../scalar";

/**
 * @desc Makes a multidimensional number to scalar encoder.
 * NOTE: This utility does not validate the total possible size of any encoded scalar. It is important to note that
 * since these numbers are just plain JavaScript numbers, the encoded value could go past the MAX_SAFE_INTEGER and become
 * corrupted.
 * @param part_configs: The different parts of the number in order of least significant to most significant.
 * The max_val is exclusive and values for that component can range from 0 to max_val - 1.
 */
export function makeNumberEncoder<TParts extends RecordKeys>(part_configs: { id: TParts, max_val: number }[]) {
    // Setup parts
    const parts = new Map<TParts, { multiplier: number, max_val: number }>();
    let multiplier = 1;
    for (const part of part_configs) {
        const max_val = Math.floor(part.max_val);
        console.assert(!parts.has(part.id) && max_val > 0);
        parts.set(part.id, {
            multiplier,
            max_val
        });
        multiplier *= max_val;
    }

    // Make function
    return (values: PartialRecord<TParts, number> & object): number => {
        let final_val = 0;

        for (const key in values) {
            if (values.hasOwnProperty(key)) {
                const part = parts.get(key);
                console.assert(part != null);
                const value = Math.floor(values[key]!);
                console.assert(inRange(0, value, part!.max_val - 1));
                final_val += part!.multiplier * value;
            }
        }

        return final_val;
    }
}