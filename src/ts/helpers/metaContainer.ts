export type MetaKey<T> = { symbol: Symbol, __type: T };
export function makeMetaKey<T>(): MetaKey<T> {
    return { symbol: Symbol() } as unknown as MetaKey<T>;
}

export class MetaContainer {
    private readonly meta = new Map<Symbol, any>();

    putMeta<TKey extends MetaKey<any>>(key: TKey, obj: TKey["__type"]) {
        this.meta.set(key.symbol, obj);
    }

    getMeta<TKey extends MetaKey<any>>(key: TKey): TKey["__type"] | undefined {
        return this.meta.get(key.symbol);
    }
}