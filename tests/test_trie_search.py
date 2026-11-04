"""
Unit Tests for Bounded Trie Levenshtein Search Engine
Ticket: DEV-ALGO-101 (OPAC Typo-Tolerant Catalog Search)
Course: ALGOCOM × SOFTENG (PBL Milestone 1)
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.trie_levenshtein import TrieLevenshteinEngine


class TestTrieLevenshteinEngine(unittest.TestCase):

    def setUp(self):
        self.engine = TrieLevenshteinEngine()
        self.sample_books = [
            {
                "title": "Introduction to Algorithms",
                "author": "Thomas H. Cormen",
                "call_number": "005.133 COR",
                "isbn": "9780262046373",
                "metadata": {"book_id": "B-001", "popularity_score": 1.8}
            },
            {
                "title": "Artificial Intelligence: A Modern Approach",
                "author": "Stuart Russell and Peter Norvig",
                "call_number": "006.3 RUS",
                "isbn": "9780134610992",
                "metadata": {"book_id": "B-002", "popularity_score": 1.5}
            },
            {
                "title": "Database System Concepts",
                "author": "Abraham Silberschatz",
                "call_number": "005.74 SIL",
                "isbn": "9780073523323",
                "metadata": {"book_id": "B-003", "popularity_score": 1.2}
            },
            {
                "title": "Operating System Concepts",
                "author": "Abraham Silberschatz",
                "call_number": "005.43 SIL",
                "isbn": "9781119800361",
                "metadata": {"book_id": "B-004", "popularity_score": 1.1}
            },
            {
                "title": "Philippine History and Culture",
                "author": "Teodoro Agoncillo",
                "call_number": "959.9 AGO",
                "isbn": "9789711003449",
                "metadata": {"book_id": "B-005", "popularity_score": 1.0}
            }
        ]
        for b in self.sample_books:
            self.engine.insert_book(
                title=b["title"],
                author=b["author"],
                call_number=b["call_number"],
                isbn=b["isbn"],
                metadata=b["metadata"]
            )

    def test_exact_match_zero_distance(self):
        """Exact query should match with edit distance = 0 and sub-5ms latency."""
        results, telemetry = self.engine.search("algorithms", max_cost=0)
        self.assertEqual(telemetry["status"], "SUCCESS")
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].edit_distance, 0)
        self.assertEqual(results[0].matched_token, "algorithms")
        self.assertEqual(results[0].title, "Introduction to Algorithms")
        self.assertLess(telemetry["execution_time_ms"], 5.0)

    def test_single_typo_distance_one(self):
        """Typo with 1 missing character ('algoritm' for 'algorithm') should match d=1."""
        results, telemetry = self.engine.search("algoritm", max_cost=2)
        self.assertEqual(telemetry["status"], "SUCCESS")
        self.assertGreater(len(results), 0)
        self.assertIn(results[0].edit_distance, [1, 2])
        self.assertEqual(results[0].title, "Introduction to Algorithms")

    def test_transposition_and_substitution(self):
        """Typo 'Artifitial' (c -> t) should match 'Artificial' at d=1."""
        results, telemetry = self.engine.search("artifitial", max_cost=2)
        self.assertEqual(telemetry["status"], "SUCCESS")
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].edit_distance, 1)
        self.assertEqual(results[0].title, "Artificial Intelligence: A Modern Approach")

    def test_dewey_call_number_search(self):
        """Exact and prefix Dewey call number search."""
        results, _ = self.engine.search("005.74", max_cost=0)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].title, "Database System Concepts")

    def test_author_surname_search(self):
        """Typo on author surname 'Russel' (missing l) should match 'Russell'."""
        results, _ = self.engine.search("russel", max_cost=1)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0].title, "Artificial Intelligence: A Modern Approach")

    def test_empty_query_guard(self):
        """Empty or whitespace query must return immediately with EMPTY_QUERY status in < 1ms."""
        results, telemetry = self.engine.search("   ", max_cost=2)
        self.assertEqual(results, [])
        self.assertEqual(telemetry["status"], "EMPTY_QUERY")
        self.assertLess(telemetry["execution_time_ms"], 1.0)

    def test_query_length_boundary_clamp(self):
        """Query > 64 characters should be clamped to 64 chars without memory crash."""
        long_query = "A" * 120
        results, telemetry = self.engine.search(long_query, max_cost=2)
        self.assertEqual(len(telemetry["query_executed"]), 64)

    def test_branch_pruning_zero_false_positives(self):
        """Query completely unrelated (distance > 2) must not produce matching candidates."""
        results, telemetry = self.engine.search("xylophone", max_cost=2)
        self.assertEqual(results, [])
        self.assertEqual(telemetry["status"], "NO_MATCHES")
        self.assertGreater(telemetry["branches_pruned"], 0)


if __name__ == "__main__":
    unittest.main()
