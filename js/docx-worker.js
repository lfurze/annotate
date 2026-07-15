/* Annotate — isolated DOCX conversion worker. Apache-2.0 */
importScripts("../vendor/mammoth.browser.min.js");

self.onmessage = async event => {
  try {
    const arrayBuffer = event.data;
    const result = await self.mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage: self.mammoth.images.imgElement(async image => ({ src: "data:" + image.contentType + ";base64," + await image.read("base64") })) }
    );
    self.postMessage({ html: result && result.value ? result.value : "<p>(empty document)</p>" });
  } catch (error) { self.postMessage({ error: error && error.message ? error.message : "DOCX conversion failed." }); }
};
