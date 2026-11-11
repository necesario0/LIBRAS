// Metro turns an imported image into an asset id that <Image source> accepts.
declare module "*.png" {
  const source: number;
  export default source;
}

// An .svg import is the file's XML text (see metro.config.js). Draw it with <SvgXml xml={...} />.
declare module "*.svg" {
  const xml: string;
  export default xml;
}
