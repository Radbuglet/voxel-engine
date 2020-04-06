import {AsyncResourceTaskProvider} from "./resourceLoader";

export function makeAsyncTextureLoader(src: string): AsyncResourceTaskProvider<HTMLImageElement> {  // TODO: Properly handle interrupt events.
    return (finish, fatal) => {
        const image = new Image();
        image.src = src;
        image.onload = () => {
            finish(image);
        };
        image.onerror = () => {
            fatal("Failed to load mandatory image");
        };

        return {
            pause() {},
            resume() {}
        }
    }
}
