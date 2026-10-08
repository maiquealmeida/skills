import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { CliError } from "../lib/errors.mjs";
import { hashLayout, hashMatchesPrefix, isTrusted, saveTrust, shortHash, trustFilePath } from "../lib/trust.mjs";

const IS_WINDOWS = process.platform === "win32";

let dir;
let file;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "orca-layout-trust-"));
  file = join(dir, "state", "trusted.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("trustFilePath", () => {
  test("ORCA_LAYOUT_STATE_DIR redireciona o diretório", () => {
    assert.equal(trustFilePath({ ORCA_LAYOUT_STATE_DIR: "/tmp/x" }), join("/tmp/x", "trusted.json"));
  });

  test("por padrão fica em ~/.config/orca-layout", () => {
    assert.equal(trustFilePath({}), join(homedir(), ".config", "orca-layout", "trusted.json"));
  });
});

describe("hashLayout", () => {
  test("é estável e muda com qualquer byte", () => {
    assert.equal(hashLayout("abc"), hashLayout("abc"));
    assert.notEqual(hashLayout("abc"), hashLayout("abc "));
    assert.match(hashLayout("abc"), /^[0-9a-f]{64}$/);
  });
});

describe("hash curto e confirmação por prefixo", () => {
  const hash = hashLayout("conteúdo revisado");

  test("o hash curto tem 16 caracteres e é prefixo do completo", () => {
    assert.equal(shortHash(hash).length, 16);
    assert.ok(hash.startsWith(shortHash(hash)));
  });

  test("aceita o hash curto, o completo e maiúsculas", () => {
    assert.equal(hashMatchesPrefix(hash, shortHash(hash)), true);
    assert.equal(hashMatchesPrefix(hash, hash), true);
    assert.equal(hashMatchesPrefix(hash, shortHash(hash).toUpperCase()), true);
    assert.equal(hashMatchesPrefix(hash, hash.slice(0, 12)), true);
  });

  test("recusa prefixo curto demais, não hexadecimal, de outro conteúdo ou ausente", () => {
    assert.equal(hashMatchesPrefix(hash, hash.slice(0, 11)), false, "mínimo de 12 caracteres");
    assert.equal(hashMatchesPrefix(hash, "xyz".repeat(5)), false);
    assert.equal(hashMatchesPrefix(hash, shortHash(hashLayout("outro conteúdo"))), false);
    assert.equal(hashMatchesPrefix(hash, undefined), false);
    assert.equal(hashMatchesPrefix(hash, ""), false);
  });
});

describe("arquivo de confiança", () => {
  test("só o dono lê: diretório 0700 e arquivo 0600", { skip: IS_WINDOWS }, () => {
    saveTrust(file, "/r/a.layout.json", hashLayout("x"));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(file)).mode & 0o777, 0o700);
  });

  test("a escrita é atômica: não sobra arquivo temporário", () => {
    saveTrust(file, "/r/a.layout.json", hashLayout("x"));
    saveTrust(file, "/r/b.layout.json", hashLayout("y"));
    assert.deepEqual(readdirSync(dirname(file)), ["trusted.json"]);
  });

  test("falha ao gravar também não deixa temporário para trás", () => {
    const blocker = join(dir, "arquivo");
    writeFileSync(blocker, "x");
    assert.throws(() => saveTrust(join(blocker, "sub", "trusted.json"), "/r/a.layout.json", "h"), CliError);
    assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
  });
});

describe("confiança", () => {
  test("nada é confiável de início", () => {
    assert.equal(isTrusted(file, "/r/.orca/layouts/a.layout.json", hashLayout("x")), false);
  });

  test("salvar torna o conteúdo confiável, e cria o diretório", () => {
    saveTrust(file, "/r/.orca/layouts/a.layout.json", hashLayout("x"));
    assert.equal(isTrusted(file, "/r/.orca/layouts/a.layout.json", hashLayout("x")), true);
  });

  test("conteúdo alterado deixa de ser confiável", () => {
    saveTrust(file, "/r/.orca/layouts/a.layout.json", hashLayout("x"));
    assert.equal(isTrusted(file, "/r/.orca/layouts/a.layout.json", hashLayout("x2")), false);
  });

  test("a confiança é por arquivo", () => {
    saveTrust(file, "/r/.orca/layouts/a.layout.json", hashLayout("x"));
    assert.equal(isTrusted(file, "/r/.orca/layouts/b.layout.json", hashLayout("x")), false);
  });

  test("salvar outro arquivo preserva os anteriores", () => {
    saveTrust(file, "/r/a.layout.json", hashLayout("a"));
    saveTrust(file, "/r/b.layout.json", hashLayout("b"));
    assert.equal(isTrusted(file, "/r/a.layout.json", hashLayout("a")), true);
    assert.equal(isTrusted(file, "/r/b.layout.json", hashLayout("b")), true);
  });

  test("arquivo de confiança corrompido não confia em nada, e é reescrito ao salvar", () => {
    saveTrust(file, "/r/a.layout.json", hashLayout("a"));
    writeFileSync(file, "{ corrompido");
    assert.equal(isTrusted(file, "/r/a.layout.json", hashLayout("a")), false);
    saveTrust(file, "/r/a.layout.json", hashLayout("a"));
    assert.equal(isTrusted(file, "/r/a.layout.json", hashLayout("a")), true);
  });

  test("falha ao gravar vira CliError com o motivo", () => {
    const blocker = join(dir, "arquivo");
    writeFileSync(blocker, "x");
    assert.throws(() => saveTrust(join(blocker, "sub", "trusted.json"), "/r/a.layout.json", "h"), CliError);
  });
});
