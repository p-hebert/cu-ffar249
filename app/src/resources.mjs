import { AFFECT_ENGINE_URL } from "src/constants.mjs";
import P5Global from "src/p5/global.mjs";
import AffectEngineClient from "src/services/affect-engine-client.mjs";
import FontBook from "src/utils/fonts.mjs";

export const resources = [
  {
    key: "font:source-sans-3",
    optional: false,
    /** @param {import('p5')} p5 */
    load: () => {
      const fontWeightFiles = {
        "source-sans-3--black":
          "assets/fonts/SourceSans3/SourceSans3-Black.ttf",
        "source-sans-3--black-italic":
          "assets/fonts/SourceSans3/SourceSans3-BlackItalic.ttf",
        "source-sans-3--bold": "assets/fonts/SourceSans3/SourceSans3-Bold.ttf",
        "source-sans-3--bold-italic":
          "assets/fonts/SourceSans3/SourceSans3-BoldItalic.ttf",
        "source-sans-3--extra-bold":
          "assets/fonts/SourceSans3/SourceSans3-ExtraBold.ttf",
        "source-sans-3--extra-bold-italic":
          "assets/fonts/SourceSans3/SourceSans3-ExtraBoldItalic.ttf",
        "source-sans-3--extra-light":
          "assets/fonts/SourceSans3/SourceSans3-ExtraLight.ttf",
        "source-sans-3--extra-light-italic":
          "assets/fonts/SourceSans3/SourceSans3-ExtraLightItalic.ttf",
        "source-sans-3--italic":
          "assets/fonts/SourceSans3/SourceSans3-Italic.ttf",
        "source-sans-3--light":
          "assets/fonts/SourceSans3/SourceSans3-Light.ttf",
        "source-sans-3--light-italic":
          "assets/fonts/SourceSans3/SourceSans3-LightItalic.ttf",
        "source-sans-3--medium":
          "assets/fonts/SourceSans3/SourceSans3-Medium.ttf",
        "source-sans-3--medium-italic":
          "assets/fonts/SourceSans3/SourceSans3-MediumItalic.ttf",
        "source-sans-3--regular":
          "assets/fonts/SourceSans3/SourceSans3-Regular.ttf",
        "source-sans-3--semi-bold":
          "assets/fonts/SourceSans3/SourceSans3-SemiBold.ttf",
        "source-sans-3--semi-bold-italic":
          "assets/fonts/SourceSans3/SourceSans3-SemiBoldItalic.ttf",
      };
      const p5 = P5Global.get();
      const promises = [];
      for (const [key, path] of Object.entries(fontWeightFiles)) {
        promises.push(FontBook.load(p5, key, path));
      }
      return Promise.all(promises);
    },
  },
  {
    key: "service:affect-engine",
    optional: false,
    load: () => {
      const client = AffectEngineClient.getInstance({
        url: AFFECT_ENGINE_URL,
      });
      return client.connect();
    },
  },
];
