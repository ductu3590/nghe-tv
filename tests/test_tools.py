import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class FeedCheckerTest(unittest.TestCase):
    def test_parses_a_local_feed_without_network(self):
        sample = ROOT / 'tests' / 'fixtures' / 'sample.xml'
        result = subprocess.run([sys.executable, '-I', str(ROOT / 'tools' / 'check_feeds.py'), '--file', str(sample)],
                                capture_output=True, encoding='utf-8', check=True)
        self.assertIn('1/2 items with audio', result.stdout)
        self.assertIn("types ['audio/mpeg']", result.stdout)

    def test_output_survives_a_cp1252_console(self):
        # Windows CI pipes output as cp1252; ✓ and Vietnamese text must not crash the tool.
        sample = ROOT / 'tests' / 'fixtures' / 'sample.xml'
        env = dict(os.environ, PYTHONIOENCODING='cp1252')
        result = subprocess.run([sys.executable, str(ROOT / 'tools' / 'check_feeds.py'), '--file', str(sample)],
                                capture_output=True, env=env, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', 'replace'))
        self.assertIn('1/2 items with audio', result.stdout.decode('utf-8'))

    def test_lists_every_rss_source_of_the_app(self):
        sys.path.insert(0, str(ROOT / 'tools'))
        try:
            import check_feeds
        finally:
            sys.path.pop(0)
        sources = check_feeds.rss_sources(ROOT / 'app' / 'sources.json')
        self.assertGreaterEqual(len(sources), 20)
        self.assertTrue(all(url.startswith('https://') for _, url in sources))

    def test_sources_json_is_valid_json_with_tabs(self):
        data = json.loads((ROOT / 'app' / 'sources.json').read_text(encoding='utf-8'))
        self.assertTrue(all(source['url'].startswith('https://') for tab in data['tabs'] for source in tab['sources']))


if __name__ == '__main__':
    unittest.main()
