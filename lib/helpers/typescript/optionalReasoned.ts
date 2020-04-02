type OptionalReasonedRaw<T> = { type: "success", obj: T} | { type: "error", reason: string};

export class OptionalReasoned<T> {
    constructor(public readonly raw: OptionalReasonedRaw<T>) {}

    static success<T>(obj: T): OptionalReasoned<T> {
        return new OptionalReasoned<T>({
            type: "success",
            obj
        });
    }

    static error<T>(reason: string): OptionalReasoned<T> {
        return new OptionalReasoned<T>({
            type: "error",
            reason
        });
    }

    static isPresent<T>(raw: OptionalReasonedRaw<T>): raw is { type: "success", obj: T } {
        return raw.type === "success";
    }

    getOrDefault<TD>(def: TD): T | TD {
        const {raw} = this;
        if (OptionalReasoned.isPresent(raw)) return raw.obj;
        return def;
    }

    getOrElse<TD>(fallback: () => TD): T | TD {
        const {raw} = this;
        if (OptionalReasoned.isPresent(raw)) return raw.obj;
        return fallback();
    }

    getOrThrow(): T {
        const {raw} = this;
        if (OptionalReasoned.isPresent(raw)) return raw.obj;
        throw raw.reason;
    }
}