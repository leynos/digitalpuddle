/** Ambient typings for environment variables read by DigitalPuddle runtime code. */
declare namespace NodeJS {
  interface ProcessEnv {
    DIGITALPUDDLE_REQUEST_LOG?: string;
  }
}
