declare module "lzma" {
  export function decompress(
    data: Buffer | Uint8Array,
    cb: (value: Buffer | number[] | string, error: Error | null) => void,
  ): void;
}
declare module "lzma/src/lzma_worker.js" {
  const lzmaModule: {
    LZMA_WORKER: {
      decompress: (
        data: Buffer,
        cb: (value: Buffer | number[] | string, error: Error | null) => void,
      ) => void;
    };
  };
  export default lzmaModule;
}
declare module "qrcode" {
  const value: {
    toDataURL: (
      text: string,
      options?: Record<string, unknown>,
    ) => Promise<string>;
  };
  export default value;
}
