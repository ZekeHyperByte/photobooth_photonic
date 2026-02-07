declare module 'form-data' {
  import { Readable } from 'stream';

  class FormData {
    append(key: string, value: any, options?: any): void;
    getHeaders(): Record<string, string>;
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    submit(params: string | object, callback?: (error: Error | null, response: any) => void): any;
    getBuffer(): Buffer;
    getBoundary(): string;
    getLength(callback: (error: Error | null, length: number) => void): void;
    getLengthSync(): number;
    hasKnownLength(): boolean;
  }

  export = FormData;
}
