/* Annotate — local PDF.js module bridge. Apache-2.0 */
import * as pdfjsLib from "../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event("annotate-pdf-ready"));
