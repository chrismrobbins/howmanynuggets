# point misaki's espeak fallback at Homebrew's espeak-ng (the bundled loader's data path is broken on macOS)
import espeakng_loader
espeakng_loader.get_library_path = lambda: '/opt/homebrew/lib/libespeak-ng.dylib'
espeakng_loader.get_data_path = lambda: '/opt/homebrew/share/espeak-ng-data'
