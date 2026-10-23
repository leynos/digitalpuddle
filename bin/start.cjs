#!/usr/bin/env node
/** @file CommonJS CLI entry point for launching the built package. */
const digitalPuddleSimulator = require('../dist/index.cjs');

const app = digitalPuddleSimulator.simulation();
const port = Number(process.env.PORT) || 3300;

app
  .listen(port)
  .then(() => {
    console.log(
      `DigitalPuddle simulation server started at http://localhost:${port}\nVisit http://localhost:${port}/simulation to view all available routes.`
    );
  })
  .catch((error) => {
    console.error('Failed to start the DigitalPuddle simulation server', error);
    process.exitCode = 1;
  });
