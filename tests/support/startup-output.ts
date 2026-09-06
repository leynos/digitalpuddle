/**
 * @file Normalisation of captured CLI startup output for snapshotting.
 *
 * The startup tests snapshot a child process's combined output. Two things in
 * it are not properties of the program: the port, which is chosen per run, and
 * Node's warning about type stripping, which is written to stderr while the
 * server's first line goes to stdout, so their relative order varies between
 * runs. Removing both is what makes the snapshot a statement about the program
 * rather than about the scheduler.
 */

/**
 * Node's warning that type stripping is experimental, and its trailing hint.
 *
 * Matched precisely rather than by the `(node:` prefix. A filter on every
 * `(node:` line would also swallow an unrelated runtime warning such as a
 * deprecation notice, and a new startup diagnostic disappearing from the
 * snapshot is exactly what the snapshot exists to catch.
 */
const TRANSFORM_TYPES_WARNING = /^\(node:\d+\) ExperimentalWarning: Transform Types is an experimental feature/;
const TRANSFORM_TYPES_HINT = /^\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/;

/**
 * Remove the non-deterministic parts of captured startup output.
 *
 * @param output - Combined stdout and stderr captured from the child process.
 * @param port - The port the child was told to listen on.
 * @returns The output with the type-stripping warning removed and the port
 *   replaced by `<PORT>`, using `\n` line endings throughout.
 *
 * @example
 * ```ts
 * normaliseStartupOutput('listening on 4321\n', 4321);
 * // "listening on <PORT>\n"
 * ```
 */
export const normaliseStartupOutput = (output: string, port: number): string =>
  output
    // Either line ending: a `\r` left on a retained line would make the
    // snapshot differ between platforms.
    .split(/\r?\n/)
    .filter((line) => !TRANSFORM_TYPES_WARNING.test(line) && !TRANSFORM_TYPES_HINT.test(line))
    .join('\n')
    .replace(new RegExp(String(port), 'g'), '<PORT>');
