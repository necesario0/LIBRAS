// Metro turns an imported image into an asset id that <Image source> accepts.
declare module "*.png" {
  const source: number;
  export default source;
}
