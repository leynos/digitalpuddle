/**
 * @file CLI command contracts for future DigitalPuddle command dispatch.
 *
 * This module defines the shape of command handlers without implementing a
 * process runner. It gives later CLI work a stable home for command names,
 * argument handling, and exit-code results while keeping the current package
 * entry point and runtime behaviour unchanged.
 */

export type CliCommandResult = {
  readonly exitCode: number;
};

export interface CliCommand {
  readonly name: string;
  run(args: readonly string[]): CliCommandResult | Promise<CliCommandResult>;
}
