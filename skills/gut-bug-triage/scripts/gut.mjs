#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const axes = ['g', 'u', 't'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireObject(value, path) {
  if (!isObject(value)) throw new Error(`${path}: esperado objeto.`);
}
function requireText(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path}: esperado texto não vazio.`);
}
function requireKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key}: campo não reconhecido.`);
  }
}
function integerScore(value, path) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${path}: nota deve ser inteiro de 1 a 5.`);
  }
}
function bounds(value, path) {
  if (value === null) return [1, 5];
  if (isObject(value)) {
    requireKeys(value, ['min', 'max'], path);
    integerScore(value.min, `${path}.min`);
    integerScore(value.max, `${path}.max`);
    if (value.min >= value.max) throw new Error(`${path}: intervalo exige min < max; use inteiro para nota pontual.`);
    return [value.min, value.max];
  }
  integerScore(value, path);
  return [value, value];
}

// Deterministic arithmetic only: the caller supplies the project-specific assessment.
export function calculate(input) {
  requireObject(input, 'entrada');
  requireKeys(input, ['context', 'issues'], 'entrada');
  requireObject(input.context, 'context');
  requireKeys(input.context, ['project', 'rubricVersion', 'assessedAt'], 'context');
  for (const key of ['project', 'rubricVersion', 'assessedAt']) requireText(input.context[key], `context.${key}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.context.assessedAt)
      || !Number.isFinite(Date.parse(input.context.assessedAt))) {
    throw new Error('context.assessedAt: esperado timestamp ISO 8601 com fuso.');
  }
  if (!Array.isArray(input.issues) || !input.issues.length) throw new Error('issues: esperado array não vazio.');
  const ids = new Set();
  const ranked = [], provisional = [], escalations = [];
  for (const [index, issue] of input.issues.entries()) {
    const path = `issues[${index}]`;
    requireObject(issue, path);
    requireKeys(issue, ['id', 'title', ...axes, 'justification', 'evidence', 'override'], path);
    requireText(issue.id, `${path}.id`);
    requireText(issue.title, `${path}.title`);
    if (ids.has(issue.id.trim())) throw new Error(`${path}.id: identificador duplicado.`);
    ids.add(issue.id.trim());
    requireObject(issue.justification, `${path}.justification`);
    requireKeys(issue.justification, axes, `${path}.justification`);
    const limits = axes.map(axis => {
      requireText(issue.justification[axis], `${path}.justification.${axis}`);
      return bounds(issue[axis], `${path}.${axis}`);
    });
    if (!Array.isArray(issue.evidence) || !issue.evidence.length) throw new Error(`${path}.evidence: esperado array não vazio.`);
    issue.evidence.forEach((item, i) => requireText(item, `${path}.evidence[${i}]`));
    if (Object.hasOwn(issue, 'override')) {
      requireObject(issue.override, `${path}.override`);
      requireKeys(issue.override, ['reason', 'source'], `${path}.override`);
      requireText(issue.override.reason, `${path}.override.reason`);
      requireText(issue.override.source, `${path}.override.source`);
    }
    const min = limits.reduce((product, [lower]) => product * lower, 1);
    const max = limits.reduce((product, [, upper]) => product * upper, 1);
    const status = min === max ? 'point' : 'provisional';
    const result = { ...issue, status, score: status === 'point' ? min : null, scoreRange: { min, max } };
    if (Object.hasOwn(issue, 'override')) escalations.push(result);
    else if (status === 'point') ranked.push(result);
    else provisional.push(result);
  }
  // Stable sort preserves display order for equal scores, without breaking the tie.
  ranked.sort((a, b) => b.score - a.score);
  let rank = 0;
  ranked.forEach((issue, index) => {
    if (index === 0 || issue.score !== ranked[index - 1].score) rank = index + 1;
    issue.rank = rank;
  });
  return {
    context: input.context,
    formula: 'G × U × T',
    tiePolicy: 'competition-ranking; input order only for display',
    escalations,
    ranked,
    provisional,
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Uso: node gut.mjs <entrada.json|->\nSaída: JSON; - lê stdin. Não atribui notas nem altera arquivos.\n');
    return;
  }
  if (args.length !== 1 || (args[0].startsWith('-') && args[0] !== '-')) {
    throw new Error('Uso: node gut.mjs <entrada.json|-> (ou --help).');
  }
  let data;
  if (args[0] === '-') {
    process.stdin.setEncoding('utf8');
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    data = chunks.join('');
  } else {
    data = await readFile(args[0], 'utf8');
  }
  process.stdout.write(`${JSON.stringify(calculate(JSON.parse(data)), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`GUT: ${error.message}\n`);
    process.exitCode = 1;
  });
}
