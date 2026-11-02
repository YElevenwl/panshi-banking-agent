import { runFormula } from "../sandbox/runner.js";

export function formula(params) {
  return runFormula({ formula: params.formula, variables: params.variables || {} });
}
