/** @file Compile-time tests for CLI command contracts. */
import type {CliCommand, CliCommandResult} from '../src/cli/index.ts';

declare const result: CliCommandResult;

result satisfies {
  readonly exitCode: number;
};

declare const command: CliCommand;

command satisfies {
  readonly name: string;
  run(args: readonly string[]): CliCommandResult | Promise<CliCommandResult>;
};
