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

    def test_reject_path_arguments(self):
        for name in ["", ".", "..", "../incidente.md", "/tmp/incidente.md", "sub/tema.md", "sub\\tema.md"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                resolve(self.root, name)

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
