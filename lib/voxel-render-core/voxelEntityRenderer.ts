export interface IRenderBucketProvider<TContext, TTarget> {
    entity_rendering_bucket: IRenderBucket<TContext, TTarget>;
}

export interface IRenderBucket<TContext, TTarget> {
    begin(context: TContext): {
        render(context: TContext, target: TTarget): void,
        finish(context: TContext): void
    }
}

/**
 * @desc Provides a simple system for rendering entities in batches (what this utility calls batches).
 * Batches are determined by a "rendering bucket" which defines the startup, render, and cleanup logic for rendering a
 * group of entities.
 * A bucket could be used for each type of entity or a bucket could be shared if multiple entities have shared WebGl
 * state that doesn't need to be modified.
 * NOTE: Entity buckets and the entities they contain are rendered in an arbitrary order.
 */
export class VoxelEntityRenderer<TContext> {
    private readonly entity_buckets = new Map<IRenderBucket<TContext, any>, Set<any>>();

    registerEntity<TTarget extends IRenderBucketProvider<TContext, TTarget>>(target: TTarget) {
        const {entity_buckets} = this;
        const {entity_rendering_bucket: bucket} = target;

        let entities: Set<any> | undefined = entity_buckets.get(bucket);
        if (entities == null) {
            entities = new Set();
            entity_buckets.set(bucket, entities);
        }
        entities.add(target);
    }

    unregisterEntity<TTarget extends IRenderBucketProvider<TContext, TTarget>>(entity: TTarget) {
        const {entity_rendering_bucket} = entity;
        const entities = this.entity_buckets.get(entity_rendering_bucket);
        console.assert(entities != null);
        entities!.delete(entity);
        if (entities!.size == 0) {
            this.entity_buckets.delete(entity_rendering_bucket);
        }
    }

    clearAllBuckets() {
        this.entity_buckets.clear();
    }

    clearBucket(bucket: IRenderBucket<TContext, any>) {
        this.entity_buckets.delete(bucket);
    }

    render(context_data: TContext) {
        for (const [bucket, entities] of this.entity_buckets.entries()) {
            const context = bucket.begin(context_data);
            for (const entity of entities.values()) {
                context.render(context_data, entity);
            }
            context.finish(context_data);
        }
    }
}