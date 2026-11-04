"""
Project LIBRAS: OPAC Fuzzy Catalog Search Engine
Algorithm 1: Bounded Trie Levenshtein Automaton Search
Course: ALGOCOM × SOFTENG (PBL Milestone 1)
Academic Year 2026–2027 • Section III-BCSAD • Group 1

Implements Dynamic Programming edit-distance state transitions over a
directed acyclic Trie prefix tree with recursive branch-and-bound pruning.
Supports both token-level and phrase-level bibliographic indexing.
"""

import time
import re
import unicodedata
from typing import Dict, List, Optional, Tuple, Any, Set


class SearchResult:
    """Represents a matched bibliographic record with similarity telemetry."""
    __slots__ = ("matched_token", "edit_distance", "similarity_score", "metadata", "title")

    def __init__(
        self,
        matched_token: str,
        edit_distance: int,
        similarity_score: float,
        metadata: Optional[Dict[str, Any]] = None,
        title: str = ""
    ):
        self.matched_token = matched_token
        self.edit_distance = edit_distance
        self.similarity_score = round(similarity_score, 4)
        self.metadata = metadata or {}
        self.title = title or self.metadata.get("title", matched_token)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "matched_token": self.matched_token,
            "title": self.title,
            "edit_distance": self.edit_distance,
            "similarity_score": self.similarity_score,
            "metadata": self.metadata,
        }

    def __repr__(self) -> str:
        return f"<SearchResult token='{self.matched_token}' title='{self.title}' d={self.edit_distance} score={self.similarity_score}>"


class TrieNode:
    """Node in the bibliographic Trie prefix tree."""
    __slots__ = ("children", "is_word_end", "full_token", "records")

    def __init__(self):
        self.children: Dict[str, "TrieNode"] = {}
        self.is_word_end: bool = False
        self.full_token: Optional[str] = None
        # Stores list of associated book metadata records containing this token
        self.records: List[Dict[str, Any]] = []


class TrieLevenshteinEngine:
    """
    Bounded Trie Levenshtein Search Engine for catalog titles, authors,
    and Dewey Decimal / Library of Congress call numbers.
    """

    def __init__(self):
        self.root = TrieNode()
        self.total_tokens = 0
        self.total_records = 0

    @staticmethod
    def normalize_text(text: str) -> str:
        """Applies Unicode NFKC normalization, strips punctuation, and lowercases."""
        if not text:
            return ""
        norm = unicodedata.normalize("NFKC", str(text).strip().lower())
        return norm

    @classmethod
    def tokenize(cls, text: str) -> List[str]:
        """Splits bibliographic text into normalized tokens, preserving call numbers."""
        norm = cls.normalize_text(text)
        if not norm:
            return []
        # Split by spaces and standard punctuation, while preserving dot-separated call numbers
        tokens = [t for t in re.split(r"[\s,:;\-_/()]+", norm) if len(t) >= 2]
        return tokens

    def insert_token(self, token: str, record_metadata: Optional[Dict[str, Any]] = None) -> None:
        """
        Inserts a single word/token into the Trie.
        Time Complexity: O(L) where L is token length.
        """
        norm_token = self.normalize_text(token)
        if not norm_token or len(norm_token) < 2:
            return

        current = self.root
        for char in norm_token:
            if char not in current.children:
                current.children[char] = TrieNode()
            current = current.children[char]

        if not current.is_word_end:
            self.total_tokens += 1
            current.is_word_end = True
            current.full_token = norm_token

        if record_metadata:
            # Avoid duplicate references under the same token
            book_id = record_metadata.get("book_id", record_metadata.get("title"))
            if not any(r.get("book_id", r.get("title")) == book_id for r in current.records):
                current.records.append(record_metadata)

    def insert_book(
        self,
        title: str,
        author: str = "",
        call_number: str = "",
        isbn: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Indexes a full bibliographic catalog entry across all its tokens
        (title words, author names, call numbers, and full title phrase).
        """
        record = dict(metadata or {})
        record["title"] = title
        record["author"] = author
        record["call_number"] = call_number
        record["isbn"] = isbn
        self.total_records += 1

        # Index the full title phrase
        self.insert_token(title, record)

        # Index individual title tokens
        for token in self.tokenize(title):
            self.insert_token(token, record)

        # Index author tokens
        for token in self.tokenize(author):
            self.insert_token(token, record)

        # Index call number
        if call_number:
            self.insert_token(call_number, record)
            for token in self.tokenize(call_number):
                self.insert_token(token, record)

        # Index ISBN
        if isbn:
            clean_isbn = re.sub(r"[^0-9X]", "", isbn.upper())
            if clean_isbn:
                self.insert_token(clean_isbn, record)

    def search(
        self,
        query: str,
        max_cost: int = 2,
        limit: int = 10
    ) -> Tuple[List[SearchResult], Dict[str, Any]]:
        """
        Executes bounded approximate string matching using dynamic programming
        row transitions with branch-and-bound pruning.

        :param query: Raw patron query string (max 64 characters)
        :param max_cost: Bounded Levenshtein radius (k_max in {1, 2})
        :param limit: Maximum candidate count to return
        :return: (List[SearchResult], telemetry_dict)
        """
        start_time = time.perf_counter()

        # Edge-Case Guard 1: Empty or whitespace query
        norm_query = self.normalize_text(query)
        if not norm_query:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return [], {
                "status": "EMPTY_QUERY",
                "execution_time_ms": round(duration_ms, 3),
                "nodes_visited": 0,
                "branches_pruned": 0,
                "total_matches": 0,
            }

        # Edge-Case Guard 2: Max length boundary clamp (64 chars)
        if len(norm_query) > 64:
            norm_query = norm_query[:64]

        # Clamp max_cost to valid bound [0, 2]
        max_cost = max(0, min(2, max_cost))

        # Initial DP row 0: distances from an empty prefix to all prefixes of query
        m = len(norm_query)
        initial_row = list(range(m + 1))

        raw_matches: List[Tuple[str, int, List[Dict[str, Any]]]] = []
        stats = {"nodes_visited": 0, "branches_pruned": 0}

        # Traverse each child branch of the root node
        for char, child_node in self.root.children.items():
            self._traverse_branch(
                node=child_node,
                letter=char,
                prev_row=initial_row,
                query=norm_query,
                max_cost=max_cost,
                raw_matches=raw_matches,
                stats=stats,
            )

        # Deduplicate and build ranked SearchResult items
        seen_books: Set[str] = set()
        results: List[SearchResult] = []

        for token, dist, records in raw_matches:
            max_len = max(m, len(token))
            base_score = 1.0 - (dist / max_len) if max_len > 0 else 1.0

            if records:
                for rec in records:
                    book_key = rec.get("book_id", rec.get("title", token))
                    if book_key in seen_books:
                        continue
                    seen_books.add(book_key)

                    popularity = rec.get("popularity_score", 1.0)
                    composite_score = base_score * popularity
                    results.append(SearchResult(
                        matched_token=token,
                        edit_distance=dist,
                        similarity_score=composite_score,
                        metadata=rec,
                        title=rec.get("title", token)
                    ))
            else:
                if token not in seen_books:
                    seen_books.add(token)
                    results.append(SearchResult(
                        matched_token=token,
                        edit_distance=dist,
                        similarity_score=base_score,
                        metadata={},
                        title=token
                    ))

        # Sort matches by edit distance ASC, then similarity score DESC
        results.sort(key=lambda x: (x.edit_distance, -x.similarity_score))
        if len(results) > limit:
            results = results[:limit]

        duration_ms = (time.perf_counter() - start_time) * 1000

        telemetry = {
            "status": "SUCCESS" if results else "NO_MATCHES",
            "query_executed": norm_query,
            "execution_time_ms": round(duration_ms, 3),
            "nodes_visited": stats["nodes_visited"],
            "branches_pruned": stats["branches_pruned"],
            "total_matches": len(results),
        }

        return results, telemetry

    def _traverse_branch(
        self,
        node: TrieNode,
        letter: str,
        prev_row: List[int],
        query: str,
        max_cost: int,
        raw_matches: List[Tuple[str, int, List[Dict[str, Any]]]],
        stats: Dict[str, int]
    ) -> None:
        """
        Recursive Trie branch exploration computing the DP transition row.
        Enforces the Branch-and-Bound Pruning Invariant:
        If min(current_row) > max_cost, prune entire subtree immediately.
        """
        stats["nodes_visited"] += 1
        m = len(query)

        # Build current DP row: current_row[0] = prev_row[0] + 1 (insertion cost)
        current_row = [prev_row[0] + 1]

        for c in range(1, m + 1):
            insert_or_del = min(current_row[c - 1] + 1, prev_row[c] + 1)
            if query[c - 1] == letter:
                sub_cost = prev_row[c - 1]
            else:
                sub_cost = prev_row[c - 1] + 1
            current_row.append(min(insert_or_del, sub_cost))

        # Check candidate match condition at word boundaries
        if current_row[m] <= max_cost and node.is_word_end and node.full_token:
            raw_matches.append((node.full_token, current_row[m], node.records))

        # BRANCH-AND-BOUND PRUNING INVARIANT:
        # If the minimum value in current_row exceeds max_cost, all descendant
        # paths will strictly have edit distances > max_cost. Prune branch!
        if min(current_row) <= max_cost:
            for next_char, next_child in node.children.items():
                self._traverse_branch(
                    node=next_child,
                    letter=next_char,
                    prev_row=current_row,
                    query=query,
                    max_cost=max_cost,
                    raw_matches=raw_matches,
                    stats=stats,
                )
        else:
            stats["branches_pruned"] += 1
