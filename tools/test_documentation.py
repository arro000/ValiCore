"""Check repository-owned Markdown links without networking or build artifacts."""

from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"\[[^\]\n]*\]\(([^)\n]+)\)")


def local_target(document: Path, reference: str) -> Path | None:
    url = urlsplit(reference.strip().split()[0])
    if url.scheme or url.netloc or not url.path:
        return None
    return (document.parent / unquote(url.path)).resolve()


def documents() -> list[Path]:
    roots = list(ROOT.glob("*.md"))
    roots.extend((ROOT / ".github").rglob("*.md"))
    roots.extend((ROOT / "docs").glob("*.md"))
    roots.extend((ROOT / "crates").rglob("README.md"))
    for name in ("packages/js", "packages/python", "tools", "tests", "data", "artifacts"):
        path = ROOT / name / "README.md"
        if path.is_file():
            roots.append(path)
    return sorted(roots)


class DocumentationTests(unittest.TestCase):
    def test_contributor_policies_and_pr_template_are_checked(self):
        checked = set(documents())
        for relative in ("CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md",
                         "CHANGELOG.md", ".github/PULL_REQUEST_TEMPLATE.md",
                         "packages/python/README.md"):
            with self.subTest(document=relative):
                self.assertIn(ROOT / relative, checked)

    def test_local_links_point_to_repository_files(self):
        for document in documents():
            for match in LINK.finditer(document.read_text(encoding="utf-8")):
                target = local_target(document, match.group(1))
                if target is None:
                    continue
                with self.subTest(document=str(document.relative_to(ROOT)), link=match.group(1)):
                    self.assertTrue(target.is_relative_to(ROOT), "Link leaves the repository")
                    self.assertTrue(target.exists(), f"Missing link target: {target}")

    def test_external_and_anchor_links_require_no_network(self):
        document = ROOT / "docs/README.md"
        for reference in ("https://example.org/file", "mailto:owner@example.org", "#section"):
            self.assertIsNone(local_target(document, reference))
        self.assertEqual(local_target(document, "../PRD.md#roadmap"), ROOT / "PRD.md")


if __name__ == "__main__":
    unittest.main(verbosity=2)
