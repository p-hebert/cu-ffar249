import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
} from "@huggingface/transformers";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class VadBert {
  static instance = null;

  static async getInstance() {
    if (!VadBert.instance) {
      const model = new VadBert();
      await model.#load();
      VadBert.instance = model;
    }
    return VadBert.instance;
  }

  #tokenizer = null;
  #model = null;

  #modelDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "models",
    "vad-bert-onnx",
  );

  /**
   * Load tokenizer + model once.
   * Safe to call multiple times.
   */
  async #load() {
    this.#tokenizer = await AutoTokenizer.from_pretrained(this.#modelDir, {
      local_files_only: true,
    });

    this.#model = await AutoModelForSequenceClassification.from_pretrained(
      this.#modelDir,
      {
        dtype: "fp32",
        local_files_only: true,
      },
    );
  }

  /**
   * Predict raw VAD values for one sentence.
   *
   * @param {string} text
   * @returns {Promise<{valence:number, arousal:number, dominance:number}>}
   */
  async predict(text) {
    const inputs = await this.#tokenizer(text, {
      padding: true,
      truncation: true,
    });

    const outputs = await this.#model(inputs);
    const [valence, arousal, dominance] = outputs.logits.tolist()[0];

    return { valence, arousal, dominance };
  }

  /**
   * Predict raw VAD values for many sentences at once.
   *
   * @param {string[]} texts
   * @returns {Promise<Array<{valence:number, arousal:number, dominance:number}>>}
   */
  async predictMany(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error(
        "VadBert.predictMany(texts): texts must be a non-empty array.",
      );
    }

    const cleanTexts = texts.map((t) => {
      if (typeof t !== "string" || t.trim() === "") {
        throw new Error(
          "VadBert.predictMany(texts): every item must be a non-empty string.",
        );
      }
      return t;
    });

    await this.#load();

    const inputs = await this.#tokenizer(cleanTexts, {
      padding: true,
      truncation: true,
    });

    const outputs = await this.#model(inputs);
    const rows = outputs.logits.tolist();

    return rows.map(([valence, arousal, dominance]) => ({
      valence,
      arousal,
      dominance,
    }));
  }

  /**
   * Normalize a raw VAD value from domain [1, 5] to a caller-chosen range.
   *
   * @param {number} x
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static normalize(x, min = 0, max = 100) {
    const DOMAIN_MIN = 1;
    const DOMAIN_MAX = 5;

    const clamped = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, x));

    const t = (clamped - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN);

    return min + t * (max - min);
  }

  /**
   * Normalize a full VAD triplet to a caller-chosen range.
   *
   * @param {{valence:number, arousal:number, dominance:number}} vad
   * @param {number} min
   * @param {number} max
   * @returns {{valence:number, arousal:number, dominance:number}}
   */
  static normalizeVAD(vad, min = 0, max = 100) {
    return {
      valence: VadBert.normalize(vad.valence, min, max),
      arousal: VadBert.normalize(vad.arousal, min, max),
      dominance: VadBert.normalize(vad.dominance, min, max),
    };
  }
}
