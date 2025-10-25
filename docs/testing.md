# Testing Guide

## Prerequisites
- Install dependencies with `npm install`.

## Commands
- `npm run test` – executes the Vitest suite with the Happy DOM environment.
- `npm run test:watch` – runs the same suite in watch mode for iterative development.

## Notes
- Core game logic coverage lives in `src/game/__tests__`.
- The setup file `vitest.setup.ts` wires `@testing-library/jest-dom` so future component tests can assert DOM expectations.
- Happy DOM emulates the browser environment; switch to Jsdom only if you need APIs that Happy DOM lacks.

