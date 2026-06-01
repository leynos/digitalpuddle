/** @file CLI command contracts for future DigitalPuddle command dispatch. */

export type CliCommandResult = {
  readonly exitCode: number;
};

export interface CliCommand {
  readonly name: string;
  run(args: readonly string[]): CliCommandResult | Promise<CliCommandResult>;
}
