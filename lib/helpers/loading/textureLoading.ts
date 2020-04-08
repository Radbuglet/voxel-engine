import {AsyncResourceProvider} from "./asyncMultiResourceLoader";

/**
 * @desc A factory for a new async texture loader for use in an AsyncMultiResourceLoader.
 * @param source: The source URI of the texture to be loaded.
 * @param fallback_provider: An optional provider for a fallback. If provided, the return of the fallback provider will be
 * provided if the texture fails to load. If no fallback provider exists, a fatal error will be raised if the texture fails to load.
 */
export function makeTextureLoader(source: string, fallback_provider: (() => HTMLImageElement) | null = null): AsyncResourceProvider<HTMLImageElement> {
    return (finished, fatal) => {
        const image = new Image();
        image.src = source;
        image.addEventListener("load", () => {
            finished(image);
        });
        image.addEventListener("error", () => {
            if (fallback_provider != null) {
                finished(fallback_provider());
            } else {
                fatal(new Error("Failed to load required resource."));
            }
        });

        return null;
    };
}
