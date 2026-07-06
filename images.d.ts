// Next.js emits imported image files as objects with a `src` URL (and dims).
declare module "*.png" {
  const content: { src: string; height: number; width: number };
  export default content;
}
