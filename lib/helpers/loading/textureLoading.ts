import {AsyncResourceProvider} from "./asyncMultiResourceLoader";

export function makeTextureLoader(source: string, default_provider: (() => HTMLImageElement) | null = null): AsyncResourceProvider<HTMLImageElement> {
    return (finished, fatal) => {
        const image = new Image();
        image.src = source;
        image.addEventListener("load", () => {
            finished(image);
        });
        image.addEventListener("error", () => {
            if (default_provider != null) {
                finished(default_provider());
            } else {
                fatal(new Error("Failed to load required resource."));
            }
        });

        return null;
    };
}
