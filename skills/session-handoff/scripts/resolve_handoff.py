#!/usr/bin/env python3
"""Resolve the project's handoff directory/file without writing or executing it."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import yaml


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in mapping:
            raise ValueError("Configuração com chave inválida ou duplicada.")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping
)


def handoff_directory(root):
    root = Path(root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("A raiz do projeto deve ser um diretório.")
    config = root / "_meta/session-handoff.yaml"
    value, source = "_meta/handoff/in-progress", "default"
    if config.exists() or config.is_symlink():
        data = yaml.load(config.read_text(encoding="utf-8"), Loader=UniqueKeyLoader)
        if data is None:
            data = {}
        if not isinstance(data, dict):
            raise ValueError("A configuração precisa ser um mapa YAML.")
        if "handoff" in data:
            settings = data["handoff"]
            if not isinstance(settings, dict):
                raise ValueError("handoff precisa ser um mapa YAML.")
            if "path" in settings:
                value = settings["path"]
                if not isinstance(value, str) or not value.strip():
                    raise ValueError("handoff.path precisa ser string não vazia.")
                source = "_meta/session-handoff.yaml:handoff.path"
    directory = Path(value).expanduser()
    if not directory.is_absolute():
        directory = root / directory
    directory = directory.resolve()
    if directory.exists() and not directory.is_dir():
        raise ValueError("O destino configurado não é um diretório.")
    return root, directory, source


def resolve(root, name=None):
    root, directory, source = handoff_directory(root)
    result = {"root": str(root), "directory": str(directory), "source": source}
    if name is None:
        return result
    if not name or name in {".", ".."} or any(c in name for c in ("/", "\\", "\0")):
        raise ValueError("Informe somente um nome de arquivo dentro do diretório.")
    names = [name] if Path(name).suffix else [name, name + ".md"]
    matches = []
    for candidate in names:
        path = directory / candidate
        if path.exists():
            target = path.resolve(strict=True)
            if not target.is_relative_to(directory):
                raise ValueError("O arquivo aponta para fora do diretório de handoffs.")
            if not target.is_file():
                raise ValueError("O candidato não é um arquivo regular.")
            matches.append(target)
    if len(matches) != 1:
        candidates = sorted(p.name for p in directory.iterdir() if p.is_file()) if directory.is_dir() else []
        result.update({"error": "ambiguous" if matches else "not_found", "candidates": candidates})
        return result
    result.update({"file": str(matches[0]), "sha256": hashlib.sha256(matches[0].read_bytes()).hexdigest()})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", nargs="?")
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    try:
        result = resolve(args.root, args.name)
    except (OSError, ValueError, yaml.YAMLError):
        # Do not echo YAML parser snippets: configuration may contain private values.
        print(json.dumps({"error": "invalid_input", "message": "Raiz, configuração ou nome inválido; confira a configuração e as regras da skill."}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if "error" in result else 0


if __name__ == "__main__":
    sys.exit(main())
