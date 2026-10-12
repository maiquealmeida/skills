import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from resolve_handoff import resolve
import yaml


class ResolveHandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def config(self, text):
        path = self.root / "_meta/session-handoff.yaml"
        path.parent.mkdir(exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def document(self, directory, name="incidente.md"):
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / name
        path.write_text("# Estado observado\nCausa ainda desconhecida.\n", encoding="utf-8")
        return path

    def test_create_resolution_does_not_write(self):
        result = resolve(self.root)
        self.assertEqual(result["directory"], str(self.root / "_meta/handoff/in-progress"))
        self.assertEqual(result["source"], "default")
        self.assertEqual(list(self.root.iterdir()), [])

    def test_relative_config_is_literal_final_directory(self):
        self.config("handoff:\n  path: _meta/handoff\n")
        self.assertEqual(resolve(self.root)["directory"], str(self.root / "_meta/handoff"))

    def test_absolute_config(self):
        directory = self.root / "outside-project"
        project = self.root / "project"
        project.mkdir()
        self.root = project
        self.config("handoff:\n  path: " + json.dumps(str(directory)) + "\n")
        self.assertEqual(resolve(self.root)["directory"], str(directory))

    def test_home_expansion(self):
        self.config("handoff:\n  path: ~/handoff-fixture\n")
        self.assertEqual(resolve(self.root)["directory"], str(Path.home() / "handoff-fixture"))

    def test_missing_property_defaults(self):
        for config in ["", "other: true\n", "handoff: {}\n"]:
            with self.subTest(config=config):
                self.config(config)
                self.assertEqual(resolve(self.root)["source"], "default")

    def test_invalid_config_does_not_fallback(self):
        for config in ["handoff: null", "handoff: []", "handoff: {path: null}",
                       "handoff: {path: 5}", "handoff: {path: ''}", "[]",
                       "handoff: {path: one, path: two}", "handoff: {path: [}"]:
            with self.subTest(config=config):
                self.config(config)
                with self.assertRaises((ValueError, yaml.YAMLError)):
                    resolve(self.root)

    def test_exact_and_extensionless_read_resolve_same_file_and_hash(self):
        path = self.document(self.root / "_meta/handoff/in-progress")
        for name in ["incidente", "incidente.md"]:
            result = resolve(self.root, name)
            self.assertEqual(result["file"], str(path))
            self.assertEqual(result["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_explicit_other_extension_and_spaces(self):
        path = self.document(self.root / "_meta/handoff/in-progress", "tema separado.txt")
        self.assertEqual(resolve(self.root, "tema separado.txt")["file"], str(path))

    def test_two_matching_names_are_ambiguous(self):
        directory = self.root / "_meta/handoff/in-progress"
        self.document(directory, "incidente")
        self.document(directory)
        result = resolve(self.root, "incidente")
        self.assertEqual(result["error"], "ambiguous")
        self.assertNotIn("file", result)

    def test_missing_file_does_not_create_or_choose_another(self):
        self.document(self.root / "_meta/handoff/in-progress", "outro.md")
        result = resolve(self.root, "ausente")
        self.assertEqual(result["error"], "not_found")
        self.assertEqual(result["candidates"], ["outro.md"])
        self.assertNotIn("file", result)

    def test_reject_invalid_file_arguments(self):
        for name in ["", ".", "..", "sub/", "sub/.", "sub/..", "sub\\tema.md", "bad\0name"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                resolve(self.root, name)

    def test_relative_explicit_paths_outside_default_including_archived_and_spaces(self):
        for folder in ["docs/incidentes/ativos/runpod-falhas-intermitentes",
                       "docs/incidentes/arquivados/runpod-falhas-intermitentes",
                       "docs/handoffs com espaços"]:
            path = self.document(self.root / folder, "tema separado.md")
            for argument in [str(path.relative_to(self.root)),
                             str(path.relative_to(self.root).with_suffix(""))]:
                with self.subTest(argument=argument):
                    result = resolve(self.root, argument)
                    self.assertEqual(result["file"], str(path))
                    self.assertEqual(result["source"], "explicit_path")
                    self.assertEqual(result["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
                    self.assertEqual(result["root"], str(self.root))
        self.assertFalse((self.root / "_meta").exists())

    def test_absolute_and_parent_relative_paths_outside_project(self):
        path = self.document(self.root / "fora do projeto", "tema separado.md")
        project = self.root / "project"
        project.mkdir()
        for argument in [str(path), str(path.with_suffix("")),
                         "../fora do projeto/tema separado.md"]:
            with self.subTest(argument=argument):
                result = resolve(project, argument)
                self.assertEqual(result["file"], str(path))
                self.assertEqual(result["root"], str(project))
        self.assertEqual(list(project.iterdir()), [])

    def test_explicit_home_expansion(self):
        with tempfile.TemporaryDirectory(dir=Path.home(), prefix="handoff-test-") as temporary:
            path = self.document(Path(temporary) / "home fixture").resolve()
            argument = "~/" + str(path.relative_to(Path.home().resolve()))
            self.assertEqual(resolve(self.root, argument)["file"], str(path))

    def test_dot_slash_selects_project_root_instead_of_discovery(self):
        path = self.document(self.root)
        self.document(self.root / "_meta/handoff/in-progress")
        self.assertEqual(resolve(self.root, "./incidente")["file"], str(path))

    def test_custom_config_basename_with_spaces(self):
        directory = self.root / "docs/incidentes/ativos/caso com espaços"
        path = self.document(directory)
        self.config("handoff:\n  path: docs/incidentes/ativos/caso com espaços\n")
        for argument in ["incidente", "incidente.md"]:
            result = resolve(self.root, argument)
            self.assertEqual(result["file"], str(path))
            self.assertEqual(result["source"], "_meta/session-handoff.yaml:handoff.path")

    def test_explicit_file_preserves_config_and_all_files(self):
        self.config("handoff: {path: discovery}\n")
        configured = self.document(self.root / "discovery")
        selected = self.document(self.root / "docs/archived")
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(resolve(self.root, str(selected))["file"], str(selected))
        after = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(resolve(self.root, "incidente")["file"], str(configured))

    def test_explicit_file_does_not_depend_on_invalid_config(self):
        self.config("handoff: {path: [}")
        path = self.document(self.root / "docs")
        self.assertEqual(resolve(self.root, "docs/incidente.md")["file"], str(path))
        with self.assertRaises(yaml.YAMLError):
            resolve(self.root, "incidente")

    def test_explicit_extension_is_exact(self):
        path = self.document(self.root / "docs", "tema.txt.md")
        result = resolve(self.root, "docs/tema.txt")
        self.assertEqual(result["error"], "not_found")
        self.assertTrue(path.exists())

    def test_explicit_extensionless_ambiguity_has_matching_paths_only(self):
        directory = self.root / "docs"
        first = self.document(directory, "incidente")
        second = self.document(directory)
        self.document(directory, "unrelated.md")
        result = resolve(self.root, "docs/incidente")
        self.assertEqual(result["error"], "ambiguous")
        self.assertEqual(result["candidates"], [str(first), str(second)])
        self.assertNotIn("file", result)

    def test_explicit_missing_file_does_not_fallback_or_create(self):
        self.document(self.root / "_meta/handoff/in-progress")
        for argument in ["docs/absent/incidente.md", "docs/absent/incidente"]:
            result = resolve(self.root, argument)
            self.assertEqual(result["error"], "not_found")
            self.assertEqual(result["candidates"], [])
            self.assertNotIn("file", result)
        self.assertFalse((self.root / "docs").exists())

    def test_explicit_directory_is_rejected(self):
        (self.root / "docs/folder.md").mkdir(parents=True)
        with self.assertRaises(ValueError):
            resolve(self.root, "docs/folder.md")

    def test_explicit_symlink_can_select_file_outside_discovery(self):
        outside = self.document(self.root / "outside")
        directory = self.root / "_meta/handoff/in-progress"
        directory.mkdir(parents=True)
        link = directory / "incidente.md"
        link.symlink_to(outside)
        self.assertEqual(resolve(self.root, str(link))["file"], str(outside))

    def test_cli_explicit_path_with_spaces_is_one_argument_and_root_relative(self):
        path = self.document(self.root / "docs com espaços", "tema separado.md")
        proc = subprocess.run([sys.executable, str(Path(__file__).with_name("resolve_handoff.py")),
                               "--root", str(self.root), "docs com espaços/tema separado.md"],
                              cwd=path.parent, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["file"], str(path))

    def test_cli_missing_and_ambiguous_explicit_paths_exit_with_error(self):
        self.document(self.root / "docs", "incidente")
        self.document(self.root / "docs")
        for argument, error in [("docs/missing.md", "not_found"), ("docs/incidente", "ambiguous")]:
            proc = subprocess.run([sys.executable, str(Path(__file__).with_name("resolve_handoff.py")),
                                   "--root", str(self.root), argument], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 2)
            self.assertEqual(json.loads(proc.stdout)["error"], error)
            self.assertNotIn("file", json.loads(proc.stdout))

    def test_reject_file_symlink_escape(self):
        outside = self.document(self.root / "outside")
        directory = self.root / "_meta/handoff/in-progress"
        directory.mkdir(parents=True)
        (directory / "incidente.md").symlink_to(outside)
        with self.assertRaises(ValueError):
            resolve(self.root, "incidente.md")

    def test_allow_configured_directory_symlink(self):
        directory = self.root / "chosen"
        path = self.document(directory)
        (self.root / "link").symlink_to(directory, target_is_directory=True)
        self.config("handoff: {path: link}")
        self.assertEqual(resolve(self.root, "incidente")["file"], str(path))

    def test_cli_error_does_not_echo_config_private_values(self):
        self.config("handoff: {path: [synthetic-private-config}")
        proc = subprocess.run([sys.executable, str(Path(__file__).with_name("resolve_handoff.py")),
                               "--root", str(self.root)], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 2)
        self.assertEqual(json.loads(proc.stdout)["error"], "invalid_input")
        self.assertNotIn("synthetic-private-config", proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
